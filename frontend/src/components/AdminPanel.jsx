import { useEffect, useState } from 'react'
import { api } from '../api'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { API_URL, getAccessToken } from '../api'

const emptyDriver = { fullName: '', phone: '', email: '', password: '', licensePlate: '', unitType: 'SEDAN', currentZone: 'Puntarenas Centro' }

export default function AdminPanel({ execute, section }) {
  const [drivers, setDrivers] = useState([])
  const [users, setUsers] = useState([])
  const [passengers, setPassengers] = useState([])
  const [trips, setTrips] = useState([])
  const [stats, setStats] = useState(null)
  const [emergencies, setEmergencies] = useState([])
  const [driverForm, setDriverForm] = useState(emptyDriver)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [driverToDeactivate, setDriverToDeactivate] = useState(null)
  const [liveLocations, setLiveLocations] = useState({})

  async function load() {
    const [driverData, userData, passengerData, tripData, statsData, emergencyData] = await Promise.all([
      api.adminDrivers(), api.adminUsers(), api.adminPassengers(), api.trips(), api.adminStats(), api.activeEmergencies(),
    ])
    setDrivers(driverData)
    setUsers(userData)
    setPassengers(passengerData)
    setTrips(tripData)
    setStats(statsData)
    setEmergencies(emergencyData)
  }

  async function setActive(driver, isActive) {
    await execute(async () => {
      await api.setDriverActive(driver.id, isActive)
      await load()
    })
  }

  useEffect(() => {
    execute(load)

    if (!getAccessToken()) return undefined

    const connection = new HubConnectionBuilder()
      .withUrl(`${API_URL}/hubs/taxi`, { accessTokenFactory: () => getAccessToken() || '' })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on('DriverLocationUpdated', (location) => {
      setLiveLocations((current) => ({ ...current, [location.driverId]: location }))
    })
    connection.start().catch(() => undefined)

    return () => {
      connection.stop()
    }
  }, [])

  function edit(driver) {
    setEditingId(driver.id)
    setDriverForm({ ...driver, password: '' })
    setShowForm(true)
  }

  function startCreate() {
    setEditingId(null)
    setDriverForm(emptyDriver)
    setShowForm(true)
  }

  async function saveDriver(event) {
    event.preventDefault()
    await execute(async () => {
      if (editingId) {
        const { password, ...update } = driverForm
        await api.updateAdminDriver(editingId, update)
      } else {
        await api.createDriver(driverForm)
      }
      setShowForm(false)
      setDriverForm(emptyDriver)
      await load()
    })
  }

  async function deactivate(driver) {
    await execute(async () => {
      await api.deactivateDriver(driver.id)
      setDriverToDeactivate(null)
      await load()
    })
  }

  async function resolveEmergency(id) {
    await execute(async () => {
      await api.resolveEmergency(id, 'Atendida desde la central')
      await load()
    })
  }

  const pendingTrips = trips.filter((trip) => trip.status === 'Pending')
  const activeTrips = trips.filter((trip) => ['Accepted', 'InProgress'].includes(trip.status))
  const activeDrivers = drivers.filter((driver) => driver.isActive && driver.status === 'Available')

  return (
    <>
      {section === 'home' && stats && <section className="stats-grid"><Stat label="Pasajeros" value={stats.passengers} /><Stat label="Choferes" value={stats.drivers} /><Stat label="Peticiones" value={stats.pendingTrips} /><Stat label="Viajes activos" value={stats.activeTrips} /><Stat label="Emergencias" value={stats.activeEmergencies} /></section>}

      {(section === 'home' || section === 'requests') && <section className="card admin-section">
        <div className="section-heading"><div><p className="eyebrow">Central de radio</p><h2>Peticiones de viaje</h2></div><button className="outline" onClick={() => execute(load)}>Actualizar</button></div>
        <DataTable empty="No hay peticiones pendientes." headers={['Zona', 'Dirección', 'Pago', 'Estado']} rows={pendingTrips.map((trip) => [trip.zone, trip.exactAddress, trip.paymentMethod, <span className="status status-pending">{trip.status}</span>])} />
        {activeTrips.length > 0 && <><h3>Viajes activos</h3><DataTable headers={['Zona', 'Chofer', 'Estado']} rows={activeTrips.map((trip) => [trip.zone, trip.driverName || 'Sin asignar', <span className="status status-accepted">{trip.status}</span>])} /></>}
      </section>}

      {(section === 'home' || section === 'drivers') && <section className="card admin-section">
        <div className="section-heading"><div><h2>Choferes activos</h2><p className="muted">Disponibles para recibir peticiones.</p></div></div>
        <DataTable empty="No hay choferes disponibles." headers={['Nombre', 'Placa', 'Zona', 'Estado', 'Ubicación']} rows={activeDrivers.map((driver) => { const location = liveLocations[driver.id] || driver; return [driver.fullName, driver.licensePlate, driver.currentZone, <span className="status status-available">{driver.status}</span>, location.lastLat != null ? `${location.lastLat}, ${location.lastLng}` : 'Sin ubicación']; })} />
      </section>}

      {section === 'emergencies' && <section className="card admin-section">
        <div className="section-heading"><div><h2>Emergencias activas</h2></div><button className="outline" onClick={() => execute(load)}>Actualizar</button></div>
        <DataTable empty="No hay emergencias activas." headers={['Chofer', 'Placa', 'Ubicación', 'Acción']} rows={emergencies.map((emergency) => [emergency.driverName, emergency.driverPlate, `${emergency.latitude}, ${emergency.longitude}`, <button className="secondary small" onClick={() => resolveEmergency(emergency.id)}>Resolver</button>])} />
      </section>}

      {section === 'profile' && <section className="card admin-section"><p className="eyebrow">Cuenta</p><h2>Mi perfil</h2><p className="muted">Sesión administrativa activa.</p></section>}

      {section === 'users' && <section className="card admin-section"><div className="section-heading"><div><h2>Usuarios registrados</h2><p className="muted">Pasajeros, choferes y administradores.</p></div><button className="outline" onClick={() => execute(load)}>Actualizar</button></div><DataTable empty="No hay usuarios registrados." headers={['Nombre', 'Correo', 'Teléfono', 'Rol', 'Estado', 'Registro']} rows={users.map((user) => [user.fullName || 'Sin nombre', user.email || 'Sin correo', user.phone, user.role, <span className={user.isActive ? 'status status-available' : 'status status-cancelled'}>{user.isActive ? 'Activo' : 'Inactivo'}</span>, new Date(user.createdAtUtc).toLocaleString()])} /></section>}

      {section === 'passengers' && <section className="card admin-section"><div className="section-heading"><div><h2>Pasajeros</h2><p className="muted">Consulta de solo lectura.</p></div><button className="outline" onClick={() => execute(load)}>Actualizar</button></div><DataTable empty="No hay pasajeros registrados." headers={['Número de teléfono', 'Viajes solicitados', 'Tuvo alguna emergencia']} rows={passengers.map((passenger) => [passenger.phone, passenger.tripCount, passenger.hasEmergency ? <span className="status status-cancelled">Sí</span> : <span className="status status-available">No</span>])} /></section>}

      {section === 'drivers' && <section className="card admin-section">
        <div className="section-heading"><div><h2>Gestión de choferes</h2><p className="muted">Alta, actualización y desactivación lógica.</p></div><button className="primary" onClick={startCreate}>Agregar chofer</button></div>
        {showForm && <form className="driver-form" onSubmit={saveDriver}><h3>{editingId ? 'Editar chofer' : 'Nuevo chofer'}</h3><div className="form-grid">{[['fullName', 'Nombre completo'], ['phone', 'Teléfono'], ['email', 'Correo'], ['licensePlate', 'Placa'], ['unitType', 'Tipo de unidad'], ['currentZone', 'Zona']].map(([field, label]) => <label key={field}>{label}<input required={!editingId || field !== 'password'} value={driverForm[field] || ''} onChange={(event) => setDriverForm({ ...driverForm, [field]: event.target.value })} /></label>)}{!editingId && <label>Contraseña<input type="password" required minLength="10" value={driverForm.password} onChange={(event) => setDriverForm({ ...driverForm, password: event.target.value })} /></label>}</div><div className="button-row"><button className="primary">Guardar</button><button type="button" className="outline" onClick={() => setShowForm(false)}>Cancelar</button></div></form>}
        <DataTable empty="No hay choferes registrados." headers={['Nombre', 'Contacto', 'Placa', 'Estado', 'Acciones']} rows={drivers.map((driver) => [driver.fullName, driver.email, driver.licensePlate, driver.isActive ? driver.status : 'Inactivo', <div className="button-row"><button className="outline small" onClick={() => edit(driver)}>Editar</button>{driver.isActive ? <button className="danger small" onClick={() => setDriverToDeactivate(driver)}>Desactivar</button> : <button className="secondary small" onClick={() => setActive(driver, true)}>Activar</button>}</div>])} />
      </section>}

      {driverToDeactivate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDriverToDeactivate(null)}>
        <section className="modal card" role="dialog" aria-modal="true" aria-labelledby="deactivate-driver-title">
          <div className="modal-header"><div><p className="eyebrow">Gestión de choferes</p><h2 id="deactivate-driver-title">¿Desactivar chofer?</h2></div><button className="modal-close" aria-label="Cerrar" onClick={() => setDriverToDeactivate(null)}>×</button></div>
          <p>¿Deseas desactivar a <strong>{driverToDeactivate.fullName}</strong>?</p>
          <p className="muted">El chofer no podrá iniciar sesión ni recibir nuevas peticiones hasta que sea activado nuevamente.</p>
          <div className="button-row"><button className="outline" onClick={() => setDriverToDeactivate(null)}>Cancelar</button><button className="danger" onClick={() => deactivate(driverToDeactivate)}>Desactivar</button></div>
        </section>
      </div>}

    </>
  )
}

function Stat({ label, value }) { return <article className="card stat"><span>{label}</span><strong>{value}</strong></article> }

function DataTable({ headers, rows = [], empty = 'Sin datos.' }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
}
