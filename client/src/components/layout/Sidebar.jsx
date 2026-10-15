import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Building2, Settings2, Globe,
  FileSearch, CalendarClock, SlidersHorizontal, Layers
} from 'lucide-react'
// import logo from '../../../assets/Sysfore-logo-dark.png'

const navItems = [
  {
    section: 'Overview',
    links: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    section: 'Organisation',
    links: [
      { to: '/company-profile', label: 'Company Profile', icon: Building2 },
      { to: '/departments', label: 'Departments', icon: Layers },
    ],
  },
  {
    section: 'Configuration',
    links: [
      { to: '/scraper-config', label: 'Extraction Agents', icon: SlidersHorizontal },
      { to: '/settings', label: 'App Settings', icon: Settings2 },
    ],
  },
  {
    section: 'Pipeline',
    links: [
      { to: '/tenders', label: 'Tender Watchlist', icon: FileSearch },
      { to: '/token-usage', label: 'Token Usage', icon: Layers },
    ],
  },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* <div className="header-brand">
        <img src={logo} alt="Sysfore Technologies" />
      </div> */}
      <nav className="sidebar-nav">
        {navItems.map((group) => (
          <div key={group.section}>
            <div className="nav-section">{group.section}</div>
            {group.links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' active' : ''}`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <a
          href="/TenderManager"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 10px', borderRadius: 7, marginBottom: 8,
            background: 'var(--brand)12', border: '1px solid var(--brand)30',
            color: 'var(--brand)', fontSize: 11, fontWeight: 600,
            textDecoration: 'none', transition: 'background 0.15s',
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Manager Portal
        </a>
        <div className="sidebar-brand">
          Tender<span>Flow</span>
        </div>
        <div className="sidebar-version">Tender Intelligence Agent</div>
      </div>
    </aside>
  )
}
