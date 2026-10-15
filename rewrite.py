import re

with open('client/src/pages/Scheduler.jsx', 'r', encoding='utf-8') as f:
    sched_code = f.read()

with open('client/src/pages/ScraperConfig.jsx', 'r', encoding='utf-8') as f:
    conf_code = f.read()

# 1. Extract Scheduler Helpers
sched_helpers_match = re.search(r'(const STATUS_OPTIONS = .*?)(?=\/\* ─── Main component ───)', sched_code, re.DOTALL)
sched_helpers = sched_helpers_match.group(1) if sched_helpers_match else ""

# Modify AgentCard to include Edit and Delete
sched_helpers = sched_helpers.replace(
    'function AgentCard({ agent, onTrigger, onToggle, busy }) {',
    'function AgentCard({ agent, onTrigger, onToggle, busy, onEdit, onDelete, deleting }) {'
)

actions_block = """
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {isRunning ? (
            <>
              <button className="btn btn-primary" style={{ flex: 1, opacity: 0.5, cursor: 'not-allowed' }} disabled>
                Pipeline Running…
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onToggle(agent.id, 'pause')} disabled={busy}>
                Deactivate
              </button>
            </>
          ) : isInactive ? (
            <>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => onTrigger(agent.id)} disabled={busy}>
                Trigger Now
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => onToggle(agent.id, 'activate')} disabled={busy}>
                Activate
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onTrigger(agent.id)} disabled={busy}>
                Trigger Now
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onToggle(agent.id, 'pause')} disabled={busy}>
                Deactivate
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }}>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => onEdit(agent)}>Edit Config</button>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1, color: '#ef4444' }} onClick={() => onDelete(agent.id)} disabled={deleting === agent.id}>
            {/*Trash2 is imported in ScraperConfig*/}
            {deleting === agent.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
"""

sched_helpers = re.sub(
    r'<div style={{ display: \'flex\', gap: 8, marginTop: \'auto\' }}>.*?<\/div>\s*<\/div>\s*\)\s*\}',
    actions_block + '\n    </div>\n  )\n}',
    sched_helpers, flags=re.DOTALL
)

# 2. ScraperConfig new top section
conf_top = conf_code.split('/* ─── Main ───────────────────────────────────────────────────────── */')[0]
conf_top += '\n/* ─── Scheduler Helpers ─────────────────────────────────────────── */\n'
conf_top += sched_helpers
conf_top += '\n/* ─── Main ───────────────────────────────────────────────────────── */\n'

# 3. Main component body replacements
main_body = conf_code.split('/* ─── Main ───────────────────────────────────────────────────────── */')[1]

# State
state_replacement = """  const [agents,    setAgents]    = useState([])
  const [runLog,    setRunLog]    = useState([])
  const [logLoad,   setLogLoad]   = useState(true)
  const [busy,      setBusy]      = useState(false)
  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('All Statuses')
  const [freqF,     setFreqF]     = useState('All Freq. Types')
  const [applied,   setApplied]   = useState({ search: '', status: 'All Statuses', freq: 'All Freq. Types' })
  
  const [portals,   setPortals]   = useState([])
  const [freqMeta,  setFreqMeta]  = useState([])
  const [globals,   setGlobals]   = useState({ Max_Concurrent: 2, Scrape_Gap_Sec: 10, Max_Retries: 2, Retry_Interval_Sec: 60 })
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [showValMsg, setShowValMsg] = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState(null)
  const [globalMsg, setGlobalMsg] = useState(null)
  const [form,      setForm]      = useState(EMPTY_FORM)
  const [deleting,  setDeleting]  = useState(null)
  const [editingGlobals, setEditingGlobals] = useState(false)
  const [departments, setDepartments] = useState([])"""

main_body = re.sub(r'const \[agents.*?setDepartments\(\[\]\).*?\n', state_replacement + '\n', main_body, flags=re.DOTALL)

