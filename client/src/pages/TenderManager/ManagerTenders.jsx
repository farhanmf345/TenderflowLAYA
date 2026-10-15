import { useState, useEffect } from 'react'
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp, Clock, ExternalLink, X, AlertCircle } from 'lucide-react'

const API = 'http://localhost:8000'

const V = {
  ELIGIBLE: { color: '#22c55e', bg: '#22c55e14', border: '#22c55e40', Icon: CheckCircle, label: 'Eligible' },
  CONDITIONAL: { color: '#f59e0b', bg: '#f59e0b14', border: '#f59e0b40', Icon: AlertTriangle, label: 'Conditional' },
  INELIGIBLE: { color: '#ef4444', bg: '#ef444414', border: '#ef444440', Icon: XCircle, label: 'Ineligible' },
}

const ALL_FILTERS = ['ALL', 'ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE']

export default function ManagerTenders({ manager }) {
  const [tenders, setTenders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('ALL')
  const [detail, setDetail] = useState(null)       // selected tender for slide-out
  const [expanded, setExpanded] = useState({})         // collapsible verdict groups

  const deptIds = (manager.departments || []).map(d => d.Department_ID).join(',')
  const [markingId, setMarkingId] = useState(null)

  const markStatus = async (tenderId, status) => {
    setMarkingId(tenderId)
    try {
      await fetch(`${API}/api/tenders/${tenderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setTenders(prev => prev.map(t =>
        t.tender_id === tenderId ? { ...t, participation_status: status } : t
      ))
      // Update detail if open
      setDetail(prev => prev && prev.tender_id === tenderId ? { ...prev, participation_status: status } : prev)
    } catch (_) { }
    finally { setMarkingId(null) }
  }

  useEffect(() => {
    if (!deptIds) { setLoading(false); return }
    fetch(`${API}/api/manager/tenders?dept_ids=${deptIds}`)
      .then(r => r.json())
      .then(data => {
        setTenders(data)
        setExpanded({ ELIGIBLE: true, CONDITIONAL: true, INELIGIBLE: false })
      })
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [deptIds])

  const filtered = filter === 'ALL' ? tenders : tenders.filter(t => t.verdict === filter)
  const grouped = {
    ELIGIBLE: filtered.filter(t => t.verdict === 'ELIGIBLE'),
    CONDITIONAL: filtered.filter(t => t.verdict === 'CONDITIONAL'),
    INELIGIBLE: filtered.filter(t => t.verdict === 'INELIGIBLE'),
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, position: 'relative' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>My Tenders</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
          Showing {filtered.length} tender{filtered.length !== 1 ? 's' : ''} for {(manager.departments || []).map(d => d.Department_Name).join(', ')}
        </div>
      </div>

      {/* Filter tabs (SVG icons, no emoji) */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
        {ALL_FILTERS.map(f => {
          const cfg = V[f]
          const isAll = f === 'ALL'
          const active = filter === f
          const count = isAll ? tenders.length : tenders.filter(t => t.verdict === f).length
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20,
                border: `1px solid ${active ? (isAll ? 'var(--brand)' : cfg.border) : 'var(--border)'}`,
                background: active ? (isAll ? 'var(--brand)12' : cfg.bg) : 'var(--card-bg)',
                color: active ? (isAll ? 'var(--brand)' : cfg.color) : 'var(--text-2)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {!isAll && <cfg.Icon size={13} />}
              {isAll ? 'All' : cfg.label}
              <span style={{
                background: active ? (isAll ? 'var(--brand)25' : `${cfg.color}30`) : 'var(--bg-2)',
                color: active ? (isAll ? 'var(--brand)' : cfg.color) : 'var(--text-muted)',
                borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700,
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24 }}>Loading tenders…</div>}

      {!loading && filtered.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, width: '100%', boxSizing: 'border-box' }}>
          No tenders in this category yet.
        </div>
      )}

      {/* Grouped verdict sections */}
      {!loading && ['ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE'].map(verdict => {
        const group = grouped[verdict]
        if (group.length === 0 && filter !== 'ALL') return null
        if (group.length === 0) return null
        const cfg = V[verdict]
        const Icon = cfg.Icon
        const open = expanded[verdict]
        return (
          <div key={verdict} style={{ marginBottom: 20 }}>
            {/* Section header */}
            <button
              onClick={() => setExpanded(p => ({ ...p, [verdict]: !p[verdict] }))}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 8,
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                cursor: 'pointer', marginBottom: open ? 8 : 0,
              }}
            >
              <Icon size={15} style={{ color: cfg.color }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: cfg.color,
                background: `${cfg.color}25`, borderRadius: 10, padding: '0 7px',
              }}>{group.length}</span>
              <span style={{ marginLeft: 'auto', color: cfg.color }}>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </button>

            {/* Tender cards */}
            {open && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.map(t => (
                  <TenderCard
                    key={`${t.tender_id}-${t.dept_id}`}
                    tender={t}
                    cfg={cfg}
                    onOpen={() => setDetail(t)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Centered modal detail panel */}
      {detail && (
        <DetailPanel
          tender={detail}
          onClose={() => setDetail(null)}
          onMark={markStatus}
          markingId={markingId}
        />
      )}
    </div>
  )
}

function TenderCard({ tender: t, cfg, onOpen }) {
  const [showGaps, setShowGaps] = useState(false)
  const isConditional = t.verdict === 'CONDITIONAL'

  return (
    <div style={{
      background: '#ffffff', border: '1px solid var(--border)',
      borderRadius: 10, overflow: 'hidden',
      transition: 'border-color 0.15s', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Main row */}
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}
        onClick={onOpen}
      >
        {/* Score badge */}
        <div style={{
          minWidth: 52, textAlign: 'center',
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          borderRadius: 8, padding: '6px 8px',
        }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>
            {t.score.toFixed(0)}
          </div>
          <div style={{ fontSize: 9, color: cfg.color, fontWeight: 600 }}>/100</div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t.tender_name}</span>
            {(t.tender_status === 'NEW' || t.tender_status === 'MODIFIED') && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: t.tender_status === 'NEW' ? '#dbeafe' : '#fff7ed',
                color: t.tender_status === 'NEW' ? '#1d4ed8' : '#c2410c',
                border: `1px solid ${t.tender_status === 'NEW' ? '#bfdbfe' : '#fed7aa'}`,
                letterSpacing: '0.05em', lineHeight: 1,
              }}>
                {t.tender_status === 'NEW' ? '★ NEW' : '⟳ UPDATED'}
              </span>
            )}
          </div>
          {t.summary && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>{t.summary}</div>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {t.org && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.org}</span>}
            {t.deadline && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={10} /> {t.deadline}
              </span>
            )}
            {t.days_remaining != null && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 8,
                background: t.days_remaining > 14 ? '#dcfce7' : t.days_remaining > 3 ? '#fef9c3' : '#fee2e2',
                color: t.days_remaining > 14 ? '#16a34a' : t.days_remaining > 3 ? '#854d0e' : '#dc2626',
                border: `1px solid ${t.days_remaining > 14 ? '#86efac' : t.days_remaining > 3 ? '#fde047' : '#fca5a5'}`,
              }}>
                {t.days_remaining > 0 ? `${t.days_remaining}d left` : 'Lapsed'}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.dept_name}</span>
          </div>
        </div>

        {/* Verdict chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <cfg.Icon size={13} style={{ color: cfg.color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
          <ExternalLink size={11} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />
        </div>
      </div>

      {/* Conditional: "What's Missing" inline section + Deadline stages */}
      {(isConditional || t.clarification_date || t.query_deadline || t.final_deadline) && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Deadline stages timeline */}
          {(t.clarification_date || t.query_deadline || t.final_deadline) && (
            <div style={{ padding: '10px 16px', background: 'var(--bg-2)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[['Clarification Meeting', t.clarification_date], ['Query Deadline', t.query_deadline], ['Final Submission', t.final_deadline]]
                .filter(([, d]) => d)
                .map(([label, date]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{date}</span>
                  </div>
                ))
              }
            </div>
          )}

          {isConditional && (
            <div>
              <button
                onClick={() => setShowGaps(p => !p)}
                style={{
                  width: '100%', padding: '8px 16px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: '#f59e0b08', border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: '#f59e0b',
                }}
              >
                <AlertCircle size={11} />
                What's Missing?
                {(t.subject_fails?.length > 0 || t.gaps?.length > 0) && (
                  <span style={{ background: '#f59e0b25', borderRadius: 8, padding: '0 6px', fontSize: 10 }}>
                    {(t.subject_fails?.length || 0) + (t.gaps?.length || 0)} issue{((t.subject_fails?.length || 0) + (t.gaps?.length || 0)) !== 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ marginLeft: 'auto' }}>
                  {showGaps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
              </button>
              {showGaps && (
                <div style={{ padding: '10px 16px 14px', background: '#f59e0b06' }}>
                  {t.subject_fails?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Dimension Shortfalls
                      </div>
                      {t.subject_fails.map((sf, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                          <XCircle size={12} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
                          {sf}
                        </div>
                      ))}
                    </div>
                  )}
                  {t.dims?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Score Breakdown
                      </div>
                      {t.dims.map((d, i) => {
                        const pct = d.max > 0 ? (d.score / d.max) * 100 : 0
                        const barColor = pct >= 60 ? '#22c55e' : pct >= 35 ? '#f59e0b' : '#ef4444'
                        return (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)', marginBottom: 3 }}>
                              <span>{d.name}</span>
                              <span style={{ fontWeight: 600, color: barColor }}>{d.score?.toFixed(1)}/{d.max}</span>
                            </div>
                            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 2, transition: 'width 0.4s' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {t.gaps?.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                        Key Gaps
                      </div>
                      {t.gaps.filter(g => g && g.trim()).map((g, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                          <AlertTriangle size={12} style={{ color: '#f59e0b', marginTop: 1, flexShrink: 0 }} />
                          {g}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DetailPanel({ tender: t, onClose, onMark, markingId }) {
  const cfg = V[t.verdict] || V.INELIGIBLE

  const MARK_OPTIONS = [
    { key: 'PARTICIPATED', label: 'Participated', activeColor: '#3b82f6', activeBg: '#eff6ff', activeBorder: '#93c5fd' },
    { key: 'WON', label: 'Won', activeColor: '#854d0e', activeBg: '#fef9c3', activeBorder: '#fde047' },
    { key: 'NOT_PARTICIPATED', label: 'Not Participated', activeColor: '#6b7280', activeBg: '#f3f4f6', activeBorder: '#d1d5db' },
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}
      />
      {/* Centered Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 620, maxWidth: '95vw',
        maxHeight: '90vh',
        background: '#ffffff',
        borderRadius: 14,
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Sticky Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', background: '#ffffff', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, paddingRight: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{t.tender_name}</span>
                {(t.tender_status === 'NEW' || t.tender_status === 'MODIFIED') && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                    background: t.tender_status === 'NEW' ? '#dbeafe' : '#fff7ed',
                    color: t.tender_status === 'NEW' ? '#1d4ed8' : '#c2410c',
                    border: `1px solid ${t.tender_status === 'NEW' ? '#bfdbfe' : '#fed7aa'}`,
                    letterSpacing: '0.05em',
                  }}>
                    {t.tender_status === 'NEW' ? '★ NEW' : '⟳ UPDATED'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.org}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
              <X size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>

          {/* Score + Verdict */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: cfg.color }}>{t.score.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: cfg.color, fontWeight: 600 }}>/100</div>
            </div>
            <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <cfg.Icon size={14} style={{ color: cfg.color }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
              </div>
              {t.deadline && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />{t.deadline}</div>}
            </div>
          </div>

          {/* Mark as buttons */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Mark as:</span>
            {MARK_OPTIONS.map(opt => {
              const isActive = t.participation_status === opt.key
              return (
                <button
                  key={opt.key}
                  disabled={markingId === t.tender_id}
                  onClick={() => onMark(t.tender_id, opt.key)}
                  style={{
                    fontSize: 11, padding: '4px 12px', borderRadius: 20,
                    cursor: 'pointer', fontWeight: isActive ? 700 : 500,
                    border: `1px solid ${isActive ? opt.activeBorder : 'var(--border)'}`,
                    background: isActive ? opt.activeBg : 'var(--card-bg)',
                    color: isActive ? opt.activeColor : 'var(--text-2)',
                    transition: 'all 0.15s',
                    opacity: markingId === t.tender_id ? 0.6 : 1,
                  }}
                >
                  {isActive ? '✓ ' : ''}{opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Reasoning */}
          {t.reasoning && (
            <div style={{ background: '#f0f3f9', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {t.reasoning}
            </div>
          )}

          {/* Dimension bars */}
          {t.dims?.length > 0 && (
            <Section label="Score Breakdown">
              {t.dims.map((d, i) => {
                const pct = d.max > 0 ? (d.score / d.max) * 100 : 0
                const barColor = pct >= 60 ? '#22c55e' : pct >= 35 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                      <span>{d.name}</span>
                      <span style={{ fontWeight: 700, color: barColor }}>{d.score?.toFixed(1)}/{d.max}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: barColor, borderRadius: 3 }} />
                    </div>
                    {d.notes && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{d.notes}</div>}
                  </div>
                )
              })}
            </Section>
          )}

          {t.subject_fails?.length > 0 && (
            <Section label="Subject Fails" color="#ef4444">
              {t.subject_fails.map((sf, i) => (
                <ListItem key={i} icon={<XCircle size={12} style={{ color: '#ef4444' }} />} text={sf} />
              ))}
            </Section>
          )}

          {t.strengths?.filter(s => s).length > 0 && (
            <Section label="Strengths" color="#22c55e">
              {t.strengths.filter(s => s).map((s, i) => (
                <ListItem key={i} icon={<CheckCircle size={12} style={{ color: '#22c55e' }} />} text={s} />
              ))}
            </Section>
          )}

          {t.gaps?.filter(g => g).length > 0 && (
            <Section label="Gaps" color="#f59e0b">
              {t.gaps.filter(g => g).map((g, i) => (
                <ListItem key={i} icon={<AlertTriangle size={12} style={{ color: '#f59e0b' }} />} text={g} />
              ))}
            </Section>
          )}

          {t.recommendations?.filter(r => r).length > 0 && (
            <Section label="Recommendations">
              {t.recommendations.filter(r => r).map((r, i) => (
                <ListItem key={i} icon={<span style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 700 }}>{i + 1}</span>} text={r} />
              ))}
            </Section>
          )}

          {t.source_domain && (
            <a href={`https://${t.source_domain}`} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
              marginTop: 16, padding: '10px', background: 'var(--brand)12',
              border: '1px solid var(--brand)30', borderRadius: 8,
              color: 'var(--brand)', fontSize: 12, fontWeight: 600, textDecoration: 'none',
            }}>
              <ExternalLink size={13} /> View on {t.source_domain}
            </a>
          )}
        </div>
      </div>
    </>
  )
}

function Section({ label, color, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: color || 'var(--text-muted)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function ListItem({ icon, text }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
      {text}
    </div>
  )
}
