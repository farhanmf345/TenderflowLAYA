import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Response interceptor - log errors globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[API Error]', err.response?.status, err.response?.data)
    return Promise.reject(err)
  }
)

export default api
