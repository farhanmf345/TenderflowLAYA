import { useState, useEffect, useRef, Fragment } from 'react'
import { createPortal } from 'react-dom'
import PageWrapper from '../components/layout/PageWrapper'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { formatDate } from '../lib/utils/dateUtils'
import { Search, X, ChevronDown } from 'lucide-react'
import api from '../lib/api'

function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: '#ef4444', color: '#fff',
      padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 24px rgba(0,0,0,.25)',
    }}>{msg}</div>
  )
}

const VERDICTS = ['All Verdicts', 'ELIGIBLE', 'CONDITIONAL', 'INELIGIBLE']

const verdictColor = {
  ELIGIBLE: 'var(--success)',
  CONDITIONAL: 'var(--warning)',
  INELIGIBLE: 'var(--danger)',
}
const verdictBadge = {
  ELIGIBLE: 'eligible',
  CONDITIONAL: 'conditional',
  INELIGIBLE: 'ineligible',
}

function parseOrgs(org) {
  if (!org || org.toLowerCase() === 'none') return null
  const parts = String(org).split(/\s*\|\|\s*/).filter(Boolean)
  if (parts.length > 1) return parts
  return String(org).split(/\s*\|\s*/).filter(Boolean)
}

function OrgCell({ org }) {
  const orgs = parseOrgs(org)
  if (!orgs?.length) {
    return <span className="text-muted" style={{ fontStyle: 'italic', opacity: 0.5 }}>Not Specified</span>
  }
  const fullText = orgs.join(' · ')
  const extra = orgs.length - 1
  return (
    <div className="cell-truncate" title={fullText}>
      <span>{orgs[0]}</span>
      {extra > 0 && <span className="org-more-badge">+{extra} more</span>}
    </div>
  )
}

/* ─── Dept Qualifications Popup ────────────────────────────────── */
// Normalize backend field that may be a string or an array
const toArray = (val) => {
  if (!val) return []
  if (Array.isArray(val)) return val.filter(Boolean)
  return String(val).split(' · ').filter(Boolean)
}

