import { useEffect, useState } from 'react'
import { api, clearSession, getStoredUser, saveSession } from './api'
import AdminPanel from './components/AdminPanel'
import DriverPanel from './components/DriverPanel'

const emptyTrip = {
  zone: 'Puntarenas Centro',
  exactAddress: '',
  paymentMethod: 'Sinpe',
  hasPet: false,
  mariaStyle: 'TIQUETE Y FECHA AL DIA',
  unitType: 'CUALQUIERA',
}

const zones = [
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
]

const unitTypes = [
  ['CUALQUIERA', 'Cualquiera'],
  ['SEDÁN', 'Sedán'],
  ['RURAL', 'Rural'],
  ['DISCAPACIDAD', 'Discapacidad'],
  ['VAN', 'Van (6 pasajeros)'],
]

function App() {
  const [user, setUser] = useState(() => getStoredUser())
  const [trips, setTrips] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [authOpen, setAuthOpen] = useState(false)
  const [authKind, setAuthKind] = useState('staff')
  const [publicSection, setPublicSection] = useState('home')
  const [section, setSection] = useState('home')
  const [trip, setTrip] = useState(emptyTrip)
  const [emergency, setEmergency] = useState({ description: '', latitude: 0, longitude: 0 })
  const [login, setLogin] = useState({ email: '', password: '' })
  const [otp, setOtp] = useState({ phone: '', code: '', devCode: '' })

  useEffect(() => {
    if (!user) return
    loadTrips()
  }, [user])

  async function loadTrips() {
    try {
      setLoading(true)
      setTrips(await api.trips())
    } catch (reason) {
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }

  async function handlePassengerEmergency(event) {
    event.preventDefault()
    await execute(async () => {
      const location = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Este navegador no permite obtener la ubicación.'))
          return
        }

        navigator.geolocation.getCurrentPosition(
          (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
          () => reject(new Error('Se necesita permitir la ubicación para enviar la emergencia.')),
          { enableHighAccuracy: true, timeout: 10000 },
        )
      })

      await api.passengerEmergency({ ...emergency, ...location })
      setEmergency({ description: '', latitude: 0, longitude: 0 })
      setNotice('La emergencia fue enviada a la central por WhatsApp.')
    })
  }

  async function handleLogin(event) {
    event.preventDefault()
    await execute(async () => {
      const response = await api.login(login.email, login.password)
      saveSession(response)
      setUser(response.user)
      setSection('home')
      setAuthOpen(false)
      setPublicSection('home')
      setNotice('Sesión iniciada correctamente.')
    })
  }

  async function handleRequestOtp(event) {
    event.preventDefault()
    await execute(async () => {
      const response = await api.requestOtp(otp.phone)
      setOtp((current) => ({ ...current, devCode: response?.devCode || '' }))
      setNotice(response?.devCode
        ? `Código de desarrollo: ${response.devCode}`
        : 'Código enviado por WhatsApp.')
    })
  }

  async function handleVerifyOtp(event) {
    event.preventDefault()
    await execute(async () => {
      const response = await api.verifyOtp(otp.phone, otp.code)
      saveSession(response)
      setUser(response.user)
      setSection('home')
      setAuthOpen(false)
      setPublicSection('home')
      if (publicSection === 'trips') {
        await execute(async () => {
          await api.createTrip(trip)
          setTrip(emptyTrip)
          await loadTrips()
          setNotice('Viaje creado correctamente.')
        })
      }
      if (publicSection === 'emergency') {
        await handlePassengerEmergency({ preventDefault() {} })
      }
      setNotice('Sesión de pasajero iniciada.')
    })
  }

  async function handleCreateTrip(event) {
    event.preventDefault()
    await execute(async () => {
      await api.createTrip(trip)
      setTrip(emptyTrip)
      await loadTrips()
      setNotice('Viaje creado correctamente.')
    })
  }

  async function execute(action) {
    try {
      setError('')
      setNotice('')
      setLoading(true)
      await action()
    } catch (reason) {
      setError(reason.message)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try { await api.logout() } catch { /* igual cerramos la sesión local */ }
    clearSession()
    setUser(null)
    setTrips([])
    setSection('home')
    setNotice('Sesión cerrada.')
  }

  function openStaffLogin() {
    setError('')
    setNotice('')
    setAuthKind('staff')
    setAuthMode('login')
    setAuthOpen(true)
  }

  function openPassengerLogin(section = 'trips') {
    setError('')
    setNotice('')
    setPublicSection(section)
    setAuthKind('passenger')
    setAuthMode('otp')
    setAuthOpen(true)
  }

  if (!user) {
    return (
      <main className="page landing-page">
        <header className="topbar public-topbar">
          <div><div className="brand-mark">PT</div><p className="eyebrow">Puerto Taxi Puntarenas</p><h1>Tu viaje, más sencillo</h1></div>
          <button className="outline" onClick={openStaffLogin}>Login</button>
        </header>

        <nav className="main-nav" aria-label="Menú del pasajero">
          <button className={publicSection === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setPublicSection('home')}>Inicio</button>
          <button className={publicSection === 'trips' ? 'nav-item active' : 'nav-item'} onClick={() => setPublicSection('trips')}>Solicitar viaje</button>
        </nav>

        <Feedback error={error} notice={notice} />

        {publicSection === 'home' && <section className="card passenger-hero"><p className="eyebrow">Servicio de taxi</p><h2>¿A dónde necesitas ir?</h2><p className="muted">Solicita un taxi o contacta a la central desde esta misma pantalla.</p><div className="button-row"><button className="primary" onClick={() => setPublicSection('trips')}>Solicitar viaje</button><button className="danger" onClick={() => setPublicSection('emergency')}>Tengo una emergencia</button></div></section>}

        {publicSection === 'trips' && <section className="card public-form-card">
          <p className="eyebrow">Solicitud de viaje</p>
          <h2>Solicitar taxi</h2>
          <p className="muted">Completa la solicitud. Se te pedirá verificar tu teléfono antes de enviarla.</p>
          <form onSubmit={(event) => { event.preventDefault(); openPassengerLogin('trips') }} className="form-stack">
            <label>Zona<select value={trip.zone} onChange={(event) => setTrip({ ...trip, zone: event.target.value })}>{zones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
            <label>Tipo de unidad<select value={trip.unitType} onChange={(event) => setTrip({ ...trip, unitType: event.target.value })}>{unitTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Dirección exacta<textarea required maxLength="250" value={trip.exactAddress} onChange={(event) => setTrip({ ...trip, exactAddress: event.target.value })} /></label>
            <div className="form-row"><label>Pago<select value={trip.paymentMethod} onChange={(event) => setTrip({ ...trip, paymentMethod: event.target.value })}><option>Sinpe</option><option>Cash</option></select></label><label>¿Lleva mascota?<input type="checkbox" checked={trip.hasPet} onChange={(event) => setTrip({ ...trip, hasPet: event.target.checked })} /></label></div>
            <button className="primary">Continuar para solicitar</button>
          </form>
        </section>}

        {publicSection === 'emergency' && <section className="card passenger-emergency public-form-card"><p className="eyebrow">Atención de la central</p><h2>Emergencia</h2><p className="muted">Describe lo que ocurre. Primero verificaremos tu teléfono y después enviaremos la ubicación a la central.</p><form onSubmit={(event) => { event.preventDefault(); openPassengerLogin('emergency') }} className="form-stack"><label>¿Qué está pasando?<textarea required maxLength="1000" value={emergency.description} onChange={(event) => setEmergency({ ...emergency, description: event.target.value })} placeholder="Describe la situación..." /></label><button className="danger">Continuar con emergencia</button></form></section>}

        {authOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setAuthOpen(false)}>
          <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <div className="modal-header"><div><p className="eyebrow">{authKind === 'passenger' ? 'Verificación de pasajero' : 'Acceso de personal'}</p><h2 id="login-title">{authKind === 'passenger' ? 'Verifica tu teléfono' : 'Iniciar sesión'}</h2></div><button className="modal-close" aria-label="Cerrar" onClick={() => setAuthOpen(false)}>×</button></div>
            {authKind === 'staff' && <div className="tabs"><button className="tab active" onClick={() => setAuthMode('login')}>Chofer / administrador</button><button className="tab" onClick={() => { setAuthKind('passenger'); setAuthMode('otp') }}>Pasajero</button></div>}
             {authMode === 'login' ? <form onSubmit={handleLogin} className="form-stack"><label>Correo electrónico<input autoFocus type="email" required value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} /></label><label>Contraseña<input type="password" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} /></label><button className="primary" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button></form> : <div className="form-stack"><form onSubmit={handleRequestOtp}><label>Teléfono<input autoFocus required value={otp.phone} placeholder="50688889999" onChange={(event) => setOtp({ ...otp, phone: event.target.value })} /></label><button className="secondary" disabled={loading}>Solicitar código</button></form>{otp.devCode && <p className="otp-dev-code">Código de desarrollo: <strong>{otp.devCode}</strong></p>}<form onSubmit={handleVerifyOtp}><label>Código OTP<input required inputMode="numeric" value={otp.code} onChange={(event) => setOtp({ ...otp, code: event.target.value })} /></label><button className="primary" disabled={loading}>Verificar y entrar</button></form></div>}
            <Feedback error={error} notice={notice} />
          </section>
        </div>}
        <Footer />
      </main>
    )
  }

  if (user.role === 'Admin') {
    return (
      <main className="page">
        <PanelHeader user={user} onLogout={logout} title="Panel administrativo" section={section} onSectionChange={setSection} />
        <Feedback error={error} notice={notice} />
        <AdminPanel execute={execute} section={section} />
        <Footer />
      </main>
    )
  }

  if (user.role === 'Driver') {
    return (
      <main className="page">
        <PanelHeader user={user} onLogout={logout} title="Panel del taxista" section={section} onSectionChange={setSection} />
        <Feedback error={error} notice={notice} />
        <DriverPanel user={user} execute={execute} section={section} />
        <Footer />
      </main>
    )
  }

  return (
    <main className="page">
      <header className="topbar">
        <div><p className="eyebrow">Puerto Taxi Puntarenas</p><h1>Panel de pasajero</h1></div>
        <div className="user-actions"><span>{user.fullName || user.email || user.phone}</span><button className="outline" onClick={logout}>Cerrar sesión</button></div>
      </header>

      <Navigation role={user.role} section={section} onSectionChange={setSection} />

      <Feedback error={error} notice={notice} />

      <div className="layout">
        {user.role === 'Passenger' && section === 'home' && (
          <>
            <section className="card">
              <h2>Solicitar viaje</h2>
              <form onSubmit={handleCreateTrip} className="form-stack">
                <label>Zona<select value={trip.zone} onChange={(event) => setTrip({ ...trip, zone: event.target.value })}>{zones.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
                <label>Tipo de unidad<select value={trip.unitType} onChange={(event) => setTrip({ ...trip, unitType: event.target.value })}>{unitTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label>Dirección exacta<textarea required maxLength="250" value={trip.exactAddress} onChange={(event) => setTrip({ ...trip, exactAddress: event.target.value })} /></label>
                <div className="form-row"><label>Pago<select value={trip.paymentMethod} onChange={(event) => setTrip({ ...trip, paymentMethod: event.target.value })}><option>Sinpe</option><option>Cash</option></select></label><label>¿Lleva mascota?<input type="checkbox" checked={trip.hasPet} onChange={(event) => setTrip({ ...trip, hasPet: event.target.checked })} /></label></div>
                <button className="primary" disabled={loading}>Solicitar taxi</button>
              </form>
            </section>
            <section className="card passenger-emergency">
              <p className="eyebrow">Atención de la central</p>
              <h2>Emergencia</h2>
              <p className="muted">Describe lo que ocurre. Enviaremos tu mensaje y ubicación por WhatsApp a la central.</p>
              <form onSubmit={handlePassengerEmergency} className="form-stack">
                <label>¿Qué está pasando?<textarea required maxLength="1000" value={emergency.description} onChange={(event) => setEmergency({ ...emergency, description: event.target.value })} placeholder="Describe la situación..." /></label>
                <button className="danger" disabled={loading}>Enviar emergencia</button>
              </form>
            </section>
          </>
        )}

        {user.role === 'Passenger' && section === 'trips' && <section className="card trips-card"><div className="section-heading"><div><h2>Mis viajes</h2><p className="muted">Estado actualizado desde la API PuertoTaxi.</p></div><button className="outline" onClick={loadTrips} disabled={loading}>Actualizar</button></div><TripList trips={trips} /></section>}

        {user.role === 'Passenger' && section === 'profile' && <section className="card"><p className="eyebrow">Cuenta</p><h2>Mi perfil</h2><p className="muted">Sesión activa para {user.fullName || user.phone || user.email}.</p></section>}

        {user.role === 'Passenger' && section === 'home' && <section className="card trips-card">
          <div className="section-heading"><div><h2>Historial de viajes</h2><p className="muted">Consulta tus viajes y el taxista asignado.</p></div><button className="outline" onClick={loadTrips} disabled={loading}>Actualizar</button></div>
          <TripList trips={trips} />
        </section>}
      </div>
      <Footer />
    </main>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <span>Creador: <a href="https://github.com/JFabiohm" target="_blank" rel="noreferrer">JFabiohm</a></span>
      <a href="tel:+50672751834">+506 72751834</a>
    </footer>
  )
}

function Feedback({ error, notice }) {
  return <>{error && <div className="feedback error">{error}</div>}{notice && <div className="feedback success">{notice}</div>}</>
}

function PanelHeader({ user, onLogout, title, section, onSectionChange }) {
  return (
    <>
      <header className="topbar">
      <div><p className="eyebrow">Puerto Taxi Puntarenas</p><h1>{title}</h1></div>
      <div className="user-actions"><span>{user.fullName || user.email || user.phone}</span><button className="outline" onClick={onLogout}>Cerrar sesión</button></div>
      </header>
      <Navigation role={user.role} section={section} onSectionChange={onSectionChange} />
    </>
  )
}

function Navigation({ role, section, onSectionChange }) {
  const items = role === 'Admin'
    ? [['home', 'Inicio'], ['requests', 'Peticiones'], ['passengers', 'Pasajeros'], ['drivers', 'Choferes'], ['emergencies', 'Emergencias'], ['profile', 'Perfil']]
    : role === 'Driver'
      ? [['home', 'Inicio'], ['requests', 'Peticiones'], ['services', 'Servicios'], ['profile', 'Perfil']]
       : [['home', 'Inicio'], ['trips', 'Viajes'], ['profile', 'Perfil']]

  return <nav className="main-nav" aria-label="Navegación principal">{items.map(([value, label]) => <button key={value} className={section === value ? 'nav-item active' : 'nav-item'} onClick={() => onSectionChange(value)}>{label}</button>)}</nav>
}

function TripList({ trips }) {
  return trips.length === 0 ? <p className="empty">No hay viajes para mostrar.</p> : <div className="trip-list">{trips.map((item) => <article className="trip" key={item.id}><div><strong>{item.zone}</strong><p>{item.exactAddress}</p><small>{item.driverName ? `Taxista: ${item.driverName}` : 'Taxista pendiente'}{item.driverPlate ? ` · Placa: ${item.driverPlate}` : ''}</small></div><span className={`status status-${item.status.toLowerCase()}`}>{item.status}</span></article>)}</div>
}

export default App
