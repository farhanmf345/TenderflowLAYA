import { useState, useEffect } from 'react'
import PageWrapper from '../components/layout/PageWrapper'
import MultiCombobox from '../components/ui/MultiCombobox'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { GripVertical, X, Plus } from 'lucide-react'
import api from '../lib/api'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import FieldTip from '../components/ui/FieldTip'

const FIELD_TIPS = {
  Company_Name: 'Legal entity name shown in qualification reports and emails.',
  Company_Description: 'Brief profile summary used as company context in AI narratives.',
  Annual_Turnover_Cr: 'Annual revenue (₹ Cr) — scored against tender value in Financial Strength.',
  Net_Worth_Cr: 'Net worth (₹ Cr) — contributes to the financial qualification dimension.',
  Current_Ratio: 'Liquidity ratio (current assets ÷ liabilities) — higher is healthier.',
  Years_Of_Operation: 'Years since incorporation — feeds the Legal Standing score.',
  Key_Personnel_Count: 'Qualified staff count — drives the Technical Capability score.',
}

// Fallback static list used only when the DB hasn't been seeded yet
const STATES_FALLBACK = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan',
  'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
]

// ─── Validation rules ─────────────────────────────────────
const FINANCIAL_RULES = [
  { key: 'Annual_Turnover_Cr', label: 'Annual Turnover', min: 0.01, max: 99999, integer: false },
  { key: 'Net_Worth_Cr', label: 'Net Worth', min: 0.01, max: 99999, integer: false },
  { key: 'Current_Ratio', label: 'Current Ratio', min: 0.01, max: 100, integer: false },
  { key: 'Years_Of_Operation', label: 'Years of Operation', min: 1, max: 200, integer: true },
  { key: 'Key_Personnel_Count', label: 'Key Personnel Count', min: 1, max: 999999, integer: true },
]

function validateFinancials(form) {
  const errs = {}
  if (!form.Company_Name.trim()) errs.Company_Name = 'Company name is required.'
  FINANCIAL_RULES.forEach(({ key, label, min, max, integer }) => {
    const val = parseFloat(form[key])
    if (form[key] === '' || isNaN(val)) { errs[key] = `${label} is required.`; return }
    if (integer && !Number.isInteger(val)) { errs[key] = `${label} must be a whole number.`; return }
    if (val < min) { errs[key] = `${label} must be at least ${min}.`; return }
    if (val > max) { errs[key] = `${label} must be at most ${max.toLocaleString()}.` }
  })
  if (!form.registered_states || form.registered_states.length === 0)
    errs.registered_states = 'At least one registered state is required.'
  return errs
}

const emptyForm = () => ({
  Company_Name: '',
  Company_Description: '',
  Annual_Turnover_Cr: '',
  Net_Worth_Cr: '',
  Current_Ratio: '',
  Years_Of_Operation: '',
  Key_Personnel_Count: '',
  Is_MSME: false,
  Is_Startup: false,
  Is_Women_Led: false,
  certifications: [],
  registered_states: [],
})

