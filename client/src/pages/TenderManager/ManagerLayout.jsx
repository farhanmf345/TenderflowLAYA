import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileSearch, Building2,
  ChevronRight, LogOut, RefreshCw
} from 'lucide-react'
import ManagerPicker from './ManagerPicker'
import ManagerOverview from './ManagerOverview'
import ManagerTenders from './ManagerTenders'
import ManagerDepartment from './ManagerDepartment'

const API = 'http://localhost:8000'

export default function ManagerLayout() {
  const [manager, setManager] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('tf_manager')
    if (saved) {
      try { setManager(JSON.parse(saved)) } catch {}
    }
    setLoading(false)
  }, [])

  const handleSelect = (mgr) => {
    localStorage.setItem('tf_manager', JSON.stringify(mgr))
    setManager(mgr)
  }

  const handleChange = () => {
    localStorage.removeItem('tf_manager')
    setManager(null)
  }

  if (loading) return null

  if (!manager) return <ManagerPicker onSelect={handleSelect} />

  const depts = manager.departments || []

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--sidebar-bg, #0f1117)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0, overflowY: 'auto',
      }}>
        {/* Brand */}
        <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Tender<span style={{ color: 'var(--brand)' }}>Flow</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Manager Portal</div>
        </div>

        {/* Manager identity badge */}
        <div style={{
          margin: '10px 10px 4px',
          background: 'var(--brand)18',
          border: '1px solid var(--brand)40',
          borderRadius: 8, padding: '8px 10px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{manager.Head_Name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{manager.Email}</div>
          <button
            onClick={handleChange}
            style={{
              marginTop: 6, fontSize: 11, color: 'var(--brand)',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <RefreshCw size={10} /> Switch manager
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0' }}>
          <SidebarSection label="Overview">
            <SideLink to="/TenderManager" icon={LayoutDashboard} label="Dashboard" end />
            <SideLink to="/TenderManager/Tenders" icon={FileSearch} label="My Tenders" />
          </SidebarSection>

          {depts.length > 0 && (
            <SidebarSection label="Departments">
              {depts.map(d => (
                <SideLink
                  key={d.Department_ID}
                  to={`/TenderManager/Department/${d.Department_ID}`}
                  icon={Building2}
                  label={d.Department_Name}
                />
              ))}
            </SidebarSection>
          )}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <a
            href="/dashboard"
            style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <LogOut size={12} /> Back to Admin
          </a>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ marginLeft: 220, flex: 1, minWidth: 0 }}>
        <Routes>
          <Route index element={<ManagerOverview manager={manager} />} />
          <Route path="Tenders" element={<ManagerTenders manager={manager} />} />
          <Route path="Department/:deptId" element={<ManagerDepartment manager={manager} />} />
        </Routes>
      </div>
    </div>
  )
}

function SidebarSection({ label, children }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: 'var(--text-muted)', padding: '10px 16px 4px',
        textTransform: 'uppercase',
      }}>{label}</div>
      {children}
    </div>
  )
}

function SideLink({ to, icon: Icon, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 16px', fontSize: 13,
        color: isActive ? 'var(--brand)' : 'var(--text-2)',
        background: isActive ? 'var(--brand)12' : 'transparent',
        borderRight: isActive ? '2px solid var(--brand)' : '2px solid transparent',
        textDecoration: 'none', transition: 'all 0.15s',
      })}
    >
      <Icon size={15} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </NavLink>
  )
}
