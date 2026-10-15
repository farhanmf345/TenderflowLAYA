import { useState, useEffect } from 'react'
import PageWrapper from '../components/layout/PageWrapper'
import StatCard from '../components/ui/StatCard'
import Badge from '../components/ui/Badge'
import RefreshBar from '../components/ui/RefreshBar'
import EmptyState from '../components/ui/EmptyState'
import { FileSearch, Building2, CheckCircle, Activity } from 'lucide-react'
import api from '../lib/api'
import { useStaleData } from '../lib/hooks/useStaleData'

const getLogStyles = (eventType, status) => {
  const map = {
    PIPELINE_RUN:      { icon: '⚡', badgeType: status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : null },
    EMAIL_TASK:        { icon: '✉', badgeType: status === 'SUCCESS' ? 'success' : 'danger' },
    EMAIL_SUPPRESSED:  { icon: '✉', badgeType: 'warning' },
    QUALIFIER_RUN:     { icon: 'Q', badgeType: 'eligible' },
    VALIDATION_PASS:   { icon: '✓', badgeType: null },
    DEDUP_DISCARD:     { icon: '⊗', badgeType: null },
    FINGERPRINT_DISCARD:{ icon: '⊗', badgeType: null },
    FLASH_DISCARD:     { icon: '⊗', badgeType: null },
    SIGNAL_DISCARD:    { icon: '⊗', badgeType: null },
    SCRAPE_RUN_STARTED:{ icon: '▶', badgeType: null },
    SCRAPE_RUN_ENDED:  { icon: '⏹', badgeType: null },
    NEW_TENDER:        { icon: '+', badgeType: 'success' },
    TENDER_UPDATED:    { icon: '↻', badgeType: null },
  }
  return map[eventType] || { icon: '•', badgeType: null }
}

const EVENT_LABEL_MAP = {
  PIPELINE_RUN:          'Pipeline Run',
  SCRAPE_RUN_STARTED:    'Scrape Run Started',
  SCRAPE_RUN_ENDED:      'Scrape Run Completed',
  VALIDATION_PASS:       'Tender Validated',
  DEDUP_DISCARD:         'Duplicate Tender Skipped',
  FINGERPRINT_DISCARD:   'Duplicate Tender Skipped',
  SIGNAL_DISCARD:        'Tender Filtered Out',
  FLASH_DISCARD:         'Tender Pre-Check Skipped',
  QUALIFIER_RUN:         'Qualification Scored',
  EMAIL_TASK:            'Email Notification Sent',
  EMAIL_SUPPRESSED:      'Email Notification Suppressed',
  NEW_TENDER:            'New Tender Stored',
  TENDER_UPDATED:        'Tender Updated',
}

const EVENT_TYPES = [
  'All Event Types',
  'SCRAPE_RUN_STARTED', 'SCRAPE_RUN_ENDED', 'VALIDATION_PASS',
  'DEDUP_DISCARD', 'FINGERPRINT_DISCARD', 'SIGNAL_DISCARD', 'FLASH_DISCARD',
  'QUALIFIER_RUN', 'EMAIL_TASK', 'EMAIL_SUPPRESSED',
  'TENDER_UPDATED', 'NEW_TENDER', 'PIPELINE_RUN',
]
const STATUSES = ['All Statuses', 'SUCCESS', 'WARNING', 'FAILED', 'SKIPPED']

const ACTIVITY_LOG_LIMIT = 100

