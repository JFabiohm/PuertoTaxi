import { useEffect, useRef, useState } from 'react'
import { api, API_URL, hasSession } from '../api'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

export default function DriverPanel({ user, execute, section }) {
  const [available, setAvailable] = useState([])
  const [mine, setMine] = useState([])
  const [status, setStatus] = useState(user.driver?.status || 'Offline')
  const [price, setPrice] = useState({})
  const [popup, setPopup] = useState(null)
  const connectionRef = useRef(null)

  async function load() {
    const [availableTrips, myTrips] = await Promise.all([api.availableTrips(), api.trips()])
    setAvailable(availableTrips)
    setMine(myTrips)
  }

  useEffect(() => {
    execute(load)

    if (!hasSession()) return undefined

    const connection = new HubConnectionBuilder()
      // La cookie HttpOnly se envía sola en el handshake; sin token en la URL.
      .withUrl(`${API_URL}/hubs/taxi`, { withCredentials: true })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on('TripCreated', load)
    connection.on('EmergencyCreated', (emergency) => {
      if (emergency.driverId === user.id) return
      setPopup({
        title: 'Emergencia de un compañero',
        message: `${emergency.driverName} · Placa ${emergency.driverPlate}. Ubicación: ${emergency.latitude}, ${emergency.longitude}.`,
      })
    })
    connectionRef.current = connection
    connection.start().catch(() => undefined)

    return () => {
      connection.off('TripCreated', load)
      connection.off('EmergencyCreated')
      connection.stop()
      connectionRef.current = null
    }
  }, [])

  useEffect(() => {
    if (status !== 'Available' || !navigator.geolocation) return undefined

    const watchId = navigator.geolocation.watchPosition(
      (position) => api.updateDriverLocation(position.coords.latitude, position.coords.longitude),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [status])

  async function updateStatus(nextStatus) {
    await execute(async () => {
      await api.updateDriverStatus(nextStatus)
      setStatus(nextStatus)
      await load()
    })
  }

  async function useLocation() {
    if (!navigator.geolocation) return execute(async () => { throw new Error('Este navegador no permite ubicación.') })

    navigator.geolocation.getCurrentPosition(
      (position) => execute(async () => {
        await api.updateDriverLocation(position.coords.latitude, position.coords.longitude)
        setPopup({ title: 'Ubicación actualizada', message: 'Tu ubicación fue enviada correctamente a la central.' })
      }),
      () => execute(async () => { throw new Error('No se pudo obtener la ubicación.') }),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function action(action) {
    await execute(async () => {
      await action()
      await load()
    })
  }

  const activeTrips = mine.filter((trip) => ['Accepted', 'InProgress'].includes(trip.status))

  return (
    <>
      {section === 'home' && <section className="card driver-summary">
        <div><p className="eyebrow">Panel del taxista</p><h2>{user.fullName || 'Taxista'}</h2><p className="muted">Gestiona tu disponibilidad y los servicios asignados.</p></div>
        <div className="driver-controls">
          <span className={`status status-${status.toLowerCase()}`}>{status}</span>
          <button className="primary" onClick={() => updateStatus(status === 'Available' ? 'Offline' : 'Available')}>{status === 'Available' ? 'Ponerse offline' : 'Ponerse disponible'}</button>
          <button className="outline" onClick={useLocation}>Actualizar ubicación</button>
          <button className="danger" onClick={() => action(async () => { await api.triggerEmergency({ latitude: 0, longitude: 0, note: 'Alerta activada desde el panel' }); setPopup({ title: '10-33 activado', message: 'La alerta fue enviada a la central.' }) })}>Activar 10-33</button>
        </div>
      </section>}

      {section === 'profile' && <section className="card"><p className="eyebrow">Cuenta</p><h2>Mi perfil</h2><p className="muted">Sesión activa para {user.fullName || user.email}.</p><p><strong>Estado:</strong> {status}</p></section>}

      {(section === 'home' || section === 'requests') && <div className="layout two-columns">
        <section className="card">
          <div className="section-heading"><div><h2>Peticiones disponibles</h2><p className="muted">La dirección completa aparece después de aceptar.</p></div><button className="outline" onClick={() => execute(load)}>Actualizar</button></div>
          <div className="trip-list">
            {available.length === 0 && <p className="empty">No hay peticiones disponibles.</p>}
            {available.map((trip) => <article className="trip" key={trip.id}><div><strong>{trip.zone}</strong><p>{trip.exactAddress}</p><small>{trip.paymentMethod} · {trip.unitType}</small></div><button className="primary" onClick={() => action(() => api.acceptTrip(trip.id))}>Aceptar</button></article>)}
          </div>
        </section>

        {section === 'home' || section === 'services' ? <section className="card">
          <div className="section-heading"><div><h2>Mis servicios</h2><p className="muted">Controla el estado de cada viaje.</p></div></div>
          <div className="trip-list">
            {activeTrips.length === 0 && <p className="empty">No tienes servicios activos.</p>}
            {activeTrips.map((trip) => <article className="trip trip-column" key={trip.id}><div className="trip-content"><strong>{trip.zone}</strong><p>{trip.exactAddress}</p><span className={`status status-${trip.status.toLowerCase()}`}>{trip.status}</span></div><div className="trip-actions">{trip.status === 'Accepted' && <button className="secondary" onClick={() => action(() => api.startTrip(trip.id))}>Iniciar</button>}{trip.status === 'InProgress' && <><input type="number" min="0" placeholder="Precio" value={price[trip.id] || ''} onChange={(event) => setPrice({ ...price, [trip.id]: event.target.value })} /><button className="primary" onClick={() => action(() => api.completeTrip(trip.id, price[trip.id] ? Number(price[trip.id]) : null))}>Completar</button></>}</div></article>)}
          </div>
        </section> : null}
      </div>}

      {section === 'services' && <section className="card"><div className="section-heading"><div><h2>Mis servicios</h2><p className="muted">Controla el estado de cada viaje.</p></div></div><div className="trip-list">{activeTrips.length === 0 && <p className="empty">No tienes servicios activos.</p>}{activeTrips.map((trip) => <article className="trip trip-column" key={trip.id}><div className="trip-content"><strong>{trip.zone}</strong><p>{trip.exactAddress}</p><span className={`status status-${trip.status.toLowerCase()}`}>{trip.status}</span></div><div className="trip-actions">{trip.status === 'Accepted' && <button className="secondary" onClick={() => action(() => api.startTrip(trip.id))}>Iniciar</button>}{trip.status === 'InProgress' && <><input type="number" min="0" placeholder="Precio" value={price[trip.id] || ''} onChange={(event) => setPrice({ ...price, [trip.id]: event.target.value })} /><button className="primary" onClick={() => action(() => api.completeTrip(trip.id, price[trip.id] ? Number(price[trip.id]) : null))}>Completar</button></>}</div></article>)}</div></section>}
      {popup && <div className="modal-backdrop" role="presentation"><section className="modal card alert-modal" role="alertdialog"><div className="modal-header"><div><p className="eyebrow">Central Puerto Taxi</p><h2>{popup.title}</h2></div><button className="modal-close" aria-label="Cerrar" onClick={() => setPopup(null)}>×</button></div><p className="muted">{popup.message}</p><button className="primary" onClick={() => setPopup(null)}>Aceptar</button></section></div>}
    </>
  )
}
