import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Building2, Users, Pencil, Save, X, CheckCircle } from 'lucide-react'
import DeptProjectsTab  from './DeptProjectsTab'
import DeptKeywordsTab  from './DeptKeywordsTab'
import DeptHistoryTab   from './DeptHistoryTab'
import ManagerRules     from './ManagerRules'

const API = 'http://localhost:8000'
const TABS = ['overview','projects','history','keywords','rules']
const tabLabel = t => ({ history:'Tender History', rules:'Rules' }[t] || t.charAt(0).toUpperCase()+t.slice(1))

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2800); return () => clearTimeout(t) }, [])
  return (
    <div style={{ position:'fixed', bottom:28, right:28, zIndex:9999, display:'flex', alignItems:'center', gap:8,
      padding:'10px 16px', borderRadius:10, fontSize:13, fontWeight:600,
      background: type==='success' ? '#22c55e' : '#ef4444', color:'#fff',
      boxShadow:'0 4px 20px rgba(0,0,0,0.25)', animation:'slideUp 0.2s ease' }}>
      {type==='success' ? <CheckCircle size={15}/> : <X size={15}/>} {msg}
    </div>
  )
}

export default function ManagerDepartment({ manager }) {
  const { deptId } = useParams()
  const [dept, setDept]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState('overview')
  const [toast, setToast]     = useState(null)

  // Overview edit state
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue]     = useState('')
  const [savingDesc, setSavingDesc]   = useState(false)

  const showToast = useCallback((msg, type='success') => setToast({ msg, type }), [])

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/api/departments/${deptId}`)
      .then(r => r.json()).then(d => { setDept(d); setDescValue(d.Description || '') })
      .catch(() => {}).finally(() => setLoading(false))
  }, [deptId])

  const saveDesc = async () => {
    setSavingDesc(true)
    await fetch(`${API}/api/departments/${deptId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Description: descValue })
    })
    setDept(d => ({ ...d, Description: descValue }))
    setEditingDesc(false); setSavingDesc(false)
    showToast('Description updated')
  }

  if (loading) return <div style={{ padding:32, color:'var(--text-muted)', fontSize:13 }}>Loading department…</div>
  if (!dept)   return <div style={{ padding:32, color:'var(--danger)', fontSize:13 }}>Department not found.</div>

  return (
    <div style={{ padding:'28px 32px', maxWidth:1400 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Header */}
      <div style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:24 }}>
        <div style={{ width:48, height:48, borderRadius:12, background:'var(--brand)18', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Building2 size={22} style={{ color:'var(--brand)' }} />
        </div>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:'var(--text)' }}>{dept.Department_Name}</div>
          <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:3 }}>
            {dept.sector?.Sector_Name && <span>{dept.sector.Sector_Name}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'8px 16px', fontSize:12, fontWeight:600, cursor:'pointer',
            color: tab===t ? 'var(--brand)' : 'var(--text-muted)',
            background:'none', border:'none',
            borderBottom: tab===t ? '2px solid var(--brand)' : '2px solid transparent',
            transition:'all 0.15s',
          }}>{tabLabel(t)}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* Description card */}
          <div className="card" style={{ padding:'14px 16px', gridColumn:'1 / -1' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)' }}>Description</div>
              {!editingDesc
                ? <button onClick={() => setEditingDesc(true)} style={{ display:'flex', alignItems:'center', gap:4, background:'none', border:'none', cursor:'pointer', fontSize:11, color:'var(--brand)' }}><Pencil size={11}/>Edit</button>
                : <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setEditingDesc(false)} style={{ padding:'3px 10px', borderRadius:5, fontSize:11, background:'#f0f3f9', border:'1px solid var(--border)', color:'var(--text-2)', cursor:'pointer' }}>Cancel</button>
                    <button onClick={saveDesc} disabled={savingDesc} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 10px', borderRadius:5, fontSize:11, background:'var(--brand)', border:'none', color:'#fff', cursor:'pointer', fontWeight:600 }}><Save size={11}/>{savingDesc?'Saving…':'Save'}</button>
                  </div>
              }
            </div>
            {editingDesc
              ? <textarea value={descValue} onChange={e => setDescValue(e.target.value)} rows={3}
                  style={{ width:'100%', padding:'8px', fontSize:13, background:'#ffffff', border:'1px solid var(--brand)40', borderRadius:6, color:'var(--text)', outline:'none', resize:'vertical', boxSizing:'border-box' }} />
              : <div style={{ fontSize:13, color: dept.Description ? 'var(--text-2)' : 'var(--text-muted)', lineHeight:1.6 }}>
                  {dept.Description || 'No description yet. Click Edit to add one.'}
                </div>
            }
          </div>

          {/* Managers (read-only) */}
          <div className="card" style={{ padding:'14px 16px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <Users size={13} style={{ color:'var(--brand)' }}/>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)' }}>Managers</div>
              <span style={{ fontSize:10, color:'var(--text-muted)', marginLeft:'auto' }}>Admin-managed</span>
            </div>
            {dept.manager_mapping?.length > 0 ? dept.manager_mapping.map(m => (
              <div key={m.Head_ID} style={{ fontSize:13, color:'var(--text)', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                {m.manager?.Head_Name}
                <span style={{ fontSize:11, color:'var(--text-muted)', marginLeft:8 }}>{m.manager?.Email}</span>
              </div>
            )) : <div style={{ fontSize:12, color:'var(--text-muted)' }}>No managers assigned.</div>}
          </div>

          {/* Portals (read-only) */}
          <div className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-muted)', marginBottom:10, display:'flex', justifyContent:'space-between' }}>
              Portals <span style={{ fontSize:10, fontWeight:400 }}>Admin-managed</span>
            </div>
            {dept.portal_mapping?.length > 0 ? dept.portal_mapping.map(p => (
              <div key={p.Portal_ID} style={{ fontSize:13, color:'var(--brand)', padding:'3px 0' }}>
                {p.portal?.Portal_Name || p.portal?.Base_URL}
              </div>
            )) : <div style={{ fontSize:12, color:'var(--text-muted)' }}>No portals mapped.</div>}
          </div>
        </div>
      )}

      {/* ── PROJECTS ── */}
      {tab === 'projects' && (
        <DeptProjectsTab deptId={deptId} projects={dept.project_mapping} onToast={showToast} />
      )}

      {/* ── HISTORY ── */}
      {tab === 'history' && (
        <DeptHistoryTab deptId={deptId} history={dept.tender_history || []} onToast={showToast} />
      )}

      {/* ── KEYWORDS ── */}
      {tab === 'keywords' && (
        <DeptKeywordsTab deptId={deptId} keywords={dept.keyword_mapping} onToast={showToast} />
      )}

      {/* ── RULES ── */}
      {tab === 'rules' && (
        <ManagerRules manager={manager} departmentId={+deptId} />
      )}
    </div>
  )
}
