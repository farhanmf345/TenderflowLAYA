import { useState, useEffect } from 'react'
import { Building2, ChevronRight, Loader } from 'lucide-react'

const API = 'http://localhost:8000'

export default function ManagerPicker({ onSelect }) {
  const [managers, setManagers] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    fetch(`${API}/api/manager/all`)
      .then(r => r.json())
      .then(setManagers)
      .catch(() => setError('Could not load managers. Is the server running?'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: 540, padding: '0 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
            Tender<span style={{ color: 'var(--brand)' }}>Flow</span> Manager Portal
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Select your manager profile to continue
          </p>
        </div>

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader size={24} style={{ color: 'var(--brand)', animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {error && (
          <div style={{
            background: 'var(--danger-bg)', border: '1px solid var(--danger)',
            borderRadius: 8, padding: '12px 16px', color: 'var(--danger)',
            fontSize: 13, textAlign: 'center',
          }}>{error}</div>
        )}

        {!loading && !error && managers.length === 0 && (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No managers configured yet. Add managers from the Admin panel.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {managers.map(mgr => (
            <button
              key={mgr.Head_ID}
              onClick={() => onSelect(mgr)}
              style={{
                background: 'var(--card-bg)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', textAlign: 'left',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'var(--brand)'
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--brand)18'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--brand)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {mgr.Head_Name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  {mgr.Head_Name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {mgr.Email}
                </div>
                {mgr.departments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                    {mgr.departments.map(d => (
                      <span key={d.Department_ID} style={{
                        fontSize: 10, fontWeight: 600,
                        background: 'var(--brand)18', color: 'var(--brand)',
                        borderRadius: 4, padding: '2px 6px',
                        border: '1px solid var(--brand)30',
                      }}>
                        {d.Department_Name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'var(--text-muted)' }}>
          TenderFlow v4.0 · Manager Portal
        </p>
      </div>
    </div>
  )
}
