'use strict';

/* ============================================================================
   Puerto Taxi · cliente web de referencia para la API .NET
   ----------------------------------------------------------------------------
   · Los tokens viven SOLO en memoria (nunca en localStorage/sessionStorage),
     así un XSS no puede robarlos de forma persistente.
   · Todo el contenido dinámico se pinta con textContent (nunca innerHTML).
   ========================================================================== */

const ZONES = [
  'Barrio El Carmen',
  'Puntarenas Centro',
  'El Cocal',
  'La Gran Chacarita',
  'El Boli',
  'Ant. Hospital y alrededores',
  'Caldera',
  'El Roble-Jireth',
  'Alrededores de Plamas-JuanitoMora',
  'Doña Cecilia-Almedros-Santa Rosa',
  'Feria-BarrrancaCentro-Cruce',
  'Costanera-Reseda-Chaguite',
];

const STATUS_LABEL = { Offline: 'Desconectado', Available: 'Disponible', OnTrip: 'En viaje' };
const TRIP_STATUS = {
  Pending: 'Buscando taxista',
  Accepted: 'Taxista asignado',
  InProgress: 'En viaje',
  Completed: 'Completado',
  Cancelled: 'Cancelado',
};
const TRIP_CLASS = {
  Pending: 'pending', Accepted: 'accepted', InProgress: 'inprogress',
  Completed: 'completed', Cancelled: 'cancelled',
};

const state = {
  role: 'passenger',
  session: null,     // { accessToken, refreshToken, user }
  phone: '',
  driverStatus: null,
  timer: null,
  chatTripId: null,
};

const $ = (id) => document.getElementById(id);

/* --------------------------------------------------------------- utilidades */

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function toast(message, isError = false) {
  const box = $('toast');
  box.textContent = message;
  box.classList.toggle('error', Boolean(isError));
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { box.hidden = true; }, 4500);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' });
}

function fmtPrice(value) {
  return value == null ? '' : '₡' + Number(value).toLocaleString('es-CR');
}

function empty(text) {
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  return p;
}

function badge(status) {
  const span = document.createElement('span');
  span.className = 'badge ' + (TRIP_CLASS[status] || '');
  span.textContent = TRIP_STATUS[status] || status;
  return span;
}

function tripCard(trip, actions = []) {
  const box = document.createElement('div');
  box.className = 'item';

  const head = document.createElement('div');
  head.className = 'item-head';
  const title = document.createElement('span');
  title.className = 'item-title';
  title.textContent = trip.zone;
  head.append(title, badge(trip.status));
  box.append(head);

  const lines = [
    trip.exactAddress,
    trip.driverName ? `Taxista: ${trip.driverName}${trip.driverPlate ? ' · ' + trip.driverPlate : ''}` : null,
    trip.passengerPhoneMasked ? `Teléfono: ${trip.passengerPhoneMasked}` : null,
    trip.price != null ? `Tarifa: ${fmtPrice(trip.price)}` : null,
    `Pago: ${trip.paymentMethod === 'Sinpe' ? 'SINPE Móvil' : 'Efectivo'}${trip.hasPet ? ' · con mascota' : ''}`,
    `Creado: ${fmtDate(trip.createdAtUtc)}`,
  ].filter(Boolean);

  for (const line of lines) {
    const p = document.createElement('div');
    p.className = 'item-sub';
    p.textContent = line;
    box.append(p);
  }

  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'item-actions';
    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      button.className = action.kind || 'ghost';
      button.addEventListener('click', action.onClick);
      row.append(button);
    }
    box.append(row);
  }

  return box;
}

function position() {
  const fallback = { latitude: 9.9763, longitude: -84.8384 }; // Puntarenas centro
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(fallback);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(fallback),
      { timeout: 5000, maximumAge: 30000 },
    );
  });
}

/* --------------------------------------------------------------------- API */

