import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('tf-theme') || 'light'
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('tf-theme', theme)
  }, [theme])

  const toggleTheme = () =>
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))

  return { theme, toggleTheme }
}