const humanLabel = (value) => {
  if (!value || typeof value !== 'string') return value
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

const humanStatus = (status) => {
  const map = { SUCCESS: 'Success', FAILED: 'Failed', WARNING: 'Warning', SKIPPED: 'Skipped' }
  return map[status] || humanLabel(status)
}

const parseActivityDetails = (rawJson) => {
  try {
    return JSON.parse(rawJson || '{}')
  } catch {
    return {}
  }
}

const formatScore = (score) => {
  if (score == null) return null
  const n = Number(score)
  return Number.isFinite(n) ? (Number.isInteger(n) ? n : Math.round(n * 10) / 10) : score
}

const formatActivityHeadline = (eventType, status, details) => {
  if (eventType === 'QUALIFIER_RUN' && details?.status === 'started') {
    return { title: 'Qualification Started', statusLabel: humanStatus(status) }
  }
  const title = EVENT_LABEL_MAP[eventType] || eventType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  return { title, statusLabel: humanStatus(status) }
}

const formatActivitySentence = (eventType, d) => {
  if (!d || typeof d !== 'object') return ''

  if (eventType === 'EMAIL_TASK') {
    const recipient = d.recipient ? `to ${d.recipient}` : ''
    const extras = []
    if (d.verdict) extras.push(`a verdict of ${humanLabel(d.verdict)}`)
    if (d.score != null) extras.push(`a score of ${formatScore(d.score)}`)
    if (recipient && extras.length) return `${recipient} with ${extras.join(' and ')}.`
    if (recipient) return `${recipient}.`
    return extras.length ? `Notification sent with ${extras.join(' and ')}.` : 'Eligibility notification was sent.'
  }

  if (eventType === 'EMAIL_SUPPRESSED') {
    const reason = d.reason ? humanLabel(d.reason.replace(/_/g, ' ')) : 'qualification gate rules'
    const extras = []
    if (d.verdict) extras.push(`a verdict of ${humanLabel(d.verdict)}`)
    if (d.score != null) extras.push(`a score of ${formatScore(d.score)}`)
    const tail = extras.length ? ` (${extras.join(' with ')})` : ''
    return `Email was not sent because ${reason} was not met${tail}.`
  }

  if (eventType === 'QUALIFIER_RUN') {
    if (d.status === 'started') {
      return 'Evaluating this tender against the linked department profile and participation rules.'
    }
    const parts = []
    if (d.score != null) parts.push(`scored ${formatScore(d.score)} out of 100`)
    if (d.verdict) parts.push(`with a verdict of ${humanLabel(d.verdict)}`)
    let sentence = parts.length ? `Tender was ${parts.join(' ')}.` : 'Tender qualification completed.'
    if (d.gate_passed === true) sentence += ' The qualification gate passed.'
    else if (d.gate_passed === false) sentence += ' The qualification gate did not pass, so no email was sent.'
    return sentence
  }

  if (eventType === 'SCRAPE_RUN_STARTED') {
    const portal = d.portal ? ` for ${d.portal}` : ''
    return `Extraction pipeline started${portal}.`
  }

  if (eventType === 'SCRAPE_RUN_ENDED') {
    const portal = d.portal ? ` on ${d.portal}` : ''
    const found = d.tenders_found != null ? `${d.tenders_found} tender${d.tenders_found === 1 ? '' : 's'} found` : null
    const stored = d.tenders_stored != null ? `${d.tenders_stored} stored` : null
    const discarded = d.tenders_discarded != null ? `${d.tenders_discarded} discarded` : null
    const duration = d.duration_sec != null ? ` in ${d.duration_sec} second${d.duration_sec === 1 ? '' : 's'}` : ''
    const stats = [found, stored, discarded].filter(Boolean).join(', ')
    if (d.error) return `Scrape run failed${portal}: ${d.error}.`
    if (stats) return `Scrape completed${portal}${duration}: ${stats}.`
    return `Scrape run finished${portal}${duration}.`
  }

  if (eventType === 'VALIDATION_PASS') {
    const name = d.tender ? `"${d.tender}"` : 'A tender'
    const source = d.source ? ` from ${d.source}` : ''
    return `${name} passed validation and was stored${source}.`
  }

  if (eventType === 'DEDUP_DISCARD' || eventType === 'FINGERPRINT_DISCARD' || eventType === 'FLASH_DISCARD') {
    const name = d.tender ? `"${d.tender}"` : 'This tender'
    const reason = d.reason ? d.reason.toLowerCase() : 'it was identified as a duplicate'
    return `${name} was skipped because ${reason}.`
  }

  if (eventType === 'SIGNAL_DISCARD') {
    const name = d.tender ? `"${d.tender}"` : 'This tender'
    const reason = d.reason ? d.reason.toLowerCase() : 'it did not meet pre-filter criteria'
    return `${name} was filtered out because ${reason}.`
  }

  if (eventType === 'TENDER_UPDATED') {
    const name = d.tender ? `"${d.tender}"` : 'An existing tender'
    return `${name} was updated with newer scraped details.`
  }

  if (eventType === 'NEW_TENDER') {
    const name = d.tender ? `"${d.tender}"` : 'A new tender'
    return `${name} was discovered and added to the watchlist.`
  }

  if (eventType === 'PIPELINE_RUN') {
    if (d.message) return d.message
    const portal = d.portal ? ` for ${d.portal}` : ''
    return `Pipeline event recorded${portal}.`
  }

  return formatKvSentence(d)
}

const formatKvSentence = (d) => {
  if (!d || typeof d !== 'object' || !Object.keys(d).length) return ''
  const parts = Object.entries(d).map(([k, v]) => {
    const label = k.replace(/_/g, ' ')
    const val = Array.isArray(v) ? v.join(', ') : v
    return `${label} was ${val}`
  })
  return parts.length ? `${parts.join('; ')}.` : ''
}

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return 'Unknown'
  const isTimezoneAware = dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr)
  const normalized = isTimezoneAware ? dateStr : dateStr + 'Z'
  const date = new Date(normalized)
  if (isNaN(date.getTime())) return dateStr
  const diff = Math.floor((new Date() - date) / 60000)
  if (diff < 1) return 'Just now'
  if (diff < 60) return `${diff} min ago`
  const hrs = Math.floor(diff / 60)
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

