import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:4000' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

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
