import { useState, useEffect, useCallback, useMemo } from 'react'
import api from '../api'

/**
 * Generic data-fetching hook.
 * Usage: const { data, loading, error, refetch } = useApi('/company')
 */
export function useApi(endpoint, params = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Serialize params to a stable string so the dep array reacts to value changes,
  // not object identity (which would cause infinite re-renders).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const paramKey = useMemo(() => JSON.stringify(params), [JSON.stringify(params)])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(endpoint, { params: JSON.parse(paramKey) })
      setData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }, [endpoint, paramKey])

  useEffect(() => { fetchData() }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