async function api(path, options = {}) {
  const { method = 'GET', body, anonymous = false, retried = false } = options;

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous && state.session) headers.Authorization = `Bearer ${state.session.accessToken}`;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Access token vencido: intenta rotar el refresh token una sola vez.
  if (response.status === 401 && !anonymous && !retried && state.session?.refreshToken) {
    if (await refreshSession()) return api(path, { ...options, retried: true });
  }

  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = new Error(data?.detail || data?.title || `Error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function refreshSession() {
  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ refreshToken: state.session.refreshToken }),
    });
    if (!response.ok) return false;
    setSession(await response.json());
    return true;
  } catch {
    return false;
  }
}

function setSession(auth) {
  state.session = {
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken,
    user: auth.user,
  };
  state.driverStatus = auth.user?.driver?.status ?? null;
  renderSession();
  startPolling();
}

async function logout() {
  const refreshToken = state.session?.refreshToken;
  state.session = null;
  state.driverStatus = null;
  stopPolling();
  closeChat();
  renderSession();

  if (refreshToken) {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
}

/* --------------------------------------------------------------- navegación */

function setRole(role) {
  state.role = role;
  document.querySelectorAll('.role-tab').forEach((tab) => {
    const active = tab.dataset.role === role;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  $('panel-passenger').hidden = role !== 'passenger';
  $('panel-driver').hidden = role !== 'driver';
  $('panel-admin').hidden = role !== 'admin';
  renderSession();
  startPolling();
}

function renderSession() {
  const user = state.session?.user ?? null;
  const role = user?.role ?? null;

  $('logout').hidden = !user;

  $('p-login').hidden = role === 'Passenger';
  $('p-app').hidden = role !== 'Passenger';

  $('d-login').hidden = role === 'Driver';
  $('d-app').hidden = role !== 'Driver';

  $('a-login').hidden = role === 'Admin';
  $('a-app').hidden = role !== 'Admin';

  if (role === 'Driver') updateDriverSummary();
  if (role !== 'Admin') closeChat();
}

function startPolling() {
  stopPolling();
  const role = state.session?.user?.role;
  if (!role) return;

  const sameTab =
    (role === 'Passenger' && state.role === 'passenger') ||
    (role === 'Driver' && state.role === 'driver') ||
    (role === 'Admin' && state.role === 'admin');
  if (!sameTab) return;

  const tick = () => {
    if (role === 'Passenger') loadPassengerTrips();
    if (role === 'Driver') loadDriverData();
    if (role === 'Admin') loadAdmin();
    if (state.chatTripId) loadChat();
  };

  tick();
  state.timer = setInterval(tick, 4000);
}

function stopPolling() {
  clearInterval(state.timer);
  state.timer = null;
}

/* ----------------------------------------------------------------- PASAJERO */

function initPassenger() {
  const select = $('p-zone');
  for (const zone of ZONES) {
    const option = document.createElement('option');
    option.value = zone;
    option.textContent = zone;
    select.append(option);
  }

  $('p-phone-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const phone = $('p-phone').value.trim();
    if (!phone) return toast('Escribe tu teléfono', true);
    try {
      const data = await api('/auth/otp/request', {
        method: 'POST', anonymous: true, body: { phone },
      });
      state.phone = phone;
      $('p-phone').disabled = true;
      $('p-verify-form').hidden = false;

      const dev = $('p-devcode');
      if (data?.devCode) {
        dev.textContent = `Modo desarrollo · código: ${data.devCode}`;
        dev.hidden = false;
        $('p-code').value = data.devCode;
      } else {
        dev.hidden = true;
      }
      toast('Código enviado por SMS');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('p-verify-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/otp/verify', {
        method: 'POST', anonymous: true,
        body: { phone: state.phone, code: $('p-code').value.trim() },
      });
      setSession(data);
      $('p-phone').disabled = false;
      $('p-phone').value = '';
      $('p-code').value = '';
      $('p-verify-form').hidden = true;
      $('p-devcode').hidden = true;
      toast('Sesión iniciada');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('p-trip-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api('/trips', {
        method: 'POST',
        body: {
          zone: $('p-zone').value,
          exactAddress: $('p-address').value.trim(),
          paymentMethod: $('p-payment').value,
          hasPet: $('p-pet').checked,
          mariaStyle: null,
          unitType: null,
        },
      });
      $('p-address').value = '';
      $('p-pet').checked = false;
      toast('Solicitud enviada, buscando taxista…');
      loadPassengerTrips();
    } catch (error) {
      toast(error.message, true);
    }
  });
}

async function loadPassengerTrips() {
  if (state.session?.user?.role !== 'Passenger') return;
  try {
    const trips = await api('/trips/me');
    const box = $('p-trips');
    box.replaceChildren();
    if (!trips?.length) return box.append(empty('Sin viajes todavía.'));

    for (const trip of trips) {
      const actions = [];
      if (trip.status === 'Pending') {
        actions.push({ label: 'Cancelar', kind: 'danger', onClick: () => cancelTrip(trip.id) });
      }
      if (trip.status === 'Accepted' || trip.status === 'InProgress') {
        actions.push({ label: 'Chat', onClick: () => openChat(trip) });
        actions.push({ label: 'Emergencia', kind: 'danger', onClick: () => passengerSos(trip) });
      }
      box.append(tripCard(trip, actions));
    }
  } catch {
    /* el polling no debe llenar la pantalla de errores */
  }
}

async function cancelTrip(id) {
  if (!confirm('¿Cancelar este viaje?')) return;
  try {
    await api(`/trips/${id}/cancel`, {
      method: 'POST', body: { reason: 'Cancelado por el pasajero' },
    });
    toast('Viaje cancelado');
    loadPassengerTrips();
  } catch (error) {
    toast(error.message, true);
  }
}

async function passengerSos(trip) {
  if (!confirm('¿Enviar una alerta de emergencia a la central?')) return;
  try {
    const pos = await position();
    await api('/emergency/passenger', {
      method: 'POST',
      body: {
        latitude: pos.latitude, longitude: pos.longitude,
        description: `Emergencia durante el viaje ${trip.id}`,
      },
    });
    toast('Alerta enviada a la central');
  } catch (error) {
    toast(error.message, true);
  }
}

/* ------------------------------------------------------------------ TAXISTA */

function initDriver() {
  $('d-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/login', {
        method: 'POST', anonymous: true,
        body: { email: $('d-email').value.trim(), password: $('d-password').value },
      });
      if (data.user.role !== 'Driver') return toast('Esta cuenta no es de taxista', true);
      $('d-password').value = '';
      setSession(data);
      toast('Sesión iniciada');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('d-toggle').addEventListener('click', async () => {
    const next = state.driverStatus === 'Available' ? 'Offline' : 'Available';
    try {
      await api('/drivers/me/status', { method: 'PATCH', body: { status: next } });
      state.driverStatus = next;
      updateDriverSummary();
      toast(next === 'Available' ? 'Estás disponible para viajes' : 'Ya no recibirás viajes');
      loadDriverData();
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('d-locate').addEventListener('click', async () => {
    try {
      const pos = await position();
      await api('/drivers/me/location', { method: 'PATCH', body: pos });
      toast('Ubicación actualizada');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('d-sos').addEventListener('click', async () => {
    if (!confirm('¿Enviar la alerta 10-33 a la central?')) return;
    try {
      const pos = await position();
      await api('/emergency', {
        method: 'POST',
        body: {
          latitude: pos.latitude, longitude: pos.longitude,
          tripId: null, note: 'Alerta enviada desde el cliente web',
        },
      });
      toast('Alerta 10-33 enviada');
    } catch (error) {
      toast(error.message, true);
    }
  });
}

function updateDriverSummary() {
  const user = state.session?.user;
  const box = $('d-summary');
  const button = $('d-toggle');

  if (!user) {
    box.textContent = '';
    return;
  }

  const driver = user.driver;
  const status = state.driverStatus ?? driver?.status ?? 'Offline';

  box.textContent = [
    user.fullName ?? user.phone,
    driver?.licensePlate,
    driver?.currentZone,
    STATUS_LABEL[status] ?? status,
    driver && !driver.isApproved ? 'cuenta pendiente de aprobación' : null,
  ].filter(Boolean).join(' · ');

  button.textContent = status === 'Available' ? 'Ponerme no disponible' : 'Ponerme disponible';
  button.disabled = status === 'OnTrip';
}

async function loadDriverData() {
  if (state.session?.user?.role !== 'Driver') return;
  try {
    const [mine, available, me] = await Promise.all([
      api('/trips/me'),
      api('/trips/available').catch(() => []),
      api('/me').catch(() => null),
    ]);

    if (me) {
      state.session.user = me;
      state.driverStatus = me.driver?.status ?? state.driverStatus;
      updateDriverSummary();
    }

    renderAvailable(Array.isArray(available) ? available : []);

    const active = (mine || []).filter(
      (trip) => trip.status === 'Accepted' || trip.status === 'InProgress',
    );
    renderActive(active);
  } catch {
    /* silencio en polling */
  }
}

function renderAvailable(trips) {
  const box = $('d-available');
  box.replaceChildren();
  if (!trips.length) return box.append(empty('Sin solicitudes por ahora.'));

  for (const trip of trips) {
    box.append(tripCard(trip, [
      { label: 'Aceptar viaje', kind: 'primary', onClick: () => acceptTrip(trip.id) },
    ]));
  }
}

function renderActive(trips) {
  const box = $('d-active');
  box.replaceChildren();
  if (!trips.length) return box.append(empty('No tienes un viaje activo.'));

  for (const trip of trips) {
    const actions = [];
    if (trip.status === 'Accepted') {
      actions.push({ label: 'Iniciar viaje', kind: 'primary', onClick: () => startTrip(trip.id) });
    }
    if (trip.status === 'InProgress') {
      actions.push({ label: 'Completar', kind: 'primary', onClick: () => completeTrip(trip.id) });
    }
    actions.push({ label: 'Chat', onClick: () => openChat(trip) });
    actions.push({ label: '10-33', kind: 'danger', onClick: sosTrip });
    box.append(tripCard(trip, actions));
  }
}

async function acceptTrip(id) {
  try {
    await api(`/trips/${id}/accept`, { method: 'POST' });
    toast('Viaje aceptado');
    loadDriverData();
  } catch (error) {
    toast(error.message, true);
  }
}

async function startTrip(id) {
  try {
    await api(`/trips/${id}/start`, { method: 'POST' });
    toast('Viaje iniciado');
    loadDriverData();
  } catch (error) {
    toast(error.message, true);
  }
}

async function completeTrip(id) {
  const raw = prompt('Tarifa final en colones (opcional):', '');
  const price = raw === null || raw.trim() === '' ? null : Number(raw.replace(/[^\d.]/g, ''));
  if (price !== null && (!Number.isFinite(price) || price < 0)) return toast('Monto inválido', true);

  try {
    await api(`/trips/${id}/complete`, { method: 'POST', body: { price } });
    toast('Viaje completado');
    loadDriverData();
  } catch (error) {
    toast(error.message, true);
  }
}

async function sosTrip() {
  if (!confirm('¿Enviar la alerta 10-33 a la central?')) return;
  try {
    const pos = await position();
    await api('/emergency', {
      method: 'POST',
      body: {
        latitude: pos.latitude, longitude: pos.longitude,
        tripId: null, note: 'Alerta enviada desde el cliente web',
      },
    });
    toast('Alerta 10-33 enviada');
  } catch (error) {
    toast(error.message, true);
  }
}

/* ------------------------------------------------------------------ CENTRAL */

function initAdmin() {
  const zone = $('a-zone');
  for (const name of ZONES) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    zone.append(option);
  }

  $('a-login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/auth/login', {
        method: 'POST', anonymous: true,
        body: { email: $('a-email').value.trim(), password: $('a-password').value },
      });
      if (data.user.role !== 'Admin') return toast('Esta cuenta no es de la central', true);
      $('a-password').value = '';
      setSession(data);
      toast('Sesión iniciada');
    } catch (error) {
      toast(error.message, true);
    }
  });

  $('a-new-driver').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = {
      fullName: $('a-fullname').value.trim(),
      phone: $('a-phone').value.trim(),
      email: $('a-email-driver').value.trim(),
      password: $('a-password-driver').value,
      licensePlate: $('a-plate').value.trim().toUpperCase(),
      unitType: $('a-unit').value,
      currentZone: $('a-zone').value,
    };
    try {
      await api('/admin/drivers', { method: 'POST', body });
      $('a-new-driver').reset();
      toast('Chofer creado');
      loadAdmin();
    } catch (error) {
      toast(error.message, true);
    }
  });
}

async function loadAdmin() {
  if (state.session?.user?.role !== 'Admin') return;
  try {
    const [stats, alerts, drivers] = await Promise.all([
      api('/admin/stats'),
      api('/emergency/active'),
      api('/admin/drivers'),
    ]);
    renderStats(stats);
    renderAlerts(alerts || []);
    renderDrivers(drivers || []);
  } catch {
    /* silencio en polling */
  }
}

function renderStats(stats) {
  const box = $('a-stats');
  box.replaceChildren();
  if (!stats) return;

  const items = [
    ['Pasajeros', stats.passengers],
    ['Choferes', stats.drivers],
    ['Viajes activos', stats.activeTrips],
    ['Pendientes', stats.pendingTrips],
    ['Emergencias', stats.activeEmergencies],
  ];

  for (const [label, value] of items) {
    const card = document.createElement('div');
    card.className = 'stat';
    const number = document.createElement('b');
    number.textContent = String(value ?? 0);
    const text = document.createElement('span');
    text.textContent = label;
    card.append(number, text);
    box.append(card);
  }
}

function renderAlerts(alerts) {
  const box = $('a-alerts');
  box.replaceChildren();
  if (!alerts.length) return box.append(empty('Sin alertas activas.'));

  for (const alert of alerts) {
    const item = document.createElement('div');
    item.className = 'item';

    const head = document.createElement('div');
    head.className = 'item-head';
    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = `10-33 · ${alert.driverName || 'Chofer'}`;
    head.append(title);
    item.append(head);

    for (const line of [
      `Placa: ${alert.driverPlate || '—'}`,
      `Ubicación: ${Number(alert.latitude).toFixed(5)}, ${Number(alert.longitude).toFixed(5)}`,
      `Hora: ${fmtDate(alert.createdAtUtc)}`,
    ]) {
      const p = document.createElement('div');
      p.className = 'item-sub';
      p.textContent = line;
      item.append(p);
    }

    const row = document.createElement('div');
    row.className = 'item-actions';
    const map = document.createElement('a');
    map.className = 'ghost';
    map.textContent = 'Ver mapa';
    map.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(alert.latitude)}&mlon=${encodeURIComponent(alert.longitude)}#map=17/${encodeURIComponent(alert.latitude)}/${encodeURIComponent(alert.longitude)}`;
    map.target = '_blank';
    map.rel = 'noopener noreferrer';
    map.style.padding = '7px 12px';
    map.style.border = '1px solid var(--line)';
    map.style.borderRadius = '10px';
    map.style.textDecoration = 'none';
    map.style.color = 'inherit';

    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'primary';
    resolve.textContent = 'Marcar atendida';
    resolve.addEventListener('click', () => resolveAlert(alert.id));

    row.append(map, resolve);
    item.append(row);
    box.append(item);
  }
}