export default function CompanyProfile() {
  const [companyId, setCompanyId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [assets, setAssets] = useState([])
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(false)
  const [savedForm, setSavedForm] = useState(null)   // snapshot for cancel
  const [savedAssets, setSavedAssets] = useState([]) // snapshot for cancel

  // Certificate master state - loaded from API
  const [certMaster, setCertMaster] = useState([])   // [{Certificate_ID, Certificate_NAME}]
  const [certInput, setCertInput] = useState('')
  const [showAddCert, setShowAddCert] = useState(false)
  const [certFeedback, setCertFeedback] = useState(null)  // { type: 'new'|'exists', msg }
  const [alertData, setAlertData] = useState(null)

  // States master - loaded from API, falls back to static list
  const [statesMaster, setStatesMaster] = useState(STATES_FALLBACK)

  const enterEdit = () => {
    setSavedForm(form)
    setSavedAssets(assets)
    setEditing(true)
  }
  const cancelEdit = () => {
    setForm(savedForm)
    setAssets(savedAssets)
    setErrors({})
    setEditing(false)
  }


  // ─── Page Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      // 1. Always load CertificateMaster - independent of whether a profile exists
      try {
        const certsRes = await api.get('/company/certificates')
        setCertMaster(certsRes.data)
      } catch (err) {
        console.error('[CompanyProfile] certificates fetch failed', err)
      }

      // 2. Load StateMaster from DB (auto-seeded on first state save)
      try {
        const statesRes = await api.get('/company/states')
        if (statesRes.data && statesRes.data.length > 0) {
          setStatesMaster(statesRes.data.map(s => s.State_Name))
        }
        // else keep the static fallback so the combobox is never empty
      } catch (err) {
        console.error('[CompanyProfile] states fetch failed', err)
      }

      // 3. Load company profile - may 404 on first run (that's OK)
      try {
        const cRes = await api.get('/company/profile')
        const c = cRes.data
        setCompanyId(c.Company_ID)
        setForm({
          Company_Name: c.Company_Name || '',
          Company_Description: c.Company_Description || '',
          Annual_Turnover_Cr: String(c.Annual_Turnover_Cr),
          Net_Worth_Cr: String(c.Net_Worth_Cr),
          Current_Ratio: String(c.Current_Ratio),
          Years_Of_Operation: String(c.Years_Of_Operation),
          Key_Personnel_Count: String(c.Key_Personnel_Count),
          Is_MSME: c.Is_MSME,
          Is_Startup: c.Is_Startup,
          Is_Women_Led: c.Is_Women_Led,
          certifications: (c.cert_mapping || []).map(cm => cm.certificate.Certificate_NAME),
          registered_states: (c.states || []).map(sm => sm.state.State_Name),
        })
        // Equipment stored as "name||qty" or just "name"
        setAssets(
          (c.equipment || []).map(e => {
            const parts = e.Equipment_NAME.split('||')
            return { id: e.PEM_ID, name: parts[0] || '', qty: parts[1] || '' }
          })
        )
      } catch (err) {
        if (err.response?.status === 404) {
          // First-time setup - leave form at defaults, companyId stays null
          console.info('[CompanyProfile] No profile found - first-time setup mode.')
        } else {
          console.error('[CompanyProfile] profile fetch failed', err)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])


  // ─── Add Certificate to Master ─────────────────────────────────────────────
  const addCertToMaster = async () => {
    const trimmed = certInput.trim()
    if (!trimmed) return

    const alreadyInMaster = certMaster.find(
      c => c.Certificate_NAME.toLowerCase() === trimmed.toLowerCase()
    )
    if (alreadyInMaster) {
      if (!form.certifications.includes(alreadyInMaster.Certificate_NAME))
        setForm(f => ({ ...f, certifications: [...f.certifications, alreadyInMaster.Certificate_NAME] }))
      setCertFeedback({ type: 'exists', msg: `"${alreadyInMaster.Certificate_NAME}" is already in the master list and has been selected.` })
    } else {
      try {
        const res = await api.post('/company/certificates', { Certificate_NAME: trimmed })
        setCertMaster(m => [...m, res.data])
        setForm(f => ({ ...f, certifications: [...f.certifications, res.data.Certificate_NAME] }))
        setCertFeedback({ type: 'new', msg: `"${trimmed}" added to Certificate Master and selected.` })
      } catch (err) {
        setAlertData({ title: 'Error', message: 'Failed to add certificate.' })
        return
      }
    }
    setCertInput('')
    setShowAddCert(false)
    setTimeout(() => setCertFeedback(null), 3500)
  }


  // ─── Save Profile ──────────────────────────────────────────────────────────
  const save = async () => {
    const errs = validateFinancials(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    setSaving(true)
    try {
      const corePayload = {
        Company_Name: form.Company_Name,
        Company_Description: form.Company_Description,
        Annual_Turnover_Cr: parseFloat(form.Annual_Turnover_Cr),
        Net_Worth_Cr: parseFloat(form.Net_Worth_Cr),
        Current_Ratio: parseFloat(form.Current_Ratio),
        Years_Of_Operation: parseInt(form.Years_Of_Operation),
        Key_Personnel_Count: parseInt(form.Key_Personnel_Count),
        Is_MSME: form.Is_MSME,
        Is_Startup: form.Is_Startup,
        Is_Women_Led: form.Is_Women_Led,
        // Required by schema on first create
        Valid_From: new Date().toISOString(),
        Valid_To: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }

      // 1. Core fields - POST on first save, PUT on updates
      let id = companyId
      if (!id) {
        const res = await api.post('/company/profile', corePayload)
        id = res.data.Company_ID
        setCompanyId(id)
      } else {
        await api.put(`/company/profile/${id}`, corePayload)
      }

      // 2. Equipment (filter blank rows)
      await api.put(`/company/profile/${id}/equipment`, {
        items: assets
          .filter(a => a.name.trim())
          .map(a => ({ name: a.name.trim(), qty: a.qty.trim() })),
      })

      // 3. Registered States
      await api.put(`/company/profile/${id}/states`, {
        state_names: form.registered_states,
      })

      // 4. Certifications - map cert names  Certificate_IDs
      const certIds = form.certifications
        .map(name => certMaster.find(c => c.Certificate_NAME === name)?.Certificate_ID)
        .filter(Boolean)
      await api.put(`/company/profile/${id}/certifications`, {
        certificate_ids: certIds,
      })

      setErrors({})
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[CompanyProfile] save failed', err)
      setAlertData({ title: 'Error', message: 'Failed to save company profile. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  // Always validate on every keystroke
  const handleField = (key, rawVal) => {
    let val = rawVal
    if (rawVal !== '' && !isNaN(parseFloat(rawVal))) {
      const num = parseFloat(rawVal)
      if (num < 0) val = '0'
    }
    const next = { ...form, [key]: val }
    setForm(next)
    setErrors(validateFinancials(next))
  }

  const addAsset = () => setAssets([...assets, { name: '', qty: '' }])
  const removeAsset = (i) => setAssets(assets.filter((_, idx) => idx !== i))
  const updateAsset = (i, field, val) =>
    setAssets(assets.map((a, idx) => idx === i ? { ...a, [field]: val } : a))

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <PageWrapper>
        <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}>
          <Spinner size={28} text="Loading company profile…" />
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Company Profile</div>
          <div className="page-sub">
            Master company data - inherited by all departments. Sector and validity are configured per department.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={enterEdit}>Edit Profile</button>
          )}
        </div>
      </div>

      {/* 1 · Company Information */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cp-section-title">1 · Company Information</div>
        <div className="form-group">
          <label className="form-label required">Company Name<FieldTip text={FIELD_TIPS.Company_Name} /></label>
          <input
            className="form-input"
            value={form.Company_Name}
            disabled={!editing}
            style={errors.Company_Name ? { borderColor: 'var(--danger)' } : {}}
            onChange={(e) => handleField('Company_Name', e.target.value)} />
          {errors.Company_Name && <div className="form-error">{errors.Company_Name}</div>}

        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Company Description<FieldTip text={FIELD_TIPS.Company_Description} /></label>
          <textarea className="form-input" rows={3}
            style={{ resize: 'none', height: 72 }}
            value={form.Company_Description}
            disabled={!editing}
            onChange={(e) => setForm({ ...form, Company_Description: e.target.value })} />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Sector, validity period, and scrape schedule are configured individually per Department.
        </p>
      </div>

      {/* 2 · Financial Details */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cp-section-title">
          2 · Financial Details{' '}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>- Inherited by all departments</span>
        </div>
        <div className="form-grid">
          {[
            { key: 'Annual_Turnover_Cr', label: 'Annual Turnover (Crores)', min: 0.01, max: 99999, step: 0.01 },
            { key: 'Net_Worth_Cr', label: 'Net Worth (Crores)', min: 0.01, max: 99999, step: 0.01 },
            { key: 'Current_Ratio', label: 'Current Ratio', min: 0.01, max: 100, step: 0.01 },
            { key: 'Years_Of_Operation', label: 'Years of Operation', min: 1, max: 200, step: 1 },
            { key: 'Key_Personnel_Count', label: 'Key Personnel Count', min: 1, max: 999999, step: 1 },
          ].map(({ key, label, min, max, step }) => (
            <div className="form-group" key={key} style={{ marginBottom: 0 }}>
              <label className="form-label required">{label}<FieldTip text={FIELD_TIPS[key]} /></label>
              <input
                className="form-input"
                type="number"
                min={min}
                max={max}
                step={step}
                value={form[key]}
                disabled={!editing}
                style={errors[key] ? { borderColor: 'var(--danger)' } : {}}
                onChange={(e) => handleField(key, e.target.value)} />
              {errors[key] && <div className="form-error" style={{ marginTop: 4 }}>{errors[key]}</div>}
            </div>
          ))}
        </div>

      </div>

      {/* 3 · Certifications */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cp-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            3 · Certifications{' '}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>- Select all that the company holds</span>
          </div>
          {editing && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddCert(!showAddCert)}>
              <Plus size={12} style={{ marginRight: 4 }} /> Add Certificate
            </button>
          )}
        </div>

        {editing && showAddCert && (
          <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}>
            <label className="form-label">New Certificate Name</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="e.g. ISO 27001:2022"
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCertToMaster()}
              />
              <button className="btn btn-primary" onClick={addCertToMaster}>Add</button>
              <button className="btn btn-ghost" onClick={() => { setShowAddCert(false); setCertInput(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {certFeedback && (
          <div style={{
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 16,
            background: certFeedback.type === 'new' ? 'var(--success-bg)' : 'var(--warning-bg)',
            color: certFeedback.type === 'new' ? 'var(--success)' : '#b45309',
            border: `1px solid ${certFeedback.type === 'new' ? 'var(--success)' : '#f59e0b'}`
          }}>
            {certFeedback.msg}
          </div>
        )}

        <MultiCombobox
          options={certMaster.map(c => ({ value: c.Certificate_NAME, label: c.Certificate_NAME }))}
          value={form.certifications}
          disabled={!editing}
          onChange={(v) => setForm({ ...form, certifications: v })}
          placeholder="Select certifications…"
        />
      </div>

      {/* 4 · Registered States */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cp-section-title">
          4 · Registered States{' '}
          <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700, marginLeft: 2 }}>*</span>
        </div>
        <MultiCombobox
          options={statesMaster.map(s => ({ value: s, label: s }))}
          value={form.registered_states}
          disabled={!editing}
          onChange={(v) => {
            setForm({ ...form, registered_states: v })
            if (v.length > 0) setErrors(prev => ({ ...prev, registered_states: undefined }))
          }}
          placeholder="Select states…"
        />
        {errors.registered_states && (
          <div className="form-error" style={{ marginTop: 6 }}>{errors.registered_states}</div>
        )}
      </div>

      {/* 5 · Equipment / Assets */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="cp-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>5 · Equipment / Assets</span>
          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>Shared across all departments</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assets.length === 0 ? (
            <div style={{ padding: '20px 0' }}>
              <EmptyState message="No equipment or assets added yet." />
            </div>
          ) : (
            assets.map((a, i) => (
              <div key={i} className="list-item-row">
                <GripVertical size={14} className="drag-handle" />
                <div className="li-inputs">
                  <input className="form-input" value={a.name} placeholder="Asset description"
                    disabled={!editing}
                    onChange={(e) => updateAsset(i, 'name', e.target.value)} />
                  <input className="form-input li-year" value={a.qty} placeholder="Qty / detail"
                    disabled={!editing}
                    onChange={(e) => updateAsset(i, 'qty', e.target.value)} />
                </div>
                {editing && (
                  <button className="btn btn-danger btn-sm" onClick={() => removeAsset(i)}>
                    <X size={12} />
                  </button>
                )}
              </div>
            )))}
        </div>
        {editing && (
          <button className="list-add-btn" onClick={addAsset}>+ Add Asset</button>
        )}
      </div>

      {/* 6 · DEI Status */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="cp-section-title">6 · DEI Status</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { key: 'Is_MSME', label: 'MSME Registered' },
            { key: 'Is_Startup', label: 'Startup India (DPIIT)' },
            { key: 'Is_Women_Led', label: 'Women-Led Business' },
          ].map(({ key, label }) => (
            <label key={key} className="check-item" style={!editing ? { opacity: 0.6, cursor: 'not-allowed' } : {}}>
              <input type="checkbox" checked={form[key]}
                disabled={!editing}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Bottom actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {editing ? (
          <>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile'}
            </button>
            <button className="btn btn-ghost" onClick={cancelEdit} disabled={saving}>Cancel</button>
          </>
        ) : (
          <button className="btn btn-primary" onClick={enterEdit}>
            Edit Profile
          </button>
        )}
      </div>

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