# FetchAll update
fetch_repl = """  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [agRes, portRes, freqRes, globRes, deptRes] = await Promise.all([
        api.get('/scheduler/agents'),
        api.get('/portals/'),
        api.get('/scheduler/frequencies'),
        api.get('/scheduler/globals'),
        api.get('/departments/'),
      ])
      setAgents(agRes.data)
      setPortals(portRes.data)
      setFreqMeta(freqRes.data)
      setGlobals(globRes.data)
      setDepartments(deptRes.data)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to load data.', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

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

  useEffect(() => {
    fetchAll()
    fetchRunLog()
    const id = setInterval(() => { fetchAll(); fetchRunLog() }, 30_000)
    return () => clearInterval(id)
  }, [fetchAll, fetchRunLog])"""

main_body = re.sub(r'const fetchAll = useCallback.*?useEffect\(\(\) => \{ fetchAll\(\) \}, \[fetchAll\]\)', fetch_repl, main_body, flags=re.DOTALL)

# openEdit update
open_edit_repl = """  const openEdit = (a) => {
    const cfg = a.freq_config || {}
    const freqType = cfg.type || a.freq_type || ''
    setForm({
      portalId:  String(a.portal_id),
      freqId:    String(a.freq_id),
      status:    a.is_active ? 'Y' : 'N',
      freqType,
      dotwDays:  cfg.days  || [],
      weekEvery: cfg.every || 1,
      weekDays:  cfg.days  || [],
      weekUntil: cfg.until || '',
      monthDay:  cfg.day   || 1,
      atTime:    cfg.time  || '09:00',
    })
    setEditingId(a.id)
    setShowForm(true)
  }"""

main_body = re.sub(r'const openEdit = \(a\) => \{.*?setTimeout\(\(\) => window\.scrollTo\(\{ top: 0, behavior: \'smooth\' \}\), 50\)\n  \}', open_edit_repl, main_body, flags=re.DOTALL)

# Handlers and Filters right before `return (`
handlers = """
  const handleTrigger = async (agentId) => {
    setBusy(true)
    try {
      await api.post(`/scheduler/trigger/${agentId}`)
      showToast('Pipeline triggered! Check run log for progress.')
      setTimeout(fetchRunLog, 2000)
    } catch (err) {
      showToast(err.response?.data?.detail || 'Trigger failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = async (agentId, action) => {
    setBusy(true)
    try {
      await api.post(`/scheduler/${action}/${agentId}`)
      showToast(action === 'pause' ? 'Agent deactivated.' : 'Agent activated.')
      await fetchAll()
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
    const matchFreq   = applied.freq   === 'All Freq. Types' || a.freq_type === applied.freq
    return matchSearch && matchStatus && matchFreq
  })
"""

main_body = main_body.replace('  return (', handlers + '\n  return (')

# Extracting bottom half of Scheduler
sched_bottom_match = re.search(r'\{\/\* ── Stats strip ────────────────────────────────────── \*\/}(.*)<\/PageWrapper>', sched_code, re.DOTALL)
sched_bottom = "{/* ── Stats strip ────────────────────────────────────── */}" + sched_bottom_match.group(1) if sched_bottom_match else ""

# Ensure we replace `status` and `freq` in select boxes with `statusF` and `freqF`
sched_bottom = sched_bottom.replace('value={status} onChange={e => setStatus(e.target.value)}', 'value={statusF} onChange={e => setStatusF(e.target.value)}')
sched_bottom = sched_bottom.replace('value={freq} onChange={e => setFreq(e.target.value)}', 'value={freqF} onChange={e => setFreqF(e.target.value)}')

# Replace the AgentCard call in sched_bottom
sched_bottom = sched_bottom.replace(
    'onToggle={handleToggle}',
    'onToggle={handleToggle}\n              onEdit={openEdit}\n              onDelete={deleteAgent}\n              deleting={deleting}'
)

# Insert the bottom half into Conf
main_body = re.sub(r'\{\/\* ── Active Agents Table ──────────────────────────────── \*\/\}.*?<\/PageWrapper>', sched_bottom + '\n    </PageWrapper>', main_body, flags=re.DOTALL)

with open('client/src/pages/ScraperConfig.jsx', 'w', encoding='utf-8') as f:
    f.write(conf_top + main_body)

print("Merged successfully!")
