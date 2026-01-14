import axios from 'axios'

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:'
const envBase = (import.meta as any)?.env?.VITE_API_URL as string | undefined
// Use relative path by default to leverage Vite proxy in development
// This avoids CORS issues and certificate trust issues across different ports
const baseURL = envBase || '/' 
const api = axios.create({ baseURL })

api.interceptors.request.use(config => {
  const token = sessionStorage.getItem('token') || localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    // Don't redirect if it's the Microsoft callback endpoint that failed
    // This allows the Login component to handle the error and show a message
    if (error.config && error.config.url && error.config.url.includes('/microsoft/callback')) {
      return Promise.reject(error)
    }

    // Helpful diagnostics for permission issues (common during dev when roles/assignments differ)
    if (error.response && error.response.status === 403) {
      const method = String(error.config?.method || 'GET').toUpperCase()
      const url = error.config?.url || '(unknown url)'
      const data = error.response.data
      const errCode = data?.error ? String(data.error) : ''
      const errMsg = data?.message ? String(data.message) : ''
      const errDetails = data?.details !== undefined ? data.details : undefined
      // eslint-disable-next-line no-console
      console.warn(
        `[api] 403 ${method} ${url}${errCode ? ` (${errCode})` : ''}${errMsg ? `: ${errMsg}` : ''}`,
        errDetails ?? data
      )
    }

    if (error.response && error.response.status === 401) {
      if (sessionStorage.getItem('token')) {
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('role')
        sessionStorage.removeItem('displayName')
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('role')
        localStorage.removeItem('displayName')
      }
      
      if (window.location.pathname !== '/login') {
        // Preserve query parameters (like OAuth code) when redirecting
        window.location.href = '/login' + window.location.search
      }
    }
    return Promise.reject(error)
  }
)

export default api

// Impersonation API functions
export const impersonationApi = {
  start: async (targetUserId: string) => {
    const response = await api.post('/impersonation/start', { targetUserId })
    return response.data
  },
  stop: async () => {
    const response = await api.post('/impersonation/stop')
    return response.data
  },
  getStatus: async () => {
    const response = await api.get('/impersonation/status')
    return response.data
  }
}
