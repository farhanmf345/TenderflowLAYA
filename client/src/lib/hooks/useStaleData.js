import { useState, useEffect, useRef } from 'react'

/**
 * Stale-While-Revalidate hook.
 *
 * - Immediately returns cached data from localStorage so the page
 *   renders with content instead of a blank spinner.
 * - Fetches fresh data from the API in the background.
 * - `isRefreshing` is capped at 1 second so the loading indicator
 *   never blocks the user for longer than that.
 *
 * @param {string}   cacheKey     Unique key for localStorage (prefixed with tf_)
 * @param {Function} fetchFn      Async function that returns the fresh data value
 * @param {*}        defaultValue Fallback when no cache exists yet
 */
export function useStaleData(cacheKey, fetchFn, defaultValue) {
  // Initialise from localStorage immediately - no waiting for API
  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem(`tf_${cacheKey}`)
      return cached ? JSON.parse(cached) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const [isRefreshing, setIsRefreshing] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setIsRefreshing(true)

    // No matter what, stop showing the indicator after 1 s
    timerRef.current = setTimeout(() => {
      if (!cancelled) setIsRefreshing(false)
    }, 1000)

    fetchFn()
      .then(fresh => {
        if (!cancelled) {
          setData(fresh)
          setIsRefreshing(false)
          clearTimeout(timerRef.current)
          try {
            localStorage.setItem(`tf_${cacheKey}`, JSON.stringify(fresh))
          } catch { /* quota exceeded - ignore */ }
        }
      })
      .catch(() => {
        if (!cancelled) setIsRefreshing(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
    }
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, isRefreshing, setData }
}
