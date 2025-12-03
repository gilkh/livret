import axios from 'axios'

const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const envBase = (import.meta as any)?.env?.VITE_API_URL as string | undefined
const baseURL = envBase || `http://${host}:4000`
const api = axios.create({ baseURL })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
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

    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      localStorage.removeItem('displayName')
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
