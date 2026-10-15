import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, FileSearch, Clock, TrendingUp } from 'lucide-react'

const API = 'http://localhost:8000'

const VERDICT_CONFIG = {
  ELIGIBLE:    { color: '#22c55e', bg: '#22c55e18', Icon: CheckCircle,    label: 'Eligible' },
  CONDITIONAL: { color: '#f59e0b', bg: '#f59e0b18', Icon: AlertTriangle,  label: 'Conditional' },
  INELIGIBLE:  { color: '#ef4444', bg: '#ef444418', Icon: XCircle,        label: 'Ineligible' },
}

export default function ManagerOverview({ manager }) {
  const [tenders, setTenders] = useState([])
  const [loading, setLoading] = useState(true)

  const deptIds = (manager.departments || []).map(d => d.Department_ID).join(',')

  useEffect(() => {
    if (!deptIds) { setLoading(false); return }
    fetch(`${API}/api/manager/tenders?dept_ids=${deptIds}`)
      .then(r => r.json())
      .then(setTenders)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [deptIds])

  const eligible    = tenders.filter(t => t.verdict === 'ELIGIBLE')
  const conditional = tenders.filter(t => t.verdict === 'CONDITIONAL')
  const ineligible  = tenders.filter(t => t.verdict === 'INELIGIBLE')
  const recent      = [...tenders].sort((a, b) => b.score - a.score).slice(0, 6)

  const stats = [
    { label: 'Total Matched',  value: tenders.length,      color: 'var(--brand)',  icon: FileSearch },
    { label: 'Eligible',       value: eligible.length,     color: '#22c55e',       icon: CheckCircle },
    { label: 'Conditional',    value: conditional.length,  color: '#f59e0b',       icon: AlertTriangle },
    { label: 'Ineligible',     value: ineligible.length,   color: '#ef4444',       icon: XCircle },
  ]

  const depts = manager.departments || []
  const avgScore = tenders.length
    ? (tenders.reduce((s, t) => s + t.score, 0) / tenders.length).toFixed(1)
    : '-'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>
          Welcome, {manager.Head_Name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {depts.map(d => d.Department_Name).join(' · ')}
          {depts[0]?.Sector ? ` · ${depts[0].Sector}` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28, marginTop: 20 }}>
        {stats.map(s => {
          const Icon = s.icon
          const isBrand = s.color === 'var(--brand)'
          const iconBg  = isBrand ? 'rgba(99,102,241,0.1)' : `${s.color}18`
          return (
            <div key={s.label} style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                  {loading ? '—' : s.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5, whiteSpace: 'nowrap' }}>
                  {s.label}
                </div>
              </div>
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                background: iconBg, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={16} style={{ color: s.color }} />
              </div>
            </div>
          )
        })}
      </div>



      {/* Score distribution bar */}
      {tenders.length > 0 && (
        <div className="card" style={{ padding: '18px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Eligibility Distribution
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {[
              { count: eligible.length,    color: '#22c55e' },
              { count: conditional.length, color: '#f59e0b' },
              { count: ineligible.length,  color: '#ef4444' },
            ].map((s, i) => s.count > 0 && (
              <div key={i} style={{
                flex: s.count, background: s.color, borderRadius: 4,
                transition: 'flex 0.4s',
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {[
              { label: 'Eligible',    count: eligible.length,    color: '#22c55e' },
              { label: 'Conditional', count: conditional.length, color: '#f59e0b' },
              { label: 'Ineligible',  count: ineligible.length,  color: '#ef4444' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
                <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>{s.count}</span>
              </div>
            ))}
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              Avg Score: <strong style={{ color: 'var(--text)' }}>{avgScore}</strong>/100
            </div>
          </div>
        </div>
      )}

      {/* Recent tenders */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Top Matched Tenders</div>
          <a href="/TenderManager/Tenders" style={{ fontSize: 12, color: 'var(--brand)', textDecoration: 'none' }}>View all →</a>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
        ) : recent.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No tenders matched yet. Run the pipeline from the Admin panel.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-2)' }}>
                {['Tender', 'Organisation', 'Deadline', 'Score', 'Verdict'].map(h => (
                  <th key={h} style={{ padding: '8px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((t, i) => {
                const cfg = VERDICT_CONFIG[t.verdict] || VERDICT_CONFIG.INELIGIBLE
                const Icon = cfg.Icon
                return (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', maxWidth: 280 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tender_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.dept_name}</div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-2)' }}>{t.org || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        {t.deadline || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: cfg.color,
                        background: cfg.bg, borderRadius: 6, padding: '2px 8px',
                        border: `1px solid ${cfg.color}40`,
                      }}>{t.score.toFixed(1)}</span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Icon size={13} style={{ color: cfg.color }} />
                        <span style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
