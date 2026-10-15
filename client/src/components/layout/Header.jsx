import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../lib/hooks/useTheme'
import logo from '../../../assets/Sysfore-logo-dark.png'

export default function Header() {
  const { theme, toggleTheme } = useTheme()

  return (
    <header className="app-header">
      <div className="header-brand">
        <img src={logo} alt="Sysfore Technologies" />
      </div>

      <div className="header-actions">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        <span className="user-name">Admin</span>
        <div className="user-avatar" title="Admin">A</div>
      </div>
    </header>
  )
}
