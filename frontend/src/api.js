const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5218').replace(/\/$/, '')
const TOKEN_KEY = 'puertotaxi.accessToken'
const USER_KEY = 'puertotaxi.user'

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveSession(response) {
  localStorage.setItem(TOKEN_KEY, response.accessToken)
  localStorage.setItem(USER_KEY, JSON.stringify(response.user))
}

export function getStoredUser() {
  const value = localStorage.getItem(USER_KEY)
  return value ? JSON.parse(value) : null
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  const token = getAccessToken()

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    clearSession()
  }

  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const validationMessage = payload?.errors
      ? Object.values(payload.errors).flat().find(Boolean)
      : null
    throw new Error(validationMessage || payload?.detail || payload?.title || payload || `Error HTTP ${response.status}`)
  }

  return payload
}

const json = (body) => JSON.stringify(body)

export const api = {
  login: (email, password) => request('/api/auth/login', {
    method: 'POST',
    body: json({ email, password }),
  }),
  requestOtp: (phone) => request('/api/auth/otp/request', {
    method: 'POST',
    body: json({ phone }),
  }),
  verifyOtp: (phone, code) => request('/api/auth/otp/verify', {
    method: 'POST',
    body: json({ phone, code }),
  }),
  me: () => request('/api/me'),
  trips: () => request('/api/trips/me?take=50'),
  availableTrips: () => request('/api/trips/available'),
  createTrip: (trip) => request('/api/trips', {
    method: 'POST',
    body: json(trip),
  }),
  passengerEmergency: (emergency) => request('/api/emergency/passenger', {
    method: 'POST',
    body: json(emergency),
  }),
  acceptTrip: (id) => request(`/api/trips/${id}/accept`, { method: 'POST' }),
  startTrip: (id) => request(`/api/trips/${id}/start`, { method: 'POST' }),
  completeTrip: (id, price) => request(`/api/trips/${id}/complete`, {
    method: 'POST',
    body: json({ price }),
  }),
  cancelTrip: (id, reason) => request(`/api/trips/${id}/cancel`, {
    method: 'POST',
    body: json({ reason }),
  }),
  drivers: () => request('/api/drivers'),
  updateDriverStatus: (status) => request('/api/drivers/me/status', {
    method: 'PATCH',
    body: json({ status }),
  }),
  updateDriverLocation: (latitude, longitude) => request('/api/drivers/me/location', {
    method: 'PATCH',
    body: json({ latitude, longitude }),
  }),
  updateDriverPreferences: (preferences) => request('/api/drivers/me/preferences', {
    method: 'PATCH',
    body: json(preferences),
  }),
  triggerEmergency: (emergency) => request('/api/emergency', {
    method: 'POST',
    body: json(emergency),
  }),
  activeEmergencies: () => request('/api/emergency/active'),
  resolveEmergency: (id, note) => request(`/api/emergency/${id}/resolve`, {
    method: 'POST',
    body: json({ note }),
  }),
  adminDrivers: () => request('/api/admin/drivers'),
  adminUsers: () => request('/api/admin/users'),
  adminPassengers: () => request('/api/admin/passengers'),
  createDriver: (driver) => request('/api/admin/drivers', {
    method: 'POST',
    body: json(driver),
  }),
  updateAdminDriver: (id, driver) => request(`/api/admin/drivers/${id}`, {
    method: 'PUT',
    body: json(driver),
  }),
  deactivateDriver: (id) => request(`/api/admin/drivers/${id}`, { method: 'DELETE' }),
  setDriverActive: (id, isActive) => request(`/api/admin/drivers/${id}`, {
    method: 'PUT',
    body: json({ isActive }),
  }),
  adminStats: () => request('/api/admin/stats'),
  audit: () => request('/api/admin/audit?take=100'),
}

export { API_URL }
