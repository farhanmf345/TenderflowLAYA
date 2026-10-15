import { useState, useEffect, useCallback } from 'react'
import PageWrapper from '../components/layout/PageWrapper'
import Badge from '../components/ui/Badge'
import MultiCombobox from '../components/ui/MultiCombobox'
import TagInput from '../components/ui/TagInput'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import FieldTip from '../components/ui/FieldTip'
import { Plus, X, Globe, FolderOpen, Trash2, FileText } from 'lucide-react'
import { isActiveByDate } from '../lib/utils/dateUtils'
import api from '../lib/api'
import { useStaleData } from '../lib/hooks/useStaleData'
import RefreshBar from '../components/ui/RefreshBar'
import {
  PRE_FILTER_FIELDS,
  QUAL_GATE_FIELDS,
  fieldLabel as criteriaFieldLabel,
} from '../lib/criteriaFields'

const PRE_FIELD_OPTIONS = PRE_FILTER_FIELDS
const GATE_FIELD_OPTIONS = QUAL_GATE_FIELDS
const OPERATOR_OPTIONS = [
  { value: '=',      label: 'is equal to' },
  { value: '!=',     label: 'is not equal to' },
  { value: '>',      label: 'is greater than' },
  { value: '<',      label: 'is less than' },
  { value: '>=',     label: 'is greater than or equal to' },
  { value: '<=',     label: 'is less than or equal to' },
  { value: 'IN',     label: 'is one of' },
  { value: 'NOT IN', label: 'is not one of' },
]
const ACTION_OPTIONS = [
  { value: 'Discard', label: 'Discard' },
  { value: 'Accept',  label: 'Accept' },
]
const ruleFieldLabel = (rule) => criteriaFieldLabel(
  rule.type === 'PRE_FILTER' ? PRE_FIELD_OPTIONS : GATE_FIELD_OPTIONS,
  rule.field,
)
const opLabel     = (v) => OPERATOR_OPTIONS.find(o => o.value === v)?.label || v

const getTodayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyDept = () => ({
  name: '', code: '', description: '', sector: 'IT', validFrom: getTodayStr(), validTo: '',
  portals: [], keywords: [], managers: [],
  projects: [],
})

const emptyTender = () => ({
  title: '', ref: '', issuingOrg: '', portalSource: '',
  submissionDate: '', outcome: '', value: '', sector: 'IT', notes: '',
})

const OUTCOMES = ['SUBMITTED', 'SHORTLISTED', 'WON', 'LOST', 'DISQUALIFIED']

const OUTCOME_STYLES = {
  WON:           { background: '#dcfce7', color: '#15803d', border: '#bbf7d0' },
  SHORTLISTED:   { background: '#dbeafe', color: '#1d4ed8', border: '#bfdbfe' },
  SUBMITTED:     { background: '#f3f4f6', color: '#374151', border: '#e5e7eb' },
  LOST:          { background: '#fee2e2', color: '#b91c1c', border: '#fecaca' },
  DISQUALIFIED:  { background: '#fef3c7', color: '#b45309', border: '#fde68a' },
}

const emptyProject = () => ({
  title: '', client: '', value: '', year: '',
  durationMonths: '', sector: 'IT', certIssued: false,
  description: '', keywords: [],
})
const emptyRule = { type: 'PRE_FILTER', field: '', operator: '=', value: '', action: 'Discard' }

function validateDept(form) {
  const errs = {}
  if (!form.name.trim()) errs.name = 'Department name is required.'
  if (!form.code.trim()) errs.code = 'Department code is required.'
  if (!form.validFrom) errs.validFrom = 'Valid From date is required.'
  if (!form.validTo) errs.validTo = 'Valid To date is required.'
  if (form.validFrom && form.validTo && form.validFrom >= form.validTo)
    errs.validTo = 'Valid To must be after Valid From.'
  if (form.portals.length === 0) errs.portals = 'At least one portal is required.'
  if (form.keywords.length === 0) errs.keywords = 'At least one focus keyword is required.'
  if (form.managers.length === 0) errs.managers = 'At least one tender manager must be assigned.'
  return errs
}


const fmtDate = (d) => {
  if (!d) return '-'
  // Append Z so the browser treats the value as UTC before converting to IST
  const utc = /[Zz]$/.test(d) || /[+-]\d{2}:\d{2}$/.test(d) ? d : d + 'T00:00:00Z'
  return new Date(utc).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
}

const calcStatus = (from, to) => {
  if (!from || !to) return { label: '● Pending - set Valid From & To', color: '#d97706' }
  const now = new Date(), f = new Date(from), t = new Date(to)
  if (now < f) return { label: `● Pending - starts ${fmtDate(from)}`, color: '#d97706' }
  if (now > t) return { label: `● Inactive - expired ${fmtDate(to)}`, color: '#dc2626' }
  return { label: `● Active - until ${fmtDate(to)}`, color: '#16a34a' }
}