const DEFAULT_DASH = {
  agents: [],
  stats:  { total_scraped: 0, eligible_tenders: 0, active_departments: 0, pipeline_events: 0 },
  trend:  [],
  logs:   [],
}

/* ─── Component ─────────────────────────────────────────────── */
export default function Dashboard() {
  const [eventType, setEventType] = useState('All Event Types')
  const [statusFilter, setStatus] = useState('All Statuses')
  const [dateFilter, setDate] = useState('')

  const { data, isRefreshing } = useStaleData(
    'dashboard',
    async () => {
      const [agentsRes, statsRes, trendRes, logsRes] = await Promise.all([
        api.get('/scheduler/agents').catch(() => ({ data: [] })),
        api.get('/dashboard/stats').catch(() => ({ data: DEFAULT_DASH.stats })),
        api.get('/dashboard/trend').catch(() => ({ data: [] })),
        api.get(`/activity/?limit=${ACTIVITY_LOG_LIMIT}`).catch(() => ({ data: [] })),
      ])
      const agents = (agentsRes.data || []).map(a => ({
        id:      a.id,
        portal:  a.portal_name || a.portal,
        freq:    a.freq_type || 'Custom',
        lastRun: a.last_run ? formatTimeAgo(a.last_run) : 'Never',
        status:  a.status === 'active' || a.status === 'running' ? 'active' : 'inactive',
        label:   a.status === 'running' ? 'Running' : a.status === 'active' ? 'Active' : 'Paused',
      }))
      return {
        agents,
        stats:  statsRes.data  || DEFAULT_DASH.stats,
        trend:  trendRes.data  || [],
        logs:   logsRes.data   || [],
      }
    },
    DEFAULT_DASH,
  )

  const { agents: scraperAgents, stats, trend } = data
  const [logs, setLogs] = useState(data.logs)

  // Keep logs in sync when stale data refreshes
  useEffect(() => { setLogs(data.logs) }, [data.logs])

  // Re-fetch logs when filters change
  useEffect(() => {
    let url = `/activity/?limit=${ACTIVITY_LOG_LIMIT}`
    if (eventType !== 'All Event Types') url += `&event_type=${eventType}`
    api.get(url).then(res => {
      let filtered = res.data || []
      if (statusFilter !== 'All Statuses') filtered = filtered.filter(l => l.Status === statusFilter)
      if (dateFilter) filtered = filtered.filter(l => l.Timestamp?.startsWith(dateFilter))
      setLogs(filtered)
    }).catch(console.error)
  }, [eventType, statusFilter, dateFilter])

  const maxTrendCount = Math.max(...trend.map(t => t.count), 1)

  return (
    <PageWrapper>
      {/* ── Page Header ──────────────────────────────────── */}
      <div className="flex-between mb-16">
        <div className="page-title">Dashboard</div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            const d = new Date()
            d.setDate(d.getDate() - 30)
            setDate(d.toISOString().slice(0, 10))
          }}
        >
          Last 30 days
        </button>
      </div>

      {/* ── Stat Cards (4 cols) ─────────────────────────── */}
      <div className="grid-4 mb-24" style={{ position: 'relative' }}>
        <RefreshBar visible={isRefreshing} />
        <StatCard label="Total Tenders Scraped" value={stats.total_scraped.toLocaleString()} sub="All-time indexed" icon={<FileSearch size={18} color="#4f6ef7" />} iconBg="rgba(79,110,247,0.1)" />
        <StatCard label="Eligible Tenders" value={stats.eligible_tenders.toLocaleString()} sub="Verdict ELIGIBLE (≥60/100 · 120/200)" icon={<CheckCircle size={18} color="#22c55e" />} iconBg="rgba(34,197,94,0.1)" />
        <StatCard label="Active Departments" value={stats.active_departments} sub="Within validity period" icon={<Building2 size={18} color="#f59e0b" />} iconBg="rgba(245,158,11,0.1)" />
        <StatCard label="Pipeline Events" value={stats.pipeline_events.toLocaleString()} sub="All-time logged events" icon={<Activity size={18} color="#8b5cf6" />} iconBg="rgba(139,92,246,0.1)" />
      </div>

      {/* ── Two-column grid ──────────────────────────────── */}
      <div className="grid-2">

        {/* ── LEFT: Activity Feed ──────────────────────── */}
        <div className="card" style={{ position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: 640 }}>
          <RefreshBar visible={isRefreshing} />
          <div className="section-title">Activity Feed</div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <select className="form-select" style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
              value={eventType} onChange={e => setEventType(e.target.value)}>
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{t === 'All Event Types' ? t : (EVENT_LABEL_MAP[t] || t)}</option>
              ))}
            </select>
            <select className="form-select" style={{ fontSize: 11, padding: '4px 8px', flex: 1 }}
              value={statusFilter} onChange={e => setStatus(e.target.value)}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <input className="form-input" type="date"
              style={{ fontSize: 11, padding: '4px 8px', flex: 1.2 }}
              value={dateFilter} onChange={e => setDate(e.target.value)} />
          </div>

          {/* Log items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', flex: 1, minHeight: 0, paddingRight: 4 }}>
            {logs.length === 0 ? (
              <EmptyState message="No recent activity found" />
            ) : (
              logs.map((log, i) => {
                const styles = getLogStyles(log.Event_Type, log.Status)
                const details = parseActivityDetails(log.Details_JSON)
                const { title, statusLabel } = formatActivityHeadline(log.Event_Type, log.Status, details)
                const sentence = formatActivitySentence(log.Event_Type, details)
                return (
                  <div key={log.Log_ID} className="log-item" style={{
                    borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div className="log-icon">{styles.icon}</div>
                    <div className="log-body">
                      <div className="log-event">
                        <span>{title}</span>
                        <span className="log-status">({statusLabel})</span>
                      </div>
                      {sentence && <div className="log-detail">{sentence}</div>}
                    </div>
                    <div className="log-time">{formatTimeAgo(log.Timestamp)}</div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: Trend + Agents ────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Weekly Tender Trend */}
          <div className="card" style={{ position: 'relative' }}>
            <RefreshBar visible={isRefreshing} />
            <div className="section-title">Weekly Tender Trend</div>
            {trend.length === 0 ? (
              <EmptyState message="No trend data for the last 7 days." />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
                {trend.map(({ date, day, count }) => {
                  const barH = maxTrendCount > 0 ? Math.max((count / maxTrendCount) * 110, count > 0 ? 4 : 0) : 0
                  const isHi = count === maxTrendCount && count > 0
                  return (
                    <div key={date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                      <div
                        title={`${count} tender${count !== 1 ? 's' : ''} on ${date}`}
                        style={{
                          width: '100%', height: barH,
                          background: isHi ? 'rgba(79,70,229,.75)' : 'rgba(79,70,229,.28)',
                          borderRadius: '4px 4px 0 0',
                          transition: 'height .3s ease',
                        }}
                      />
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, fontWeight: 500 }}>{day}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Extraction Agents */}
          <div className="card" style={{ position: 'relative' }}>
            <RefreshBar visible={isRefreshing} />
            <div className="section-title">Extraction Agents</div>
            {scraperAgents.length === 0 ? (
              <EmptyState message="No extraction agents configured yet." />
            ) : (
              <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                <div className="table-wrap">
                  <table>
                  <thead>
                    <tr>
                      <th>Portal</th>
                      <th>Frequency</th>
                      <th>Last Run</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scraperAgents.map(a => (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 500 }}>{a.portal}</td>
                        <td style={{ color: 'var(--text-2)' }}>{a.freq}</td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.lastRun}</td>
                        <td>
                          <Badge type={a.status}>{a.label}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </PageWrapper>
  )
}