async function resolveAlert(id) {
  try {
    await api(`/emergency/${id}/resolve`, { method: 'POST', body: { note: null } });
    toast('Alerta marcada como atendida');
    loadAdmin();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderDrivers(drivers) {
  const box = $('a-drivers');
  box.replaceChildren();
  if (!drivers.length) return box.append(empty('Aún no hay choferes registrados.'));

  for (const driver of drivers) {
    const item = document.createElement('div');
    item.className = 'item';

    const head = document.createElement('div');
    head.className = 'item-head';
    const title = document.createElement('span');
    title.className = 'item-title';
    title.textContent = `${driver.fullName} · ${driver.licensePlate}`;
    const status = document.createElement('span');
    status.className = 'badge ' + (driver.isActive ? 'inprogress' : 'cancelled');
    status.textContent = driver.isActive
      ? (driver.isApproved ? 'Activo' : 'Pendiente')
      : 'Desactivado';
    head.append(title, status);
    item.append(head);

    for (const line of [
      `${driver.phone} · ${driver.email}`,
      `${driver.unitType} · ${driver.currentZone}`,
      `Estado: ${STATUS_LABEL[driver.status] ?? driver.status}`,
    ]) {
      const p = document.createElement('div');
      p.className = 'item-sub';
      p.textContent = line;
      item.append(p);
    }

    const row = document.createElement('div');
    row.className = 'item-actions';

    const approve = document.createElement('button');
    approve.type = 'button';
    approve.className = 'ghost';
    approve.textContent = driver.isApproved ? 'Quitar aprobación' : 'Aprobar';
    approve.addEventListener('click', () => updateDriver(driver.id, { isApproved: !driver.isApproved }));
    row.append(approve);

    const active = document.createElement('button');
    active.type = 'button';
    active.className = driver.isActive ? 'danger' : 'primary';
    active.textContent = driver.isActive ? 'Desactivar' : 'Reactivar';
    active.addEventListener('click', () => updateDriver(driver.id, { isActive: !driver.isActive }));
    row.append(active);

    item.append(row);
    box.append(item);
  }
}

async function updateDriver(id, patch) {
  try {
    await api(`/admin/drivers/${id}`, { method: 'PUT', body: patch });
    toast('Chofer actualizado');
    loadAdmin();
  } catch (error) {
    toast(error.message, true);
  }
}

/* --------------------------------------------------------------------- CHAT */

function openChat(trip) {
  state.chatTripId = trip.id;
  $('chat-title').textContent = `Chat · ${trip.zone}`;
  $('chat-messages').replaceChildren();
  $('chat-dialog').showModal();
  loadChat();
}

function closeChat() {
  state.chatTripId = null;
  const dialog = $('chat-dialog');
  if (dialog.open) dialog.close();
}

async function loadChat() {
  if (!state.chatTripId) return;
  try {
    const messages = await api(`/trips/${state.chatTripId}/messages`);
    renderChat(messages || []);
  } catch {
    /* silencio en polling */
  }
}

function renderChat(messages) {
  const box = $('chat-messages');
  const me = state.session?.user?.id;
  box.replaceChildren();

  if (!messages.length) {
    box.append(empty('Todavía no hay mensajes.'));
    return;
  }

  for (const message of messages) {
    const bubble = document.createElement('div');
    bubble.className = 'msg' + (message.senderId === me ? ' mine' : '');
    const text = document.createElement('div');
    text.textContent = message.audioData ? '🎙️ Nota de voz' : (message.text || '');
    const time = document.createElement('time');
    time.textContent = fmtDate(message.createdAtUtc);
    bubble.append(text, time);
    box.append(bubble);
  }

  box.scrollTop = box.scrollHeight;
}

function initChat() {
  $('chat-close').addEventListener('click', closeChat);

  $('chat-dialog').addEventListener('close', () => {
    state.chatTripId = null;
  });

  $('chat-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = $('chat-text').value.trim();
    if (!text || !state.chatTripId) return;

    try {
      await api(`/trips/${state.chatTripId}/messages`, {
        method: 'POST', body: { text, audioData: null },
      });
      $('chat-text').value = '';
      await loadChat();
    } catch (error) {
      toast(error.message, true);
    }
  });
}

/* ------------------------------------------------------------------- inicio */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.role-tab').forEach((tab) => {
    tab.addEventListener('click', () => setRole(tab.dataset.role));
  });
  $('logout').addEventListener('click', logout);

  initPassenger();
  initDriver();
  initAdmin();
  initChat();

  $('conn').textContent = location.host;
  setRole('passenger');
  renderSession();
});