export default function Departments() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(emptyDept())
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState(false)
  const [criteria, setCriteria] = useState([])
  const [originalCriteria, setOriginalCriteria] = useState([])
  const [ruleForm, setRuleForm] = useState(emptyRule)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [portalModal, setPortalModal] = useState(false)
  const [newPortal, setNewPortal] = useState({ name: '', url: '' })
  const [activeTab, setActiveTab] = useState('info')  // 'info' | 'criteria' | 'projects' | 'tenders'
  const [deptProjects, setDeptProjects] = useState([])      // projects for current modal
  const [deptTenders, setDeptTenders] = useState([])        // tender history for current modal

  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)  // dept id pending deletion
  const [alertData, setAlertData] = useState(null)


  // ─── Normalize API response  UI shape ──────────────────────────────────────
  const normalizeDept = (d, sectorsList) => {
    const sectorName = sectorsList.find(s => s.Sector_ID === d.Sector_ID)?.Sector_Name || 'IT'
    return {
      id: d.Department_ID,
      name: d.Department_Name,
      code: d.Dept_Code || '',          // ← correct field
      description: d.Description || '', // ← separate description
      sector: sectorName,
      validFrom: d.Valid_From?.slice(0, 10) || '',
      validTo: d.Valid_To?.slice(0, 10) || '',
      portals: (d.portal_mapping || []).map(pm => pm.portal.Portal_ID),
      keywords: (d.keyword_mapping || []).map(km => km.keyword.Keyword),
      criteria: (d.criteria || []).map(c => ({
        id: c.Criteria_ID,
        type: c.Criteria_Type,
        field: c.Target_Field,
        operator: c.Operator,
        value: c.Target_Value,
        action: c.Action || 'Discard',  // default for older records
        _persisted: true,
      })),
      managers: (d.manager_mapping || []).map(mm => mm.manager.Head_ID),
      projects: [],
      _raw: d,   // keep raw for keyword ID lookups during save
    }
  }


  // ─── Page Load: fetch departments + sectors + portals + managers ─────────────
  const DEFAULT_DATA = { sectors: [], portalOptions: [], managerOptions: [], depts: [], allKeywords: [] }
  const fetchAll = useCallback(async () => {
    const [sRes, pRes, mRes, dRes, kwRes] = await Promise.all([
      api.get('/sectors').catch(() => ({ data: [] })),
      api.get('/portals').catch(() => ({ data: [] })),
      api.get('/managers').catch(() => ({ data: [] })),
      api.get('/departments').catch(() => ({ data: [] })),
      api.get('/keywords').catch(() => ({ data: [] }))
    ])
    const mgrs = (mRes.data || []).map(m => ({
      value: m.Head_ID,
      label: `${m.Head_Name} - ${m.Email}`,
      initials: m.Head_Name.charAt(0).toUpperCase()
    }))
    return {
      sectors: sRes.data || [],
      portalOptions: pRes.data || [],
      managerOptions: mgrs,
      depts: (dRes.data || []).map(d => normalizeDept(d, sRes.data || [])),
      allKeywords: (kwRes.data || []).map(k => k.Keyword)
    }
  }, [])

  const { data: staleData, isRefreshing, setData: setStaleData } = useStaleData('departments_page', fetchAll, DEFAULT_DATA)

  const [depts, setDepts] = useState(staleData?.depts || [])
  const [sectors, setSectors] = useState(staleData?.sectors || [])
  const [portalOptions, setPortalOptions] = useState(staleData?.portalOptions || [])
  const [managerOptions, setManagerOptions] = useState(staleData?.managerOptions || [])
  const [allKeywords, setAllKeywords] = useState(staleData?.allKeywords || [])

  useEffect(() => {
    setDepts(staleData?.depts || [])
    setSectors(staleData?.sectors || [])
    setPortalOptions(staleData?.portalOptions || [])
    setManagerOptions(staleData?.managerOptions || [])
    setAllKeywords(staleData?.allKeywords || [])
  }, [staleData])


  // ─── Refresh dept list from API ───────────────────────────────────────────────
  const refreshDepts = async () => {
    try {
      const fresh = await fetchAll()
      setStaleData(fresh)
    } catch (err) {
      console.error('[Departments] refresh failed', err)
    }
  }


  const openAdd = () => {
    setEditTarget(null); setForm(emptyDept()); setCriteria([]); setOriginalCriteria([]); setDeptProjects([]); setDeptTenders([])
    setErrors({}); setTouched(false); setActiveTab('info')
    setRuleForm(emptyRule); setShowRuleForm(false); setModalOpen(true)
  }
  const openEdit = async (dept) => {
    setEditTarget(dept.id)
    setForm({
      name: dept.name, code: dept.code, description: dept.description || '',
      sector: dept.sector,
      validFrom: dept.validFrom, validTo: dept.validTo,
      portals: dept.portals, keywords: dept.keywords, managers: dept.managers
    })
    setCriteria(dept.criteria || [])
    setOriginalCriteria(dept.criteria || [])
    setErrors({}); setTouched(false); setActiveTab('info')
    setRuleForm(emptyRule); setShowRuleForm(false); setModalOpen(true)

    // Fetch persisted projects for this department
    try {
      const res = await api.get(`/departments/${dept.id}/projects`)
      const fetched = res.data.map(p => ({
        id: p.DPrM_ID,
        _persisted: true,
        title: p.Project_Title,
        client: p.Client_Name || '',
        value: p.Value_Cr ?? '',
        year: p.Completion_Year ?? '',
        durationMonths: p.Duration_Months ?? '',
        sector: p.Sector_Name || 'IT',
        description: p.Description || '',
        keywords: p.Keywords_JSON ? JSON.parse(p.Keywords_JSON) : [],
        certIssued: p.Cert_Issued,
      }))
      setDeptProjects(fetched)
    } catch (_) {
      setDeptProjects([])
    }

    // Fetch persisted tender history for this department
    try {
      const tRes = await api.get(`/departments/${dept.id}/tenders`)
      const fetchedTenders = tRes.data.map(t => ({
        id: t.DTH_ID,
        _persisted: true,
        title: t.Tender_Title,
        ref: t.Tender_Ref || '',
        issuingOrg: t.Issuing_Org || '',
        portalSource: t.Portal_Source || '',
        submissionDate: t.Submission_Date || '',
        outcome: t.Outcome || '',
        value: t.Value_Cr ?? '',
        sector: t.Sector_Name || 'IT',
        notes: t.Notes || '',
      }))
      setDeptTenders(fetchedTenders)
    } catch (_) {
      setDeptTenders([])
    }
  }

  const saveDept = async () => {
    const errs = validateDept(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); setTouched(true); setActiveTab('info'); return }

    setSaving(true)
    try {
      const sectorObj = sectors.find(s => s.Sector_Name === form.sector)
      const sectorId = sectorObj?.Sector_ID
      let deptId = editTarget

      const deptPayload = {
        Department_Name: form.name,
        Dept_Code: form.code,          // ← correct field
        Description: form.description, // ← separate description
        Valid_From: form.validFrom + 'T00:00:00',
        Valid_To: form.validTo + 'T00:00:00',
        Sector_ID: sectorId,
      }

      if (editTarget) {
        await api.put(`/departments/${editTarget}`, deptPayload)
      } else {
        const res = await api.post('/departments', deptPayload)
        deptId = res.data.Department_ID
      }

      // ─── Sync Portals ────────────────────────────────────────────────────────
      const oldDept = depts.find(d => d.id === editTarget)
      const oldPortalIds = oldDept?.portals || []      // now Portal_ID numbers
      const newPortalIds = form.portals

      for (const pid of oldPortalIds) {
        if (!newPortalIds.includes(pid)) {
          await api.delete(`/departments/${deptId}/portals/${pid}`)
        }
      }
      for (const pid of newPortalIds) {
        if (!oldPortalIds.includes(pid)) {
          try { await api.post(`/departments/${deptId}/portals/${pid}`) } catch (_) { }
        }
      }

      // ─── Sync Keywords ────────────────────────────────────────────────────────
      const oldKeywords = oldDept?.keywords || []
      const newKeywords = form.keywords

      for (const kw of oldKeywords) {
        if (!newKeywords.includes(kw)) {
          const kwObj = oldDept?._raw?.keyword_mapping?.find(km => km.keyword.Keyword === kw)
          if (kwObj) await api.delete(`/departments/${deptId}/keywords/${kwObj.keyword.Keyword_ID}`)
        }
      }
      for (const kw of newKeywords) {
        if (!oldKeywords.includes(kw)) {
          const kwRes = await api.post('/keywords', { Keyword: kw, Sector_ID: sectorId })
          try { await api.post(`/departments/${deptId}/keywords/${kwRes.data.Keyword_ID}`) } catch (_) { }
        }
      }

      // ─── Sync Managers ────────────────────────────────────────────────────────
      const oldManagers = oldDept?.managers || []
      const newManagers = form.managers

      for (const headId of oldManagers) {
        if (!newManagers.includes(headId)) {
          await api.delete(`/departments/${deptId}/managers/${headId}`)
        }
      }
      for (const headId of newManagers) {
        if (!oldManagers.includes(headId)) {
          try { await api.post(`/departments/${deptId}/managers/${headId}`) } catch (_) { }
        }
      }

      // ─── Sync Criteria ────────────────────────────────────────────────────────
      const originalPersistedIds = originalCriteria.filter(c => c._persisted).map(c => c.id)
      const currentPersistedIds = criteria.filter(c => c._persisted).map(c => c.id)

      // Delete rules the user removed during this session
      for (const id of originalPersistedIds) {
        if (!currentPersistedIds.includes(id)) {
          await api.delete(`/criteria/${id}`)
        }
      }
      for (const rule of criteria.filter(c => c._persisted)) {
        const original = originalCriteria.find(o => o.id === rule.id)
        if (!original) continue
        if (
          original.type !== rule.type ||
          original.field !== rule.field ||
          original.operator !== rule.operator ||
          original.value !== rule.value ||
          (original.action || 'Discard') !== (rule.action || 'Discard')
        ) {
          await api.put(`/criteria/${rule.id}`, {
            Criteria_Type: rule.type,
            Target_Field: rule.field,
            Operator: rule.operator,
            Target_Value: rule.value,
            Action: rule.action || 'Discard',
          })
        }
      }
      // Create newly added rules
      for (const rule of criteria.filter(c => !c._persisted)) {
        await api.post('/criteria', {
          Department_ID: deptId,
          Criteria_Type: rule.type,
          Target_Field: rule.field,
          Operator: rule.operator,
          Target_Value: rule.value,
          Action: rule.action || 'Discard',
          Is_Active: true,
        })
      }

      // ─── Sync Projects (full replace) ────────────────────────────────────────
      const projectsPayload = deptProjects
        .filter(p => p.title?.trim())
        .map(p => ({
          Project_Title: p.title.trim(),
          Client_Name: p.client?.trim() || null,
          Value_Cr: p.value !== '' ? parseFloat(p.value) : null,
          Completion_Year: p.year !== '' ? parseInt(p.year, 10) : null,
          Duration_Months: p.durationMonths !== '' ? parseInt(p.durationMonths, 10) : null,
          Sector_Name: p.sector || null,
          Description: p.description?.trim() || null,
          Keywords_JSON: p.keywords?.length ? JSON.stringify(p.keywords) : null,
          Cert_Issued: !!p.certIssued,
        }))
      await api.put(`/departments/${deptId}/projects`, projectsPayload)

      // ─── Sync Tender History (full replace) ──────────────────────────────────
      const tendersPayload = deptTenders
        .filter(t => t.title?.trim())
        .map(t => ({
          Tender_Title: t.title.trim(),
          Tender_Ref: t.ref?.trim() || null,
          Issuing_Org: t.issuingOrg?.trim() || null,
          Portal_Source: t.portalSource?.trim() || null,
          Submission_Date: t.submissionDate || null,
          Outcome: t.outcome || null,
          Value_Cr: t.value !== '' ? parseFloat(t.value) : null,
          Sector_Name: t.sector || null,
          Notes: t.notes?.trim() || null,
        }))
      await api.put(`/departments/${deptId}/tenders`, tendersPayload)

      await refreshDepts()
      setModalOpen(false)
    } catch (err) {
      console.error('[Departments] save failed', err)
      setAlertData({ title: 'Error', message: 'Failed to save department. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  // ─── Delete Department ────────────────────────────────────────────────────────
  const deleteDept = async (deptId) => {
    try {
      await api.delete(`/departments/${deptId}`)
      setDepts(prev => prev.filter(d => d.id !== deptId))
    } catch (err) {
      console.error('[Departments] delete failed', err)
      setAlertData({ title: 'Error', message: 'Failed to delete department.' })
    } finally {
      setConfirmDelete(null)
    }
  }

  // live re-validation after first submit attempt
  const setField = (patch) => {
    const next = { ...form, ...patch }
    setForm(next)
    if (touched) setErrors(validateDept(next))
  }


  const addRule = () => {
    if (!ruleForm.field || !ruleForm.value) return
    setCriteria([...criteria, { ...ruleForm, id: Date.now(), _persisted: false, action: ruleForm.action || 'Discard' }])
    setRuleForm(emptyRule); setShowRuleForm(false)
  }
  const removeRule = (id) => setCriteria(criteria.filter(c => c.id !== id))

  const managerObj = (id) => managerOptions.find(m => m.value === id)
  const isActive = (dept) => isActiveByDate(dept.validFrom, dept.validTo)
  const isExpired = (to) => to && new Date(to) < new Date()

  const status = calcStatus(form.validFrom, form.validTo)

  return (
    <PageWrapper>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Departments</div>
          <div className="page-sub">
            Each department operates under the company umbrella - inheriting financials, assets, and certifications from the Company Profile
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={14} /> Add Department
        </button>
      </div>



      {/* Department Cards Grid */}
      <div style={{ position: 'relative', minHeight: 150 }}>
        <RefreshBar visible={isRefreshing} />
        {depts.length === 0 && isRefreshing ? (
          <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner size={28} text="Loading departments…" />
          </div>
        ) : depts.length === 0 ? (
          <div style={{ paddingTop: 20 }}>
            <EmptyState message="No departments found. Click 'Add Department' to create one." />
          </div>
        ) : (
          <div className="dept-grid" style={{ paddingTop: 16 }}>
            {depts.map((dept) => {
              const active = isActive(dept)
              const expired = isExpired(dept.validTo)
              const noMgr = dept.managers.length === 0

              return (
                <div key={dept.id} className="dept-card"
                  style={!active ? { borderColor: 'var(--warning)' } : {}}>

                  {/* Card Header */}
                  <div className="dept-card-header">
                    <div>
                      <div className="dept-name">{dept.name}</div>
                      <div className="dept-code">
                        {dept.code ? `${dept.code} · ` : ''}{dept.sector} Sector
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Badge type={active ? 'active' : 'inactive'}>{active ? 'Active' : 'Inactive'}</Badge>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(dept)}>Edit</button>
                      <button className="btn btn-danger btn-sm" title="Delete department"
                        onClick={() => setConfirmDelete(dept.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Inherited Financials */}
                  <div className="dept-info-row">
                    <div className="dept-info-item">
                      Turnover <span>₹45.5 Cr</span>
                    </div>
                    <div className="dept-info-item">
                      Net Worth <span>₹22 Cr</span>
                    </div>
                  </div>

                  {/* Valid Dates */}
                  <div className="dept-valid">
                    Valid: {fmtDate(dept.validFrom)} – {fmtDate(dept.validTo)}
                    {expired && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>- Expired</span>}
                  </div>

                  {noMgr ? (
                    <div className="dept-warning">
                      ⚠ No Tender Manager assigned - notifications paused.
                      <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
                        onClick={() => openEdit(dept)}>Assign</button>
                    </div>
                  ) : (
                    <>
                      {dept.portals.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div className="dept-portals-label">PORTALS</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {dept.portals.map(p => {
                              const po = portalOptions.find(o => o.Portal_ID === p)
                              return <span key={p} className="portal-badge">{po?.Portal_Name || p}</span>
                            })}
                          </div>
                        </div>
                      )}
                      <div className="dept-managers">
                        {dept.managers.map(mid => {
                          const m = managerObj(mid)
                          return m ? (
                            <div key={mid} className="manager-chip">
                              <div className="manager-avatar">{m.initials}</div>
                              {m.label.split(' - ')[0]}
                            </div>
                          ) : null
                        })}
                      </div>
                    </>
                  )}

                  {dept.keywords.length > 0 && (
                    <div className="dept-keywords">
                      <strong>Keywords:</strong> {dept.keywords.join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Department Form Modal ─── */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-box modal-xl scale-in" onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div className="modal-header">
              <span className="modal-title">{editTarget ? 'Edit Department' : 'New Department'}</span>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <X size={14} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
              {[
                { key: 'info', label: 'Dept. Info' },
                { key: 'criteria', label: 'Participation Criteria' },
                { key: 'projects', label: `Past Projects (${deptProjects.length})` },
                { key: 'tenders', label: `Previous Tenders (${deptTenders.length})` },
              ].map(tab => (
                <button key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '8px 16px', background: 'none', border: 'none',
                    borderBottom: activeTab === tab.key ? '2px solid var(--brand)' : '2px solid transparent',
                    color: activeTab === tab.key ? 'var(--brand)' : 'var(--text-muted)',
                    fontWeight: activeTab === tab.key ? 700 : 500,
                    fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div className="modal-body">

              {/* ── TAB: Dept. Info ── */}
              {activeTab === 'info' && (<>

                {/* Row 1: Name | Code */}
                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Department Name<FieldTip text="Display name for this bidding unit — shown in qualification results and emails." /></label>
                    <input className="form-input" placeholder="e.g. IT Services" value={form.name}
                      style={errors.name ? { borderColor: 'var(--danger)' } : {}}
                      onChange={e => setField({ name: e.target.value })} />
                    {errors.name && <div className="form-error">{errors.name}</div>}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Department Code<FieldTip text="Short unique code (e.g. ITS-01) for internal reference and reporting." /></label>
                    <input className="form-input" placeholder="e.g. ITS-01" value={form.code}
                      style={errors.code ? { borderColor: 'var(--danger)' } : {}}
                      onChange={e => setField({ code: e.target.value })} />
                    {errors.code && <div className="form-error">{errors.code}</div>}
                  </div>
                </div>

                {/* Description (full-width) */}
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Department Description<FieldTip text="What this department bids for — helps managers identify scope." /></label>
                  <textarea className="form-input" rows={3}
                    placeholder="Brief description of what this department does…"
                    value={form.description || ''}
                    style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    onChange={e => setField({ description: e.target.value })} />
                </div>


                {/* Row 2: Sector | Status */}
                <div className="form-grid" style={{ marginBottom: 16 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Sector<FieldTip text="Industry sector — tenders are matched and scored against this sector's criteria." /></label>
                    <select className="form-select" value={form.sector}
                      onChange={e => setForm({ ...form, sector: e.target.value })}>
                      {sectors.map(s => <option key={s.Sector_ID} value={s.Sector_Name}>{s.Sector_Name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Status<FieldTip text="Auto-derived from validity dates — active departments receive qualifications." /></label>
                    <div className="form-input" style={{
                      color: status.color, fontWeight: 600, fontSize: 13,
                      background: 'var(--bg)', cursor: 'default',
                    }}>
                      {status.label}
                    </div>
                  </div>
                </div>

                {/* Row 3: Valid From | Valid To */}
                <div className="form-grid" style={{ marginBottom: 20 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Valid From<FieldTip text="Start date when this department is eligible for tender matching." /></label>
                    <input className="form-input" type="date" value={form.validFrom}
                      style={errors.validFrom ? { borderColor: 'var(--danger)' } : {}}
                      onChange={e => setField({ validFrom: e.target.value })} />
                    {errors.validFrom && <div className="form-error">{errors.validFrom}</div>}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label required">Valid To<FieldTip text="End date — department is excluded from pipeline after this date." /></label>
                    <input className="form-input" type="date" value={form.validTo}
                      min={form.validFrom}
                      style={errors.validTo ? { borderColor: 'var(--danger)' } : {}}
                      onChange={e => setField({ validTo: e.target.value })} />
                    {errors.validTo && <div className="form-error">{errors.validTo}</div>}
                  </div>
                </div>


                {/* Portals */}
                <div className="form-group">
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <label className="form-label required" style={{ marginBottom: 0 }}>
                      Websites (Portals to Scrape)<FieldTip text="Government portals linked to this department — extraction agents scrape these sites." />
                    </label>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPortalModal(true)}>
                      <Globe size={12} /> Add New Portal
                    </button>
                  </div>
                  <MultiCombobox
                    options={portalOptions.map(p => ({ value: p.Portal_ID, label: `${p.Portal_Name}` }))}
                    value={form.portals}
                    onChange={v => setField({ portals: v })}
                    placeholder="Select portals…"
                  />
                  {errors.portals && <div className="form-error">{errors.portals}</div>}
                
                </div>

                {/* Keywords */}
                <div className="form-group">
                  <label className="form-label required">Focus Keywords</label>
                  <TagInput
                    value={form.keywords}
                    onChange={v => setField({ keywords: v })}
                    placeholder="Type keyword, press Enter…"
                    suggestions={allKeywords}
                  />
                  {errors.keywords && <div className="form-error">{errors.keywords}</div>}
                </div>

                {/* Managers */}
                <div className="form-group">
                  <label className="form-label required">Assign Tender Manager(s)</label>
                  <MultiCombobox
                    options={managerOptions}
                    value={form.managers}
                    onChange={v => setField({ managers: v })}
                    placeholder="Select managers…"
                  />
                  {errors.managers && <div className="form-error">{errors.managers}</div>}
                </div>



              </>)}

              {/* ── TAB: Participation Criteria ── */}
              {activeTab === 'criteria' && (
                <div style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                        Department Participation Criteria
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Rules that filter and gate tenders for this specific department before notifications are dispatched.
                      </p>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => setShowRuleForm(!showRuleForm)}>
                      + Add Rule
                    </button>
                  </div>

                  {/* Inline Rule Builder */}
                  {showRuleForm && (
                    <div style={{
                      background: 'var(--bg)', border: '1px solid var(--border)',
                      borderRadius: 10, padding: 16, marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>New Rule Setup</div>
                      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                        {[
                          {
                            val: 'PRE_FILTER', icon: '🚦', label: 'Tender Pre-Filter',
                            desc: 'Filter on scraped tender metadata. Applied before qualification.',
                            effect: 'Discards tender or Accepts tender', effectStyle: { background: '#fef3c7', color: '#b45309' }
                          },
                          {
                            val: 'QUAL_GATE', icon: '🔒', label: 'Qualification Gate',
                            desc: 'Filter on qualification score. Applied after scoring.',
                            effect: 'Suppresses or Sends an email', effectStyle: { background: '#fef3c7', color: '#b45309' }
                          },
                        ].map(ct => (
                          <div key={ct.val}
                            onClick={() => setRuleForm({ ...ruleForm, type: ct.val, field: '' })}
                            style={{
                              flex: 1, border: `1px solid ${ruleForm.type === ct.val ? 'var(--brand)' : 'var(--border)'}`,
                              borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                              background: ruleForm.type === ct.val ? 'var(--brand-muted)' : 'var(--card)',
                              transition: 'all 0.15s',
                            }}>
                            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{ct.icon} {ct.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>{ct.desc}</div>
                            <div style={{
                              display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 700,
                              padding: '2px 6px', borderRadius: 20, ...ct.effectStyle
                            }}>{ct.effect}</div>
                          </div>
                        ))}
                      </div>

                      {/* Action selector: Discard or Accept */}
                      <div className="form-grid" style={{ marginBottom: 14 }}>
                        <div className="form-group col-span-2" style={{ marginBottom: 0 }}>
                          <label className="form-label">Rule Action *</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {ACTION_OPTIONS.map(a => (
                              <button key={a.value} type="button"
                                onClick={() => setRuleForm({ ...ruleForm, action: a.value })}
                                style={{
                                  flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid',
                                  fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                                  borderColor: ruleForm.action === a.value
                                    ? (a.value === 'Discard' ? '#b91c1c' : '#16a34a')
                                    : 'var(--border)',
                                  background: ruleForm.action === a.value
                                    ? (a.value === 'Discard' ? '#fee2e2' : '#dcfce7')
                                    : 'var(--card)',
                                  color: ruleForm.action === a.value
                                    ? (a.value === 'Discard' ? '#b91c1c' : '#15803d')
                                    : 'var(--text-muted)',
                                }}>
                                {a.value === 'Discard' ? '✕ Discard' : '✓ Accept'}
                              </button>
                            ))}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            <strong>Discard</strong> — tender is dropped when rule matches. <strong>Accept</strong> — tender is kept only when rule matches.
                          </p>
                        </div>
                      </div>

                      <div className="form-grid">
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Field *</label>
                          <select className="form-select" value={ruleForm.field}
                            onChange={e => setRuleForm({ ...ruleForm, field: e.target.value })}>
                            <option value="">Select field…</option>
                            {(ruleForm.type === 'PRE_FILTER' ? PRE_FIELD_OPTIONS : GATE_FIELD_OPTIONS).map(f =>
                              <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label className="form-label">Operator *</label>
                          <select className="form-select" value={ruleForm.operator}
                            onChange={e => setRuleForm({ ...ruleForm, operator: e.target.value })}>
                            {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div className="form-group col-span-2" style={{ marginBottom: 0 }}>
                          <label className="form-label">Value *</label>
                          <input className="form-input" placeholder="e.g. Government, 40, ELIGIBLE"
                            value={ruleForm.value}
                            onChange={e => setRuleForm({ ...ruleForm, value: e.target.value })} />
                        </div>
                      </div>

                      {/* Live sentence preview */}
                      {ruleForm.field && ruleForm.value && (
                        <div style={{
                          marginTop: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                          background: ruleForm.action === 'Discard' ? '#fee2e2' : '#dcfce7',
                          color: ruleForm.action === 'Discard' ? '#b91c1c' : '#15803d',
                          border: `1px solid ${ruleForm.action === 'Discard' ? '#fecaca' : '#bbf7d0'}`,
                          fontWeight: 500,
                        }}>
                          <strong>{ruleForm.action}</strong> if <strong>{ruleFieldLabel(ruleForm)}</strong> {opLabel(ruleForm.operator)} <strong>"{ruleForm.value}"</strong>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button className="btn btn-primary btn-sm" onClick={addRule}>Save Rule</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowRuleForm(false)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Criteria Table */}
                  <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>TYPE</th><th>RULE</th><th>EFFECT</th><th>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {criteria.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ padding: '30px 0' }}>
                              <EmptyState message="No rules defined yet. Click '+ Add Rule' to get started." />
                            </td>
                          </tr>
                        ) : (
                          criteria.map(rule => (
                            <tr key={rule.id}>
                              <td>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                                  background: rule.type === 'PRE_FILTER' ? '#eef2ff' : '#fef3c7',
                                  color: rule.type === 'PRE_FILTER' ? '#4338ca' : '#b45309',
                                  border: `1px solid ${rule.type === 'PRE_FILTER' ? '#c7d2fe' : '#fde68a'}`,
                                  whiteSpace: 'nowrap',
                                }}>
                                  {rule.type === 'PRE_FILTER' ? 'Pre-Filter' : 'Qual. Gate'}
                                </span>
                              </td>
                              <td style={{ fontSize: 13 }}>
                                <strong>{ruleFieldLabel(rule)}</strong>
                                {' '}<span style={{ color: 'var(--text-muted)' }}>{opLabel(rule.operator)}</span>{' '}
                                <strong>"{rule.value}"</strong>
                              </td>
                              <td>
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                  background: (rule.action || 'Discard') === 'Discard' ? '#fee2e2' : '#dcfce7',
                                  color: (rule.action || 'Discard') === 'Discard' ? '#b91c1c' : '#15803d',
                                  border: `1px solid ${(rule.action || 'Discard') === 'Discard' ? '#fecaca' : '#bbf7d0'}`,
                                }}>
                                  {rule.action || 'Discard'}
                                </span>
                              </td>
                              <td>
                                {(() => {
                                  const action = rule.action || 'Discard'
                                  const isPreFilter = rule.type === 'PRE_FILTER'
                                  let label, bg, color
                                  if (isPreFilter) {
                                    if (action === 'Discard') {
                                      label = 'Discard Tender'; bg = '#fee2e2'; color = '#b91c1c'
                                    } else {
                                      label = 'Accept Tender'; bg = '#dcfce7'; color = '#15803d'
                                    }
                                  } else {
                                    if (action === 'Discard') {
                                      label = 'Suppress Email'; bg = '#fef3c7'; color = '#b45309'
                                    } else {
                                      label = 'Send Email'; bg = '#e0f2fe'; color = '#0369a1'
                                    }
                                  }
                                  return (
                                    <span style={{
                                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                      background: bg, color,
                                    }}>
                                      {label}
                                    </span>
                                  )
                                })()}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button className="btn btn-danger btn-sm" onClick={() => removeRule(rule.id)}>Remove</button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: Past Projects ── */}
              {activeTab === 'projects' && (
                <div>
                  <div className="flex-between" style={{ marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FolderOpen size={16} color="var(--brand)" /> Past Projects
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Projects completed by this department - used as experience proof during qualification.
                      </p>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => setDeptProjects([...deptProjects, { id: Date.now(), ...emptyProject() }])}>
                      + Add Project
                    </button>
                  </div>

                  {deptProjects.length === 0 ? (
                    <div style={{ padding: '20px 0' }}>
                      <EmptyState message="No past projects added yet. Click '+ Add Project' to begin." />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {deptProjects.map((proj, i) => (
                        <div key={proj.id} style={{
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: 16, position: 'relative',
                        }}>
                          {/* Row badge + remove */}
                          <div className="flex-between" style={{ marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-muted)', padding: '2px 10px', borderRadius: 20 }}>
                              Project #{i + 1}
                            </span>
                            <button className="btn btn-danger btn-sm"
                              onClick={() => setDeptProjects(deptProjects.filter((_, idx) => idx !== i))}>
                              <X size={12} /> Remove
                            </button>
                          </div>

                          {/* Row 1: Title | Client */}
                          <div className="form-grid" style={{ marginBottom: 10 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label required">Project Title</label>
                              <input className="form-input" placeholder="e.g. ERP Implementation for SAIL"
                                value={proj.title}
                                onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, title: e.target.value } : p))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label required">Client / Organisation</label>
                              <input className="form-input" placeholder="e.g. NTPC Ltd"
                                value={proj.client}
                                onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, client: e.target.value } : p))} />
                            </div>
                          </div>

                          {/* Row 2: Value | Year | Duration | Sector */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Value (₹ Cr)</label>
                              <input className="form-input" type="number" min="0" step="0.1" placeholder="e.g. 8.5"
                                value={proj.value}
                                onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, value: e.target.value } : p))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Year</label>
                              <input className="form-input" type="number" min="2000" max="2099" placeholder="e.g. 2023"
                                value={proj.year}
                                onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, year: e.target.value } : p))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Duration (months)</label>
                              <input className="form-input" type="number" min="1" placeholder="e.g. 18"
                                value={proj.durationMonths}
                                onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, durationMonths: e.target.value } : p))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Sector</label>
                              <select className="form-select" value={proj.sector}
                                onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, sector: e.target.value } : p))}>
                                {(sectors?.length ? sectors.map(s => s.Sector_Name) : ['IT']).map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Description */}
                          <div className="form-group" style={{ marginBottom: 10 }}>
                            <label className="form-label">Project Description</label>
                            <textarea className="form-input" rows={2}
                              style={{ resize: 'none', height: 60, fontSize: 12 }}
                              placeholder="Brief scope of work, deliverables, or outcome…"
                              value={proj.description}
                              onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, description: e.target.value } : p))} />
                          </div>

                          {/* Keywords */}
                          <div className="form-group" style={{ marginBottom: 12 }}>
                            <label className="form-label required">Keywords</label>
                            <TagInput
                              value={proj.keywords}
                              onChange={v => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, keywords: v } : p))}
                              placeholder="e.g. SAP, cloud, VAPT - press Enter…"
                            />
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                              Used to match this project against tender experience requirements.
                            </p>
                          </div>

                          {/* Completion Certificate checkbox */}
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            <input type="checkbox" checked={proj.certIssued}
                              onChange={e => setDeptProjects(deptProjects.map((p, idx) => idx === i ? { ...p, certIssued: e.target.checked } : p))} />
                            <span>Completion Certificate Issued</span>
                            {proj.certIssued && <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>✓ Verified</span>}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB: Previous Tenders ── */}
              {activeTab === 'tenders' && (
                <div>
                  <div className="flex-between" style={{ marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={16} color="var(--brand)" /> Previous Tenders
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Tenders this department has previously submitted or participated in — used as bid history.
                      </p>
                    </div>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => setDeptTenders([...deptTenders, { id: Date.now(), ...emptyTender() }])}>
                      + Add Tender
                    </button>
                  </div>

                  {deptTenders.length === 0 ? (
                    <div style={{ padding: '20px 0' }}>
                      <EmptyState message="No previous tenders added yet. Click '+ Add Tender' to begin." />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {deptTenders.map((tndr, i) => (
                        <div key={tndr.id} style={{
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: 16, position: 'relative',
                        }}>
                          {/* Row badge + remove */}
                          <div className="flex-between" style={{ marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-muted)', padding: '2px 10px', borderRadius: 20 }}>
                                Tender #{i + 1}
                              </span>
                              {tndr.outcome && OUTCOME_STYLES[tndr.outcome] && (
                                <span style={{
                                  fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20,
                                  background: OUTCOME_STYLES[tndr.outcome].background,
                                  color: OUTCOME_STYLES[tndr.outcome].color,
                                  border: `1px solid ${OUTCOME_STYLES[tndr.outcome].border}`,
                                }}>
                                  {tndr.outcome}
                                </span>
                              )}
                            </div>
                            <button className="btn btn-danger btn-sm"
                              onClick={() => setDeptTenders(deptTenders.filter((_, idx) => idx !== i))}>
                              <X size={12} /> Remove
                            </button>
                          </div>

                          {/* Row 1: Title | Ref */}
                          <div className="form-grid" style={{ marginBottom: 10 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label required">Tender Title</label>
                              <input className="form-input" placeholder="e.g. Supply of IT Equipment for NTPC"
                                value={tndr.title}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, title: e.target.value } : t))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Reference / Bid No.</label>
                              <input className="form-input" placeholder="e.g. NTPC/IT/2023/001"
                                value={tndr.ref}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, ref: e.target.value } : t))} />
                            </div>
                          </div>

                          {/* Row 2: Issuing Org | Portal | Submission Date | Outcome */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Issuing Organisation</label>
                              <input className="form-input" placeholder="e.g. NTPC Ltd"
                                value={tndr.issuingOrg}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, issuingOrg: e.target.value } : t))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Portal / Source</label>
                              <input className="form-input" placeholder="e.g. CPPP"
                                value={tndr.portalSource}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, portalSource: e.target.value } : t))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Submission Date</label>
                              <input className="form-input" type="date"
                                value={tndr.submissionDate}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, submissionDate: e.target.value } : t))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Outcome</label>
                              <select className="form-select" value={tndr.outcome}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, outcome: e.target.value } : t))}>
                                <option value="">Select outcome…</option>
                                {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Row 3: Value | Sector */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Tender Value (₹ Cr)</label>
                              <input className="form-input" type="number" min="0" step="0.1" placeholder="e.g. 12.5"
                                value={tndr.value}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, value: e.target.value } : t))} />
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label className="form-label">Sector</label>
                              <select className="form-select" value={tndr.sector}
                                onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, sector: e.target.value } : t))}>
                                {(sectors?.length ? sectors.map(s => s.Sector_Name) : ['IT']).map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Notes */}
                          <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Notes</label>
                            <textarea className="form-input" rows={2}
                              style={{ resize: 'none', height: 56, fontSize: 12 }}
                              placeholder="Reason for loss, key learnings, special conditions…"
                              value={tndr.notes}
                              onChange={e => setDeptTenders(deptTenders.map((t, idx) => idx === i ? { ...t, notes: e.target.value } : t))} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="modal-footer" style={{ justifyContent: 'flex-start' }}>
                {activeTab === 'info' && (
                  <button className="btn btn-primary" onClick={() => {
                    const errs = validateDept(form)
                    if (Object.keys(errs).length > 0) { setErrors(errs); setTouched(true); return }
                    setActiveTab('criteria')
                  }}>
                    Next Page
                  </button>
                )}
                {activeTab === 'criteria' && (
                  <button className="btn btn-primary" onClick={() => setActiveTab('projects')}>
                    Next Page
                  </button>
                )}
                {activeTab === 'projects' && (
                  <button className="btn btn-primary" onClick={() => setActiveTab('tenders')}>
                    Next Page
                  </button>
                )}
                {activeTab === 'tenders' && (
                  <button className="btn btn-primary" onClick={saveDept} disabled={saving}>
                    {saving ? 'Saving…' : editTarget ? 'Update Department' : 'Save Department'}
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
              </div>
            </div>{/* end modal-body */}
          </div>
        </div>
      )}

      {/* Add Portal Modal */}
      {portalModal && (
        <Modal title="🌐 Add New Portal to Whitelist" onClose={() => setPortalModal(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setPortalModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={async () => {
              if (!newPortal.name.trim() || !newPortal.url.trim()) return
              try {
                const res = await api.post('/portals', { Portal_Name: newPortal.name.trim(), Base_URL: newPortal.url.trim() })
                setPortalOptions(prev => [...prev, res.data])
                setNewPortal({ name: '', url: '' })
                setPortalModal(false)
              } catch (err) {
                setAlertData({ title: 'Error', message: 'Failed to add portal.' })
              }
            }}>Add to Whitelist</button>
          </>}>
          <div className="form-group">
            <label className="form-label required">Portal Name</label>
            <input className="form-input" placeholder="e.g. CPPP Portal" value={newPortal.name}
              onChange={e => setNewPortal({ ...newPortal, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label required">Base URL</label>
            <input className="form-input" placeholder="https://cppp.gov.in" value={newPortal.url}
              onChange={e => setNewPortal({ ...newPortal, url: e.target.value })} />
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Department"
          message={`Are you sure you want to delete "${depts.find(d => d.id === confirmDelete)?.name}"? This will also remove all associated rules and portal/keyword mappings. This action cannot be undone.`}
          onConfirm={() => deleteDept(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
          danger={true}
        />
      )}

      {/* Alert Dialog */}
      {alertData && (
        <ConfirmDialog
          title={alertData.title}
          message={alertData.message}
          onConfirm={() => setAlertData(null)}
          alertMode={true}
        />
      )}
    </PageWrapper>
  )
}
