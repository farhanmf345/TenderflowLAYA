import { useState, useEffect, useCallback } from 'react'
import PageWrapper from '../components/layout/PageWrapper'
import StatCard from '../components/ui/StatCard'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { Zap, DollarSign, BarChart2, Activity } from 'lucide-react'
import api from '../lib/api'

/* ─── Helpers ────────────────────────────────────────────────────── */
const STAGE_OPTIONS = ['All Stages', 'SCRAPE', 'VALIDATE_FLASH', 'QUALIFY']
const MODEL_OPTIONS = [
  'All Models', 'gemini-1.5-flash', 'gemini-1.5-pro',
  'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro',
  'gemini-3-flash-preview', 'gemini-3.1-pro-preview',
]

const STAGE_COLOR = {
  SCRAPE: { bg: 'rgba(79,110,247,0.10)', text: '#4f6ef7', border: 'rgba(79,110,247,0.3)' },
  VALIDATE_FLASH: { bg: 'rgba(245,158,11,0.10)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  QUALIFY: { bg: 'rgba(34,197,94,0.10)', text: '#22c55e', border: 'rgba(34,197,94,0.3)' },
}
const MODEL_BADGE = {
  'gemini-1.5-flash': '#4f6ef7', 'gemini-1.5-pro': '#8b5cf6',
  'gemini-2.0-flash': '#0ea5e9', 'gemini-2.5-flash': '#3b82f6', 'gemini-2.5-pro': '#a855f7',
  'gemini-3-flash-preview': '#2563eb', 'gemini-3.1-pro-preview': '#9333ea',
}

function fmtCost(val) {
  if (val === undefined || val === null) return '-'
  if (val < 0.001) return `$${(val * 1000).toFixed(4)}m`
  return `$${val.toFixed(4)}`
}
function fmtNum(n) { return (n || 0).toLocaleString() }
function fmtTs(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/* ─── Stage badge ────────────────────────────────────────────────── */
function StageBadge({ stage }) {
  const c = STAGE_COLOR[stage] || { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 10px',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      borderRadius: 12, fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
    }}>{stage}</span>
  )
}

/* ─── Breakdown table row ────────────────────────────────────────── */
function BreakdownRow({ row, isLast }) {
  const model_color = MODEL_BADGE[row.Model] || '#64748b'
  return (
    <tr style={{ borderBottom: isLast ? 'none' : '1px solid var(--border)' }}>
      <td><StageBadge stage={row.Stage} /></td>
      <td>
        <span style={{
          fontSize: 11, fontWeight: 600, color: model_color,
          background: `${model_color}18`, padding: '2px 8px', borderRadius: 8,
        }}>{row.Model}</span>
      </td>
      <td style={{ fontWeight: 600 }}>{fmtNum(row.Call_Count)}</td>
      <td style={{ color: 'var(--text-2)' }}>{fmtNum(row.Total_Input_Tokens)}</td>
      <td style={{ color: 'var(--text-2)' }}>{fmtNum(row.Total_Output_Tokens)}</td>
      <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
        {fmtCost(row.Total_Cost_USD)}
      </td>
    </tr>
  )
}