function DeptPopup({ qualifications, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)

    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)',
      zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div ref={ref} style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        width: 680,
        maxWidth: '95vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          background: '#fff',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Department Qualifications
            </div>
            <div style={{ fontSize: 11, color: 'var(--text)', opacity: 0.6, marginTop: 2 }}>
              {qualifications.length} department{qualifications.length !== 1 ? 's' : ''} evaluated
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            style={{ padding: '4px 8px', lineHeight: 1 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body - scrollable */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14, background: '#f8fafc' }}>
          {qualifications.map(q => (
            <div key={q.result_id} style={{
              flexShrink: 0,
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              overflow: 'hidden',
              background: '#fff',
            }}>
              {/* Dept header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#f1f5f9',
                borderBottom: '1px solid #e2e8f0',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    {q.dept_name}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    background: 'var(--brand)', color: '#fff',
                    borderRadius: 4, padding: '2px 7px',
                  }}>
                    {q.sector}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: verdictColor[q.verdict] }}>
                    {q.score}<span style={{ fontSize: 10, color: 'var(--text)', opacity: 0.5, fontWeight: 400 }}>/100</span>
                  </span>
                  <Badge type={verdictBadge[q.verdict]}>{q.verdict}</Badge>
                </div>
              </div>

              {/* Dimension bars */}
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.dims.map(d => (
                  <div key={d.name} title={d.notes || 'Hover for scoring evidence'} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 168, fontSize: 11, fontWeight: 500, color: 'var(--text)', flexShrink: 0 }}>{d.name}</div>
                    <div style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: 'rgba(0,0,0,0.08)', overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${d.max > 0 ? (d.score / d.max) * 100 : 0}%`,
                        background: d.max > 0 && d.score / d.max >= 0.75
                          ? '#16a34a'
                          : d.max > 0 && d.score / d.max >= 0.4
                            ? '#d97706'
                            : '#dc2626',
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ width: 44, fontSize: 11, fontWeight: 600, color: 'var(--text)', textAlign: 'right' }}>
                      {d.score}/{d.max}
                    </div>
                  </div>
                ))}

                {/* Scoring Insight Summary */}
                {q.reasoning && (
                  <div style={{
                    marginTop: 10, padding: '8px 12px',
                    background: 'var(--bg)',
                    borderRadius: 8, fontSize: 11,
                    color: 'var(--text-2)', lineHeight: 1.7,
                    border: '1px solid var(--border)',
                    fontStyle: 'italic',
                  }}>
                    {q.reasoning}
                  </div>
                )}

                {/* Strengths */}
                {toArray(q.strengths).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: '#16a34a', fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
                      ✅ Strengths
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {toArray(q.strengths).map((s, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
                          <span style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }}>▲</span>
                          <span>{s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Gaps */}
                {toArray(q.gaps).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: '#dc2626', fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
                      ⚠ Gaps
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {toArray(q.gaps).map((g, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6 }}>
                          <span style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }}>▼</span>
                          <span>{g}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                {toArray(q.recommendations).length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: 'var(--brand)', fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
                      💡 Recommendations
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {toArray(q.recommendations).map((r, i) => {
                        const isCritical = r.toUpperCase().startsWith('CRITICAL')
                        return (
                          <div key={i} style={{
                            fontSize: 11, lineHeight: 1.7,
                            padding: '7px 11px',
                            borderRadius: 7,
                            background: isCritical ? 'var(--danger-bg, #fef2f2)' : 'var(--brand-muted, #eff6ff)',
                            color: isCritical ? 'var(--danger, #dc2626)' : 'var(--text-2)',
                            border: `1px solid ${isCritical ? 'var(--danger, #dc2626)' : 'var(--border)'}`,
                          }}>
                            {r}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}

/* ─── Main Page ─────────────────────────────────────────────────── */
const STATUS_TABS = [
  { id: 'active',       label: 'Active',       color: '#22c55e' },
  { id: 'lapsed',      label: 'Lapsed',       color: '#ef4444' },
  { id: 'participated',label: 'Participated',  color: 'var(--brand)' },
  { id: 'won',         label: 'Won',          color: '#f59e0b' },
]

const FLAG_LABELS = {
  needs_bank_guarantee: 'Bank guarantee',
  needs_emd: 'EMD required',
  state_restricted: 'State-restricted',
  local_presence: 'Local presence',
  msme_preference: 'MSME preference',
  startup_preference: 'Startup relaxation',
  women_preference: 'Women preference',
}
// Preferences are good news for the bidder; everything else is a requirement/risk.
const FLAG_IS_BENEFIT = new Set(['msme_preference', 'startup_preference', 'women_preference'])

// What the tender itself requires (from the requirement classifier). Hidden if not run.
function RequirementChips({ req }) {
  if (!req) return null
  const certs = req.required_certificates || []
  const flags = req.flags || []
  if (!certs.length && !flags.length) return null
  const evidenceTitle = key => {
    const snippets = req.raw?.evidence?.[key] || []
    return snippets.length ? `Tender evidence: ${snippets.join(' | ')}` : 'No matching source sentence found; review manually.'
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}
         title="Detected from the tender text. Hover over a chip to inspect supporting source text.">
      {certs.map(c => <span key={`c-${c}`} title={evidenceTitle(`certificate:${c}`)}><Badge type="warning">Needs {c}</Badge></span>)}
      {flags.map(f => (
        <span key={f} title={evidenceTitle(f)}><Badge type={FLAG_IS_BENEFIT.has(f) ? 'eligible' : 'warning'}>{FLAG_LABELS[f] || f}</Badge></span>
      ))}
    </div>
  )
}


function CompareLayaModal({ tender, qualification, onClose }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [departmentId, setDepartmentId] = useState(String(qualification.dept_id))
  const activeQualification = tender.qualifications?.find(q => String(q.dept_id) === departmentId) || qualification

  useEffect(() => {
    let cancelled = false
    api.post(`/tenders/${tender.tender_id}/compare-laya`, { department_id: activeQualification.dept_id })
      .then(res => { if (!cancelled) setResult(res.data) })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.detail || 'Could not run Laya comparison. Check that the backend and database are available.')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [tender.tender_id, activeQualification.dept_id])

  const overlay = { position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
  const panel = { width: 980, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card-bg, #fff)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, boxShadow: '0 20px 70px rgba(0,0,0,.3)' }
  const scoreColor = v => v === 'ELIGIBLE' ? '#16a34a' : v === 'CONDITIONAL' ? '#d97706' : '#dc2626'
  const factorNames = [...new Set([...(result?.saved_score?.dimensions || []).map(d => d.name), ...(result?.laya_score?.dimensions || []).map(d => d.name)])]
  const oldByName = Object.fromEntries((result?.saved_score?.dimensions || []).map(d => [d.name, d]))
  const newByName = Object.fromEntries((result?.laya_score?.dimensions || []).map(d => [d.name, d]))
  // Hybrid model split implemented in the scoring layer: Python rules for four factors; Laya assessment for three.
  const scoringMethod = name => ['Financial Strength', 'Legal Standing', 'Geographic Alignment', 'DEI Bonus'].includes(name)
    ? { label: 'Python rules', detail: 'Deterministic checks / calculations', color: '#2563eb', bg: 'rgba(37,99,235,.09)' }
    : ['Domain Experience', 'Technical Capability', 'Certifications & Registrations'].includes(name)
      ? { label: 'Laya assessment', detail: 'Model-based interpretation', color: '#7c3aed', bg: 'rgba(124,58,237,.09)' }
      : { label: 'Hybrid review', detail: 'Method not identified', color: 'var(--text-2)', bg: 'var(--bg)' }

  return createPortal(
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Scoring comparison</div>
            <div style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>{tender.name} · {activeQualification.dept_name}</div>
            {tender.qualifications?.length > 1 && <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <label htmlFor="compare-dept">Department:</label>
              <select id="compare-dept" className="form-select" value={departmentId} onChange={e => { setDepartmentId(e.target.value); setResult(null); setError(''); setLoading(true) }} style={{ maxWidth: 300, fontSize: 12 }}>
                {tender.qualifications.map(q => <option key={q.dept_id} value={String(q.dept_id)}>{q.dept_name}</option>)}
              </select>
            </div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={15} /> Close</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', margin: '10px 0 14px', lineHeight: 1.6 }}>
          The saved database score is shown beside a fresh evaluation. This comparison does not replace the saved score or send qualification emails.
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 18, background: 'var(--bg, #f8fafc)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>Hybrid scoring model</span>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 999, color: '#166534', background: 'rgba(22,163,74,.12)' }}>PYTHON + LAYA</span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 10 }}>Python applies rule-based checks and calculations; Laya interprets more subjective evidence. The final qualification score combines the factor results.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {[{label: 'Python rules', names: 'Financial Strength · Legal Standing · Geographic Alignment · DEI Bonus', color: '#2563eb', bg: 'rgba(37,99,235,.09)'}, {label: 'Laya assessment', names: 'Domain Experience · Technical Capability · Certifications & Registrations', color: '#7c3aed', bg: 'rgba(124,58,237,.09)'}].map(item => <div key={item.label} style={{ border: `1px solid ${item.color}40`, background: item.bg, borderRadius: 8, padding: '8px 10px', flex: '1 1 270px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: item.color, marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 11, lineHeight: 1.5 }}>{item.names}</div>
            </div>)}
          </div>
        </div>
        {loading && <div style={{ padding: 40 }}><Spinner text="Running Laya against this tender and company profile… first run may take longer while the model initializes." /></div>}
        {error && <div style={{ padding: 14, borderRadius: 8, background: 'var(--danger-bg, #fef2f2)', color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error}</div>}
        {result && !loading && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { title: 'Existing saved score', data: result.saved_score, caption: result.saved_score.evaluated_at ? `Saved evaluation · ${new Date(result.saved_score.evaluated_at).toLocaleString()}` : 'Previously saved result' },
              { title: 'New Laya score', data: result.laya_score, caption: 'Fresh, not saved over the historical result' },
            ].map(card => <div key={card.title} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: .7 }}>{card.title}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: scoreColor(card.data.verdict) }}>{Number(card.data.score).toFixed(1)}</span><span style={{ fontSize: 12, opacity: .6 }}>/100</span>
                <Badge type={verdictBadge[card.data.verdict] || 'default'}>{card.data.verdict}</Badge>
              </div>
              <div style={{ fontSize: 11, opacity: .65, marginTop: 7 }}>{card.caption}</div>
            </div>)}
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: .7 }}>Score difference</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8, color: result.score_delta > 0 ? '#16a34a' : result.score_delta < 0 ? '#dc2626' : 'var(--text)' }}>{result.score_delta > 0 ? '+' : ''}{Number(result.score_delta).toFixed(1)}</div>
              <div style={{ fontSize: 11, opacity: .65, marginTop: 7 }}>Laya score minus saved score</div>
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>Factor-by-factor comparison</div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'var(--bg, #f8fafc)', textAlign: 'left' }}>
                {['Factor', 'Scoring method', 'Saved score', 'Fresh score', 'Change', 'Evidence / explanation'].map(h => <th key={h} style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{h}</th>)}
              </tr></thead>
              <tbody>{factorNames.map(name => {
                const old = oldByName[name], fresh = newByName[name]
                const delta = old && fresh ? Number(fresh.score) - Number(old.score) : null
                return <tr key={name}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, minWidth: 150 }}>{name}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', minWidth: 140 }}><span title={scoringMethod(name).detail} style={{ display: 'inline-block', padding: '4px 7px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: scoringMethod(name).color, background: scoringMethod(name).bg }}>{scoringMethod(name).label}</span></td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{old ? `${Number(old.score).toFixed(1)} / ${old.max}` : '—'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{fresh ? `${Number(fresh.score).toFixed(1)} / ${fresh.max}` : '—'}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', color: delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : 'inherit', whiteSpace: 'nowrap' }}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}</td>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', minWidth: 260, lineHeight: 1.5 }}>{fresh?.notes || 'No explanation returned.'}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
          {result.laya_score.reasoning && <div style={{ marginTop: 14, padding: 12, background: 'var(--bg, #f8fafc)', borderRadius: 8, fontSize: 12, lineHeight: 1.6 }}>{result.laya_score.reasoning}</div>}
          {(result.laya_score.hard_disqualifiers?.length > 0 || result.laya_score.subject_fails?.length > 0) && <div style={{ marginTop: 12, color: '#dc2626', fontSize: 12 }}><strong>Eligibility checks:</strong> {[...result.laya_score.hard_disqualifiers, ...result.laya_score.subject_fails].join(' · ')}</div>}
          <div style={{ marginTop: 14, fontSize: 11, opacity: .65 }}>Note: the saved record may not contain its original scoring-version metadata, so it is identified as the existing saved score. Laya scores are model estimates; review the quoted tender evidence and company records before making a bid decision.</div>
        </>}
      </div>
    </div>, document.body
  )
}

export default function TenderBrowser() {
  const [tenders, setTenders]         = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [verdict, setVerdict]         = useState('All Verdicts')
  const [date, setDate]               = useState('')
  const [applied, setApplied]         = useState({ search: '', verdict: 'All Verdicts', date: '' })
  const [expanded, setExpanded]       = useState(null)  // kept for future use
  const [deptPopup, setDeptPopup]     = useState(null)
  const [compareSelection, setCompareSelection] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [currentPage, setCurrentPage] = useState(1)
  const [fetchError, setFetchError] = useState(null)
  const itemsPerPage = 10
  const portalList = ['All Portals', ...new Set(tenders.map(t => t.portal).filter(Boolean))]
  const [portal, setPortal] = useState('All Portals')

  useEffect(() => {
    setLoading(true)
    setFetchError(null)
    api.get(`/tenders/browser?status=${statusFilter}`)
      .then(res => { setTenders(res.data); setLoading(false) })
      .catch(() => {
        setTenders([])
        setFetchError('Failed to load tenders. Please try again.')
        setLoading(false)
      })
  }, [statusFilter])

  const applyFilters = () => { setApplied({ search, verdict, date }); setCurrentPage(1) }
  const clearFilters = () => {
    setSearch(''); setVerdict('All Verdicts'); setPortal('All Portals'); setDate('')
    setApplied({ search: '', verdict: 'All Verdicts', date: '' })
    setCurrentPage(1)
  }

  const filtered = tenders.filter(t => {
    const q = applied.search.toLowerCase()
    const matchSearch = !q || (t.name && t.name.toLowerCase().includes(q)) || (t.org && t.org.toLowerCase().includes(q))
    const matchVerdict = applied.verdict === 'All Verdicts' || t.best_verdict === applied.verdict
    const matchPortal = portal === 'All Portals' || t.portal === portal
    const matchDate = !applied.date || (t.deadline && t.deadline.slice(0, 10) <= applied.date)
    return matchSearch && matchVerdict && matchPortal && matchDate
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage))
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  useEffect(() => { setCurrentPage(1) }, [applied, portal])


  return (
    <PageWrapper>
      {fetchError && <Toast msg={fetchError} onClose={() => setFetchError(null)} />}
      {deptPopup && (
        <DeptPopup qualifications={deptPopup} onClose={() => setDeptPopup(null)} />
      )}
      {compareSelection && (
        <CompareLayaModal tender={compareSelection.tender} qualification={compareSelection.qualification} onClose={() => setCompareSelection(null)} />
      )}

      {/* Header */}
      <div className="flex-between mb-16">
        <div>
          <div className="page-title">Tender Watchlist</div>
          <div className="page-sub">{tenders.length} tenders — qualified against relevant departments</div>
        </div>
      </div>

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(s => (
          <button key={s.id} onClick={() => { setStatusFilter(s.id); setCurrentPage(1) }}
            style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: `1px solid ${statusFilter === s.id ? s.color : 'var(--border)'}`, background: statusFilter === s.id ? `${s.color}14` : 'var(--card-bg)', color: statusFilter === s.id ? s.color : 'var(--text-2)', transition: 'all 0.15s' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="card mb-16">
        <div className="filter-bar">
          <div style={{ position: 'relative', flex: 2, minWidth: 160 }}>
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-muted)',
            }} />
            <input
              className="form-input"
              style={{ paddingLeft: 30, fontSize: 12 }}
              placeholder="Search tender name or issuing organisation…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyFilters()}
            />
          </div>

          <select className="form-select" style={{ width: 140, fontSize: 12 }}
            value={verdict} onChange={e => setVerdict(e.target.value)}>
            {VERDICTS.map(v => <option key={v}>{v}</option>)}
          </select>

          <select className="form-select" style={{ width: 150, fontSize: 12 }}
            value={portal} onChange={e => setPortal(e.target.value)}>
            {portalList.map(p => <option key={p}>{p}</option>)}
          </select>

          <input className="form-input" type="date" style={{ width: 140, fontSize: 12 }}
            value={date} onChange={e => setDate(e.target.value)} />

          <button className="btn btn-primary btn-sm" onClick={applyFilters}>Apply</button>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          <table className="tender-browser-table">
            <thead>
              <tr>
                <th className="col-name">Tender Name</th>
                <th className="col-org">Issuing Organisation</th>
                <th className="col-depts">Departments</th>
                <th className="col-deadline">Deadline</th>
                <th className="col-source">Source</th>
                <th className="col-score">Best Score</th>
                <th className="col-verdict">Best Verdict</th>
                <th>Compare scoring</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                              <tr>
                  <td colSpan={8} style={{ padding: '60px 0' }}>
                    <Spinner text="Fetching qualified tenders..." />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 0' }}>
                    <EmptyState message="No tenders match the current filters." />
                  </td>
                </tr>
              ) : (
                paginated.map(t => (
                  <Fragment key={t.tender_id}>
                    <tr>
                      {/* Name */}
                      <td className="col-name">
                        <div className="cell-clamp-2" title={t.name}>{t.name}</div>
                        {t.summary && <div className="cell-clamp-2 cell-summary" title={t.summary}>{t.summary}</div>}
                        <RequirementChips req={t.requirements} />
                      </td>

                      {/* Org */}
                      <td className="col-org">
                        <OrgCell org={t.org} />
                      </td>

                      {/* Departments pill - click opens popup */}
                      <td onClick={e => { e.stopPropagation(); if (t.qualifications?.length) setDeptPopup(t.qualifications) }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{
                            fontSize: 11, padding: '3px 8px',
                            display: 'flex', alignItems: 'center', gap: 4,
                            borderRadius: 6,
                          }}
                        >
                          <span style={{
                            background: 'var(--brand)', color: '#fff',
                            borderRadius: '50%', width: 16, height: 16,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                          }}>
                            {t.qualifications?.length ?? 0}
                          </span>
                          Dept{(t.qualifications?.length ?? 0) !== 1 ? 's' : ''}
                          <ChevronDown size={11} />
                        </button>
                      </td>

                      {/* Deadline */}
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                        {formatDate(t.deadline)}
                      </td>

                      {/* Source */}
                      <td>
                        <a href={`https://${t.portal}`} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--brand)', fontSize: 11 }}
                          onClick={e => e.stopPropagation()}>
                          {t.portal}
                        </a>
                      </td>

                      {/* Best Score */}
                      <td>
                        <span style={{ fontWeight: 700, fontSize: 13, color: verdictColor[t.best_verdict] }}>{typeof t.best_score === 'number' ? t.best_score.toFixed(1) : t.best_score}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>/100</span>
                      </td>

                      {/* Best Verdict */}
                      <td>
                        <Badge type={verdictBadge[t.best_verdict]}>{t.best_verdict}</Badge>
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <button className="btn btn-primary btn-sm" disabled={!t.qualifications?.length}
                          onClick={() => setCompareSelection({ tender: t, qualification: t.qualifications[0] })}
                          title="Compare the saved score with a fresh Laya evaluation">
                          Compare with Laya
                        </button>
                      </td>
                    </tr>


                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex-between mt-16" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          <span>
            Showing {Math.min(filtered.length, (currentPage - 1) * itemsPerPage + 1)} to{' '}
            {Math.min(filtered.length, currentPage * itemsPerPage)} of {filtered.length} tenders
          </span>
          <div className="flex-gap">
            <button className="btn btn-ghost btn-sm" disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, i, arr) => (
                <Fragment key={p}>
                  {i > 0 && arr[i - 1] !== p - 1 && <span style={{ padding: '0 4px' }}>...</span>}
                  <button
                    className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-ghost'}`}
                    style={currentPage === p ? { fontWeight: 700 } : {}}
                    onClick={() => setCurrentPage(p)}
                  >
                    {p}
                  </button>
                </Fragment>
              ))}
            <button className="btn btn-ghost btn-sm" disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
              Next
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}
