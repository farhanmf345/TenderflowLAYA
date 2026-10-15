import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import PageWrapper from '../components/layout/PageWrapper'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import { Plus, Play, Trash2, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { useStaleData } from '../lib/hooks/useStaleData'
import RefreshBar from '../components/ui/RefreshBar'
import ConfirmDialog from '../components/ui/ConfirmDialog'

/* ─── Static lookup ──────────────────────────────────────────────── */
const FREQ_TYPES = [
  { value: '', label: 'Select type…' },
  { value: 'daily', label: 'Daily' },
  { value: 'dotw', label: 'Day of Week (DoTW)' },
  { value: 'weekly', label: 'Weekly (selected days)' },
  { value: 'monthly', label: 'Monthly (day of month)' },
  { value: 'attime', label: 'At Time (HH:MM)' },
  { value: 'interval', label: 'Interval (hours)' },
]
const DAYS = [
  { key: 'Mon', label: 'M' }, { key: 'Tue', label: 'T' },
  { key: 'Wed', label: 'W' }, { key: 'Thu', label: 'T' },
  { key: 'Fri', label: 'F' }, { key: 'Sat', label: 'S' },
  { key: 'Sun', label: 'S' },
]
const EMPTY_FORM = {
  portalId: '', freqId: '', status: 'Y',
  freqType: '', dotwDays: [], weekDays: [],
  monthDay: 1, atTime: '09:00', intervalHours: 6,
}

/* ─── Scheduler Helpers ─────────────────────────────────────────── */
const STATUS_OPTIONS = ['All Statuses', 'active', 'inactive', 'running']
const FREQ_OPTIONS = ['All Freq. Types', 'daily', 'dotw', 'weekly', 'monthly', 'attime', 'interval', 'custom']

const runBadgeClass = {
  SUCCESS: 'badge-success',
  FAILED: 'badge-failed',
  SKIPPED: 'badge-skipped',
}

function fmtTs(iso) {
  if (!iso) return '-'
  // Append 'Z' if no timezone info - treats DB naive UTC timestamps correctly
  const utc = /[Zz]$/.test(iso) || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z'
  return new Date(utc).toLocaleString('en-IN', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

function fmtDuration(sec) {
  if (sec == null) return '-'
  return sec < 60 ? `${sec}s` : `${(sec / 60).toFixed(1)}m`
}

function AgentBadge({ status }) {
  if (status === 'running') {
    return (
      <span className="badge badge-running" style={{ gap: 6 }}>
        <span className="sched-spinner" />
        Running
      </span>
    )
  }
  if (status === 'active') return <span className="badge badge-active">Active</span>
  if (status === 'inactive') return <span className="badge badge-inactive">Inactive</span>
  return null
}

function AgentCard({ agent, onTrigger, onToggle, busy, onEdit, onDelete, deleting }) {
  const isRunning = agent.status === 'running'
  const isInactive = agent.status === 'inactive'

  const freqLabel = agent.freq_type || '-'
  const kwString = (agent.keywords || []).slice(0, 5).join(', ') || '-'

  const INFO = [
    { lbl: 'Freq. Type', val: freqLabel },
    { lbl: 'Last Run', val: agent.last_run ? fmtTs(agent.last_run) : '-' },
    { lbl: 'Next Run', val: agent.next_run ? fmtTs(agent.next_run) : isInactive ? '- (Inactive)' : '-' },
    // { lbl: 'Tenders', val: agent.tenders_count != null ? `${agent.tenders_count} tenders` : '-' },
    { lbl: 'Keywords', val: kwString },
  ]

  return (
    <div
      className="agent-card"
      style={{
        borderColor: isRunning ? 'var(--brand)' : 'var(--border)',
        opacity: isInactive ? 0.78 : 1,
      }}
    >
      <div className="flex-between" style={{ marginBottom: 0, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Agent ID Circle */}
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--brand-muted)', color: 'var(--brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, flexShrink: 0,
            border: '1px solid var(--border)'
          }}>
            #{agent.id}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              {agent.portal}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              {agent.portal_name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AgentBadge status={agent.status} />

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {isRunning ? (
              <button className="btn btn-ghost btn-sm" onClick={() => onToggle(agent.id, 'pause')} disabled={!!busy}>
                {busy === agent.id + '_toggle' ? 'Deactivating…' : 'Deactivate'}
              </button>
            ) : isInactive ? (
              <button className="btn btn-primary btn-sm" onClick={() => onToggle(agent.id, 'activate')} disabled={!!busy}>
                {busy === agent.id + '_toggle' ? 'Activating…' : 'Activate'}
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={() => onToggle(agent.id, 'pause')} disabled={!!busy}>
                {busy === agent.id + '_toggle' ? 'Deactivating…' : 'Deactivate'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => onEdit(agent)} style={{ padding: '5px 8px' }}>
              Edit
            </button>
            <button className="btn btn-ghost btn-sm" style={{ color: '#ef4444', border: 'none', padding: '5px 8px' }} onClick={() => onDelete(agent.id)} disabled={deleting === agent.id}>
              {deleting === agent.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>

      <div className="agent-info-grid">
        {INFO.map(({ lbl, val }) => (
          <div key={lbl}>
            <div className="lbl">{lbl}</div>
            <div className="val">{val}</div>
          </div>
        ))}
      </div>

      {agent.departments?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {agent.departments.map(d => (
            <span key={d.id} className="chip" style={{ fontSize: 10 }}>{d.name}</span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {isRunning ? (
            <button className="btn btn-primary" style={{ opacity: 0.5, cursor: 'not-allowed', minWidth: 140 }} disabled>
              Pipeline Running…
            </button>
          ) : isInactive ? (
            <button className="btn btn-ghost" style={{ opacity: 0.45, cursor: 'not-allowed', minWidth: 140 }} disabled title="Activate this agent to trigger a pipeline run">
              Trigger Now
            </button>
          ) : (
            <button className="btn btn-primary" style={{ minWidth: 140 }} onClick={() => onTrigger(agent.id)} disabled={!!busy}>
              {busy === agent.id ? 'Triggering…' : 'Trigger Now'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="agent-card" style={{ opacity: 0.5 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 14, borderRadius: 6,
          background: 'var(--border)', marginBottom: 10,
          width: i === 1 ? '60%' : i === 2 ? '80%' : '40%',
          animation: 'pulse 1.5s infinite',
        }} />
      ))}
    </div>
  )
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function getSuffix(n) {
  if (n >= 11 && n <= 13) return 'th'
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th' }
}
function buildFreqSummary({ freqType, dotwDays, weekDays, monthDay, atTime, intervalHours }) {
  if (freqType === 'daily') return `Runs every day at ${atTime}.`
  if (freqType === 'dotw') return dotwDays.length ? `Runs on ${dotwDays.join(', ')} at ${atTime}.` : 'Select at least one day.'
  if (freqType === 'weekly') return weekDays.length ? `Runs weekly on ${weekDays.join(', ')} at ${atTime}.` : 'Select at least one day.'
  if (freqType === 'monthly') return `Runs on the ${monthDay}${getSuffix(parseInt(monthDay))} of every month at ${atTime}.`
  if (freqType === 'attime') return `Runs daily at ${atTime}.`
  if (freqType === 'interval') return `Runs every ${intervalHours} hour(s).`
  return ''
}
function buildFreqConfigJSON(form) {
  const { freqType, dotwDays, weekDays, monthDay, atTime, intervalHours } = form
  if (freqType === 'daily') return JSON.stringify({ type: 'daily', time: atTime })
  if (freqType === 'dotw') return JSON.stringify({ type: 'dotw', days: dotwDays, time: atTime })
  if (freqType === 'weekly') return JSON.stringify({ type: 'weekly', days: weekDays, time: atTime })
  if (freqType === 'monthly') return JSON.stringify({ type: 'monthly', day: monthDay, time: atTime })
  if (freqType === 'attime') return JSON.stringify({ type: 'attime', time: atTime })
  if (freqType === 'interval') return JSON.stringify({ type: 'interval', hours: parseInt(intervalHours, 10) || 6 })
  return '{}'
}

/* ─── Toast ──────────────────────────────────────────────────────── */
function Toast({ msg, type = 'success', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: type === 'error' ? '#ef4444' : 'var(--brand)', color: '#fff',
      padding: '12px 20px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      boxShadow: '0 4px 24px rgba(0,0,0,.25)',
    }}>{msg}</div>
  )
}

/* ─── Day picker ─────────────────────────────────────────────────── */
function DayPicker({ selected, onChange }) {
  const toggle = day => onChange(selected.includes(day) ? selected.filter(d => d !== day) : [...selected, day])
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {DAYS.map(({ key, label }) => (
        <button key={key} type="button" onClick={() => toggle(key)} style={{
          width: 34, height: 34, borderRadius: '50%',
          border: `2px solid ${selected.includes(key) ? 'var(--brand)' : 'var(--border)'}`,
          background: selected.includes(key) ? 'var(--brand)' : 'var(--card)',
          color: selected.includes(key) ? '#fff' : 'var(--text-2)',
          fontSize: 12, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all .15s', flexShrink: 0,
        }}>{label}</button>
      ))}
    </div>
  )
}

/* ─── Main ───────────────────────────────────────────────────────── */
export default function ScraperConfig() {
  const navigate = useNavigate()

  // Scheduler state
  const [runLog, setRunLog] = useState([])
  const [logLoad, setLogLoad] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('All Statuses')
  const [freqF, setFreqF] = useState('All Freq. Types')
  const [applied, setApplied] = useState({ search: '', status: 'All Statuses', freq: 'All Freq. Types' })

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)   // null = create, number = editing agent id
  const [showValMsg, setShowValMsg] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [globalMsg, setGlobalMsg] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editingGlobals, setEditingGlobals] = useState(false)

  const showToast = (msg, type = 'success') => setToast({ msg, type })
  const setF = patch => setForm(f => ({ ...f, ...patch }))

  /* ── Fetch all data (Initial Load) ─────────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    // Run sequentially to avoid connection pool spikes
    const agRes = await api.get('/scheduler/agents').catch(() => ({ data: [] }))
    const portRes = await api.get('/portals/').catch(() => ({ data: [] }))
    const freqRes = await api.get('/scheduler/frequencies').catch(() => ({ data: [] }))
    const globRes = await api.get('/scheduler/globals').catch(() => ({ data: { Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60 } }))
    const deptRes = await api.get('/departments/').catch(() => ({ data: [] }))

    return {
      agents: agRes.data || [],
      portals: portRes.data || [],
      freqMeta: freqRes.data || [],
      globals: globRes.data || { Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60, ChromaDB_Dedup_Threshold: 0.96 },
      departments: deptRes.data || []
    }
  }, [])

  const DEFAULT_DATA = { agents: [], portals: [], freqMeta: [], globals: { Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60, ChromaDB_Dedup_Threshold: 0.96 }, departments: [] }
  const { data: staleData, isRefreshing, setData: setStaleData } = useStaleData('scraper_config_page', fetchAll, DEFAULT_DATA)

  const [agents, setAgents] = useState(staleData?.agents || [])
  const [portals, setPortals] = useState(staleData?.portals || [])
  const [freqMeta, setFreqMeta] = useState(staleData?.freqMeta || [])
  const [globals, setGlobals] = useState(staleData?.globals || { Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60, ChromaDB_Dedup_Threshold: 0.96 })
  const [departments, setDepartments] = useState(staleData?.departments || [])

  useEffect(() => {
    setAgents(staleData?.agents || [])
    setPortals(staleData?.portals || [])
    setFreqMeta(staleData?.freqMeta || [])
    setGlobals(staleData?.globals || { Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60, ChromaDB_Dedup_Threshold: 0.96 })
    setDepartments(staleData?.departments || [])
  }, [staleData])

  const fetchRunLog = useCallback(async () => {
    try {
      const res = await api.get('/scheduler/run-log', { params: { limit: 25 } })
      setRunLog(res.data)
    } catch {
      // silent
    } finally {
      setLogLoad(false)
    }
  }, [])

  // Poll for agent status updates if any agent is currently running
  useEffect(() => {
    const hasRunning = agents.some(a => a.status === 'running')
    if (!hasRunning) return
    const id = setInterval(async () => {
      try {
        const agRes = await api.get('/scheduler/agents')
        setStaleData(prev => ({ ...prev, agents: agRes.data || [] }))
        await fetchRunLog()
      } catch (err) { }
    }, 3000)
    return () => clearInterval(id)
  }, [agents, fetchRunLog, setStaleData])

  useEffect(() => {
    fetchRunLog()
    const id = setInterval(() => {
      fetchAll().then(fresh => setStaleData(fresh)).catch(() => { })
      fetchRunLog()
    }, 30_000)
    return () => clearInterval(id)
  }, [fetchAll, fetchRunLog, setStaleData])

  /* ── Derived: linked depts & keywords for selected portal ─────────── */
  const selectedPortalId = parseInt(form.portalId)
  const linkedDepts = departments
    .filter(d => (d.portal_mapping || []).some(pm => pm.portal?.Portal_ID === selectedPortalId))
    .map(d => ({ id: d.Department_ID, name: d.Department_Name }))
  const mergedKws = [...new Set(
    departments
      .filter(d => (d.portal_mapping || []).some(pm => pm.portal?.Portal_ID === selectedPortalId))
      .flatMap(d => (d.keyword_mapping || []).map(km => km.keyword?.Keyword).filter(Boolean))
  )]

  /* ── Open edit - pre-populate form from existing agent ─────────── */
  const openEdit = (a) => {
    const cfg = a.freq_config || {}
    const freqType = cfg.type || a.freq_type || ''

    // Normalize casing - handle both Portal_ID (from scraper-agents) and portal_id (from scheduler/agents)
    const pId = a.Portal_ID || a.portal_id || ''
    const fId = a.Freq_ID || a.freq_id || ''

    setForm({
      portalId: String(pId),
      freqId: String(fId),
      status: a.Is_Active || a.is_active ? 'Y' : 'N',
      freqType,
      dotwDays: cfg.type === 'dotw' ? (cfg.days || []) : [],
      weekDays: cfg.type === 'weekly' ? (cfg.days || []) : [],
      monthDay: cfg.day || 1,
      atTime: cfg.time || '09:00',
      intervalHours: cfg.hours || 6,
    })
    setEditingId(a.ScraperAgent_ID || a.id)
    setShowForm(true)
  }

  /* ── Save (create or update) agent ──────────────────────────────── */
  const saveAgent = async () => {
    if (!form.portalId || !form.freqType) {
      showToast('Please select portal and frequency type.', 'error')
      return
    }
    setSaving(true)
    const pId = parseInt(form.portalId)
    if (isNaN(pId)) {
      showToast('Invalid Portal selection.', 'error')
      return
    }

    const payload = {
      Portal_ID: pId,
      Freq_ID: parseInt(form.freqId) || (freqMeta[0]?.Freq_ID || 1),
      Is_Active: form.status === 'Y',
      Freq_Config_JSON: buildFreqConfigJSON(form),
    }
    try {
      if (editingId) {
        await api.put(`/scraper-agents/${editingId}`, payload)
        showToast('Extraction agent updated successfully!')
      } else {
        await api.post('/scraper-agents/', payload)
        showToast('Extraction agent created successfully!')
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      fetchAll().then(setStaleData).catch(() => { })
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to save agent.', 'error')
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete agent ───────────────────────────────────────────────── */
  const deleteAgent = async (id) => {
    setDeleting(id)
    try {
      await api.delete(`/scraper-agents/${id}`)
      showToast('Agent deleted.')
      fetchAll().then(setStaleData).catch(() => { })
    } catch (err) {
      showToast(err.response?.data?.detail || 'Delete failed.', 'error')
    } finally {
      setDeleting(null)
    }
  }

  /* ── Save globals ───────────────────────────────────────────────── */
  const saveGlobals = async () => {
    try {
      await api.put('/scheduler/globals', globals)
      setGlobalMsg('Saved!')
      setEditingGlobals(false)
      setTimeout(() => setGlobalMsg(null), 2000)
    } catch {
      showToast('Failed to save global params.', 'error')
    }
  }
  const resetGlobals = () => setGlobals({ Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60, ChromaDB_Dedup_Threshold: 0.96 })

  const freqSummary = buildFreqSummary(form)
  const portalLabel = id => portals.find(p => p.Portal_ID === parseInt(id))?.Base_URL || id

  /* ── Per-type validation ─────────────────────────────────────────── */
  const freqValid = (() => {
    if (!form.freqType) return { ok: false, msg: 'Frequency type is required.' }
    if (form.freqType === 'daily') return { ok: true, msg: '' }
    if (form.freqType === 'dotw') return form.dotwDays.length > 0
      ? { ok: true, msg: '' }
      : { ok: false, msg: 'Select at least one day of the week.' }
    if (form.freqType === 'weekly') return form.weekDays.length > 0
      ? { ok: true, msg: '' }
      : { ok: false, msg: 'Select at least one day for the weekly recurrence.' }
    if (form.freqType === 'monthly') return parseInt(form.monthDay) >= 1 && parseInt(form.monthDay) <= 31
      ? { ok: true, msg: '' }
      : { ok: false, msg: 'Enter a valid day of month (1–31).' }
    if (form.freqType === 'attime') return form.atTime
      ? { ok: true, msg: '' }
      : { ok: false, msg: 'Enter a time (HH:MM).' }
    if (form.freqType === 'interval') return parseInt(form.intervalHours, 10) >= 1
      ? { ok: true, msg: '' }
      : { ok: false, msg: 'Enter interval hours (≥ 1).' }
    return { ok: false, msg: '' }
  })()

  const isFormValid = !!form.portalId && freqValid.ok

  /* ── Get freq ID for selected freqType ─────────────────────────── */
  const freqIdForType = (type) => {
    const map = {
      'daily': 'daily',
      'dotw': 'day of week',
      'weekly': 'weekly',
      'monthly': 'monthly',
      'attime': 'at time',
      'interval': 'interval',
    }
    const searchStr = map[type.toLowerCase()] || type.toLowerCase()
    const match = freqMeta.find(f => f.Freq_Type?.toLowerCase().includes(searchStr))
    return match ? match.Freq_ID : (freqMeta[0]?.Freq_ID || 1)
  }

  const handleTrigger = async (agentId) => {
    setBusy(agentId)
    try {
      await api.post(`/scheduler/trigger/${agentId}`)
      showToast('Pipeline triggered! Check run log for progress.')
      const agRes = await api.get('/scheduler/agents')
      setStaleData(prev => ({ ...prev, agents: agRes.data || [] }))
      setTimeout(fetchRunLog, 2000)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Trigger failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async (agentId, action) => {
    setBusy(agentId + '_toggle')
    try {
      await api.post(`/scheduler/${action}/${agentId}`)
      showToast(action === 'pause' ? 'Agent deactivated.' : 'Agent activated.')
      fetchAll().then(setStaleData).catch(() => { })
    } catch (err) {
      showToast(err.response?.data?.detail || 'Action failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const applyFilters = () => setApplied({ search, status: statusF, freq: freqF })
  const clearFilters = () => {
    setSearch(''); setStatusF('All Statuses'); setFreqF('All Freq. Types')
    setApplied({ search: '', status: 'All Statuses', freq: 'All Freq. Types' })
  }

  const filtered = agents.filter(a => {
    const q = applied.search.toLowerCase()
    const matchSearch = !q || a.portal?.toLowerCase().includes(q) || a.portal_name?.toLowerCase().includes(q)
    const matchStatus = applied.status === 'All Statuses' || a.status === applied.status
    const agentFreq = a.freq_config?.type || a.freq_type || 'custom'
    const matchFreq = applied.freq === 'All Freq. Types' || agentFreq.toLowerCase() === applied.freq.toLowerCase()
    return matchSearch && matchStatus && matchFreq
  })

  return (
    <PageWrapper>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <div className="page-title">Extraction Agents</div>
          <div className="page-sub">
            Configure extraction agents per portal — departments and keywords are automatically derived from your{' '}
            <a href="/departments" onClick={e => { e.preventDefault(); navigate('/departments') }}
              style={{ color: 'var(--brand)', textDecoration: 'underline' }}>Department settings</a>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => fetchAll().then(setStaleData).catch(() => { })} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} /> Refresh
          </button>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={14} /> New Extraction Agent
            </button>
          )}
        </div>
      </div>

      {/* ── Global Params ────────────────────────────────────── */}
      <div className="card mb-16" style={{ position: 'relative' }}>
        <RefreshBar visible={isRefreshing} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Global Scraper Parameters</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!editingGlobals ? (
              <button className="btn btn-primary btn-sm" onClick={() => setEditingGlobals(true)}>
                Edit Parameters
              </button>
            ) : (
              <>
                <button className="btn btn-primary btn-sm" onClick={saveGlobals}>
                  {globalMsg || 'Save'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={resetGlobals}>Reset</button>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  setEditingGlobals(false)
                  fetchAll().then(setStaleData).catch(() => { })
                }}>Cancel</button>
              </>
            )}
          </div>
        </div>
        <div className="globals-grid">
          {[
            { key: 'Max_Concurrent', label: 'Max Concurrent', desc: 'Max portal agents running simultaneously.' },
            { key: 'Scrape_Gap_Sec', label: 'Scrape Gap (sec)', desc: 'Min wait between successive requests.' },
            { key: 'Max_Retries', label: 'Max Retries', desc: 'Retry attempts before logging FAILED.' },
            { key: 'Retry_Interval_Sec', label: 'Retry Interval (sec)', desc: 'Wait between retry attempts.' },
          ].map(({ key, label, desc }) => (
            <div className="form-group" key={key}>
              <label className="form-label">{label}</label>
              <input className="form-input" type="number" value={globals[key]}
                disabled={!editingGlobals}
                onChange={e => setGlobals(g => ({ ...g, [key]: Number(e.target.value) }))} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{desc}</div>
            </div>
          ))}
          <div className="form-group">
            <label className="form-label">
              ChromaDB Dedup Threshold{' '}
              <strong style={{ color: 'var(--brand)' }}>{Number(globals.ChromaDB_Dedup_Threshold ?? 0.96).toFixed(2)}</strong>
            </label>
            <input
              type="range" min="0.80" max="0.99" step="0.01"
              value={globals.ChromaDB_Dedup_Threshold ?? 0.96}
              disabled={!editingGlobals}
              style={{ width: '100%', accentColor: 'var(--brand)', cursor: editingGlobals ? 'pointer' : 'default' }}
              onChange={e => setGlobals(g => ({ ...g, ChromaDB_Dedup_Threshold: Number(e.target.value) }))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Loose (0.80)</span><span>Strict (0.99)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── New Agent Modal ───────────────────────────────────── */}
      {showForm && createPortal(
        <div className="modal-backdrop fade-in" style={{ zIndex: 9999 }}>
          <div className="modal-box slide-up" style={{ maxWidth: 700, padding: 0 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingId ? `Edit Agent #${editingId}` : 'New Extraction Agent'}</h3>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setShowValMsg(false) }}>&times;</button>
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {editingId && (
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 9px' }}>
                    Editing existing agent
                  </span>
                </div>
              )}
              <div className="form-grid">

                {/* Portal */}
                <div className="form-group">
                  <label className="form-label required">Target Portal</label>
                  <select className="form-select" value={form.portalId}
                    onChange={e => setF({ portalId: e.target.value })}>
                    <option value="">Select portal…</option>
                    {portals.map(p => (
                      <option key={p.Portal_ID} value={p.Portal_ID}>{p.Base_URL} - {p.Portal_Name}</option>
                    ))}
                  </select>
                </div>

                {/* Status */}
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setF({ status: e.target.value })}>
                    <option value="Y">Yes - Active</option>
                    <option value="N">No - Inactive</option>
                  </select>
                </div>

                {/* Linked Departments (live from API) */}
                {form.portalId && (
                  <div className="form-group full">
                    <label className="form-label">
                      Linked Departments{' '}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 4, marginLeft: 6 }}>
                        AUTO - from DepartmentPortalMapping
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 42 }}>
                      {linkedDepts.length > 0
                        ? linkedDepts.map(d => <span key={d.id} className="chip">{d.name}</span>)
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No departments linked to this portal yet.</span>}
                    </div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      Departments are auto-populated from portal assignments.{' '}
                      <a href="/departments" onClick={e => { e.preventDefault(); navigate('/departments') }} style={{ color: 'var(--brand)' }}>Go to Departments</a> to change.
                    </p>
                  </div>
                )}

                {/* Keywords (live) */}
                {form.portalId && (
                  <div className="form-group full">
                    <label className="form-label">
                      Combined Keywords{' '}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 4, marginLeft: 6 }}>
                        AUTO - merged from all linked departments
                      </span>
                    </label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 42 }}>
                      {mergedKws.length > 0
                        ? mergedKws.map(k => (
                          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 12, fontSize: 11, fontWeight: 500 }}>{k}</span>
                        ))
                        : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No keywords found for this portal.</span>}
                    </div>
                  </div>
                )}

                {/* Frequency type */}
                <div className="form-group">
                  <label className="form-label required">Frequency Type</label>
                  <select className="form-select" value={form.freqType}
                    onChange={e => setF({ freqType: e.target.value, dotwDays: [], weekDays: [], freqId: freqIdForType(e.target.value) })}>
                    {FREQ_TYPES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Frequency details panel */}
              {form.freqType && (
                <div style={{ marginTop: 14, padding: 14, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  {form.freqType === 'daily' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Runs every day</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Time (24h)</label>
                        <input className="form-input" type="time" value={form.atTime} style={{ width: 'auto' }}
                          onChange={e => setF({ atTime: e.target.value })} />
                      </div>
                    </>
                  )}
                  {form.freqType === 'dotw' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Select days of the week</div>
                      <DayPicker selected={form.dotwDays} onChange={days => setF({ dotwDays: days })} />
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Time (24h)</label>
                        <input className="form-input" type="time" value={form.atTime} style={{ width: 'auto' }}
                          onChange={e => setF({ atTime: e.target.value })} />
                      </div>
                    </>
                  )}
                  {form.freqType === 'weekly' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Weekly — select days</div>
                      <DayPicker selected={form.weekDays} onChange={days => setF({ weekDays: days })} />
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Time (24h)</label>
                        <input className="form-input" type="time" value={form.atTime} style={{ width: 'auto' }}
                          onChange={e => setF({ atTime: e.target.value })} />
                      </div>
                    </>
                  )}
                  {form.freqType === 'monthly' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Monthly - day of month</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>On day</label>
                        <input className="form-input" type="number" value={form.monthDay} min={1} max={31} style={{ width: 70 }}
                          onChange={e => setF({ monthDay: e.target.value })} />
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Time (24h)</label>
                        <input className="form-input" type="time" value={form.atTime} style={{ width: 'auto' }}
                          onChange={e => setF({ atTime: e.target.value })} />
                      </div>
                    </>
                  )}
                  {form.freqType === 'interval' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Run on a fixed interval</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Every</label>
                        <input className="form-input" type="number" value={form.intervalHours} min={1} max={168} style={{ width: 80 }}
                          onChange={e => setF({ intervalHours: e.target.value })} />
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>hour(s)</label>
                      </div>
                    </>
                  )}
                  {form.freqType === 'attime' && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>At a specific time every day</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Time (24h)</label>
                        <input className="form-input" type="time" value={form.atTime} style={{ width: 'auto' }}
                          onChange={e => setF({ atTime: e.target.value })} />
                      </div>
                    </>
                  )}
                  {freqSummary && (
                    <div style={{ marginTop: 12, fontSize: 12, fontStyle: 'italic', color: 'var(--brand)', padding: '8px 12px', background: 'var(--brand-muted)', borderRadius: 6, borderLeft: '3px solid var(--brand)' }}>
                      {freqSummary}
                    </div>
                  )}
                </div>
              )}

              {/* Validation message - shown above buttons only after clicking the greyed button */}
              {showValMsg && !isFormValid && freqValid.msg && (
                <div style={{
                  marginTop: 12, marginBottom: 4,
                  fontSize: 12, fontWeight: 500,
                  color: 'var(--danger, #ef4444)',
                }}>
                  * {freqValid.msg}
                </div>
              )}

            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); setShowValMsg(false) }}>Cancel</button>
              <button
                className={`btn ${isFormValid ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => {
                  if (!isFormValid) { setShowValMsg(true); return }
                  saveAgent()
                }}
                disabled={saving}
                style={!isFormValid ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
              >
                {saving ? 'Saving…' : editingId ? 'Update Agent' : 'Save Extraction Agent'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Stats strip ────────────────────────────────────── */}
      {agents.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { lbl: 'Total Agents', val: agents.length },
            { lbl: 'Active', val: agents.filter(a => a.status === 'active').length },
            { lbl: 'Inactive', val: agents.filter(a => a.status === 'inactive').length },
            { lbl: 'Running', val: agents.filter(a => a.status === 'running').length },
          ].map(({ lbl, val }) => (
            <div key={lbl} className="card" style={{ padding: '10px 16px', marginTop: 0, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lbl}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter Bar ─────────────────────────────────────── */}
      <div className="card mb-16" style={{ position: 'relative' }}>
        <RefreshBar visible={isRefreshing} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-input"
            placeholder="Search portal URL…"
            style={{ flex: 2, minWidth: 160, fontSize: 12 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyFilters()}
          />
          <select className="form-select" style={{ width: 150, fontSize: 12 }}
            value={statusF} onChange={e => setStatusF(e.target.value)}>
            {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="form-select" style={{ width: 170, fontSize: 12 }}
            value={freqF} onChange={e => setFreqF(e.target.value)}>
            {FREQ_OPTIONS.map(f => <option key={f}>{f}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" onClick={applyFilters}>Apply</button>
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Clear</button>
        </div>
      </div>

      {/* ── Agent Cards Grid ────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <RefreshBar visible={isRefreshing} />
        {agents.length === 0 && isRefreshing ? (
          <div className="agent-grid">
            {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
            {agents.length === 0
              ? 'No extraction agents configured yet. Click New Extraction Agent to create one.'
              : 'No agents match the current filters.'}
          </div>
        ) : (
          <div className="agent-grid">
            {filtered.map(a => (
              <AgentCard
                key={a.id}
                agent={a}
                onTrigger={handleTrigger}
                onToggle={handleToggle}
                busy={busy}
                onEdit={openEdit}
                onDelete={(id) => setConfirmDelete(id)}
                deleting={deleting}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Recent Pipeline Runs ────────────────────────────── */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="flex-between" style={{ marginBottom: 12 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Recent Pipeline Runs</div>
          <button className="btn btn-ghost btn-sm" onClick={fetchRunLog} style={{ fontSize: 11 }}>
            Refresh Log
          </button>
        </div>

        {logLoad ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            Loading run log…
          </div>
        ) : runLog.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            No pipeline runs recorded yet. Trigger an agent above to see runs here.
          </div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Portal</th>
                    <th>Department</th>
                    <th>Started At</th>
                    <th>Duration</th>
                    <th>Found</th>
                    <th>Stored</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runLog.map(r => (
                    <tr key={r.log_id}>
                      <td style={{ fontWeight: 600 }}>{r.portal || '-'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.department || '-'}</td>
                      <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtTs(r.timestamp)}</td>
                      <td style={{ color: 'var(--text-2)' }}>{fmtDuration(r.duration_sec)}</td>
                      <td>{r.tenders_found ?? '-'}</td>
                      <td>{r.tenders_stored ?? '-'}</td>
                      <td>
                        <span className={`badge ${runBadgeClass[r.status] || ''}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {confirmDelete && (
          <ConfirmDialog
            title="Delete Extraction Agent"
            message="Are you sure you want to delete this extraction agent? This will stop all future scheduled scrapes for this portal."
            onConfirm={() => {
              deleteAgent(confirmDelete)
              setConfirmDelete(null)
            }}
            onCancel={() => setConfirmDelete(null)}
          />
        )}
      </div>
    </PageWrapper>
  )
}