/* ─── Toast ──────────────────────────────────────────────────────── */
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: '#ef4444', color: '#fff',
      padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 24px rgba(0,0,0,.25)',
    }}>{msg}</div>
  )
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function TokenUsage() {
  const [summary, setSummary] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [stage, setStage] = useState('All Stages')
  const [model, setModel] = useState('All Models')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [sumRes, logRes] = await Promise.all([
        api.get('/token-usage/summary'),
        api.get('/token-usage/?limit=100'),
      ])
      setSummary(sumRes.data)
      setLogs(logRes.data)
    } catch (err) {
      setToast(err.response?.data?.detail || 'Failed to load token usage data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  /* ── Filter logs client-side ─────────────────────────────────── */
  const filtered = logs.filter(l => {
    const matchStage = stage === 'All Stages' || l.Stage === stage
    const matchModel = model === 'All Models' || l.Model === model
    return matchStage && matchModel
  })

  /* ── Bar chart max ───────────────────────────────────────────── */
  const maxCost = summary
    ? Math.max(...(summary.rows || []).map(r => r.Total_Cost_USD), 0.000001)
    : 0.000001

  return (
    <PageWrapper>
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex-between mb-16">
        <div>
          <div className="page-title">AI Token Usage</div>
          <div className="page-sub">
            Monitor Gemini API consumption and estimated costs per pipeline stage
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchAll}>Refresh</button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: '60px 0' }}>
          <Spinner text="Loading token usage data..." />
        </div>
      ) : (
        <>
          {/* ── Stat Cards ────────────────────────────────────── */}
          <div className="grid-4 mb-24">
            <StatCard
              label="Total Estimated Cost"
              value={summary ? fmtCost(summary.grand_total_cost_usd) : '-'}
              sub="All-time USD"
              icon={<DollarSign size={18} color="#22c55e" />}
              iconBg="rgba(34,197,94,0.1)"
            />
            <StatCard
              label="Input Tokens"
              value={summary ? fmtNum(summary.grand_total_input_tokens) : '-'}
              sub="Prompt tokens total"
              icon={<Zap size={18} color="#4f6ef7" />}
              iconBg="rgba(79,110,247,0.1)"
            />
            <StatCard
              label="Output Tokens"
              value={summary ? fmtNum(summary.grand_total_output_tokens) : '-'}
              sub="Completion tokens total"
              icon={<BarChart2 size={18} color="#f59e0b" />}
              iconBg="rgba(245,158,11,0.1)"
            />
            <StatCard
              label="API Calls Logged"
              value={fmtNum(logs.length)}
              sub="Across all stages"
              icon={<Activity size={18} color="#8b5cf6" />}
              iconBg="rgba(139,92,246,0.1)"
            />
          </div>

          <div className="grid-2">
            {/* ── LEFT: Stage breakdown ─────────────────────── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Summary table */}
              <div className="card">
                <div className="section-title">Cost by Stage & Model</div>
                {!summary || summary.rows.length === 0 ? (
                  <EmptyState message="No token usage data yet. Run a pipeline to see costs." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Model</th>
                          <th>Calls</th>
                          <th>Input Tokens</th>
                          <th>Output Tokens</th>
                          <th>Cost (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.rows.map((row, i) => (
                          <BreakdownRow
                            key={`${row.Stage}-${row.Model}`}
                            row={row}
                            isLast={i === summary.rows.length - 1}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Cost bar chart */}
              {summary && summary.rows.length > 0 && (
                <div className="card">
                  <div className="section-title">Cost Breakdown (Visual)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {summary.rows.map(row => {
                      const pct = (row.Total_Cost_USD / maxCost) * 100
                      const c = STAGE_COLOR[row.Stage] || { bg: '#f1f5f9', text: '#64748b', border: '#e2e8f0' }
                      return (
                        <div key={`${row.Stage}-${row.Model}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                            <span style={{ color: c.text, fontWeight: 600 }}>
                              {row.Stage} / <span style={{ color: MODEL_BADGE[row.Model] || '#64748b' }}>{row.Model}</span>
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtCost(row.Total_Cost_USD)}</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: c.text,
                              borderRadius: 4,
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── RIGHT: Recent log ─────────────────────────── */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', maxHeight: 560 }}>
              <div className="flex-between" style={{ marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Recent API Calls</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select className="form-select" style={{ fontSize: 11, padding: '4px 8px' }}
                    value={stage} onChange={e => setStage(e.target.value)}>
                    {STAGE_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <select className="form-select" style={{ fontSize: 11, padding: '4px 8px' }}
                    value={model} onChange={e => setModel(e.target.value)}>
                    {MODEL_OPTIONS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {filtered.length === 0 ? (
                <EmptyState message="No log entries match filters." />
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Model</th>
                          <th>In</th>
                          <th>Out</th>
                          <th>Cost</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((l, i) => (
                          <tr key={l.Usage_ID}
                            style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <td><StageBadge stage={l.Stage} /></td>
                            <td style={{ fontSize: 11, color: MODEL_BADGE[l.Model] || '#64748b', fontWeight: 600 }}>
                              {l.Model}
                            </td>
                            <td style={{ color: 'var(--text-2)' }}>{fmtNum(l.Input_Tokens)}</td>
                            <td style={{ color: 'var(--text-2)' }}>{fmtNum(l.Output_Tokens)}</td>
                            <td style={{ fontWeight: 600, color: 'var(--brand)' }}>
                              {fmtCost(l.Estimated_Cost_USD)}
                            </td>
                            <td style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {fmtTs(l.Timestamp)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                Costs are estimates based on published Gemini API pricing.
                Showing {filtered.length} of {logs.length} records.
              </p>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  )
}
