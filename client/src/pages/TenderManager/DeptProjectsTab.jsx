import { useState } from 'react'
import { Plus, Trash2, Save, X, Pencil, CheckSquare, Square } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const API = 'http://localhost:8000'

const SECTORS = ['IT', 'Energy', 'Healthcare', 'Construction', 'Finance', 'Education',
  'Defence', 'Agriculture', 'Transport', 'Water', 'Telecom', 'Manufacturing', 'Other']

const empty = () => ({
  Project_Title:    '',
  Client_Name:      '',
  Value_Cr:         '',
  Completion_Year:  '',
  Duration_Months:  '',
  Sector_Name:      '',
  Description:      '',
  Keywords_JSON:    '[]',
  Cert_Issued:      false,
})

const parseKw = (json) => { try { return JSON.parse(json || '[]') } catch { return [] } }

// ─── Shared input styles ──────────────────────────────────────────────────────
const inputStyle = {
  padding: '7px 10px', fontSize: 12, borderRadius: 6,
  background: '#ffffff', border: '1px solid var(--border)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

// ─── Keywords tag input ───────────────────────────────────────────────────────
function KeywordInput({ value, onChange, disabled }) {
  const [input, setInput] = useState('')
  const tags = parseKw(value)

  const addTag = () => {
    const trimmed = input.trim()
    if (!trimmed || tags.includes(trimmed)) { setInput(''); return }
    const updated = [...tags, trimmed]
    onChange(JSON.stringify(updated))
    setInput('')
  }

  const removeTag = (tag) => {
    onChange(JSON.stringify(tags.filter(t => t !== tag)))
  }

  return (
    <div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 5,
        minHeight: 36, padding: '5px 8px', borderRadius: 6,
        background: 'var(--bg-2)', border: '1px solid var(--border)', alignItems: 'center',
      }}>
        {tags.map(t => (
          <span key={t} style={{
            display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600,
            padding: '2px 7px', borderRadius: 10,
            background: 'var(--brand)20', color: 'var(--brand)',
            border: '1px solid var(--brand)40',
          }}>
            {t}
            {!disabled && (
              <X size={10} style={{ cursor: 'pointer' }} onClick={() => removeTag(t)} />
            )}
          </span>
        ))}
        {!disabled && (
          <input
            value={input}
            placeholder={tags.length === 0 ? 'e.g. SAP, cloud, VAPT — press Enter…' : ''}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            style={{ flex: 1, minWidth: 120, border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: 'var(--text)', padding: '2px 0' }}
          />
        )}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
        Used to match this project against tender experience requirements.
      </div>
    </div>
  )
}

// ─── Project form card ────────────────────────────────────────────────────────
function ProjectForm({ form, setForm, onSave, onCancel, saveLabel = 'Save', badge }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid var(--brand)40', borderRadius: 10, padding: 16, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
      {badge && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: 'var(--brand)18', color: 'var(--brand)' }}>{badge}</span>
        </div>
      )}

      {/* Row 1: Title + Client */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Project Title <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input style={inputStyle} placeholder="e.g. ERP Implementation for SAIL"
            value={form.Project_Title} onChange={e => setForm(f => ({ ...f, Project_Title: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Client / Organisation <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input style={inputStyle} placeholder="e.g. NTPC Ltd"
            value={form.Client_Name} onChange={e => setForm(f => ({ ...f, Client_Name: e.target.value }))} />
        </div>
      </div>

      {/* Row 2: Value + Year + Duration + Sector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Value (₹ Cr)</label>
          <input style={inputStyle} type="number" placeholder="e.g. 8.5"
            value={form.Value_Cr} onChange={e => setForm(f => ({ ...f, Value_Cr: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Year</label>
          <input style={inputStyle} type="number" placeholder="e.g. 2023"
            value={form.Completion_Year} onChange={e => setForm(f => ({ ...f, Completion_Year: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Duration (months)</label>
          <input style={inputStyle} type="number" placeholder="e.g. 18"
            value={form.Duration_Months} onChange={e => setForm(f => ({ ...f, Duration_Months: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Sector</label>
          <select style={inputStyle} value={form.Sector_Name} onChange={e => setForm(f => ({ ...f, Sector_Name: e.target.value }))}>
            <option value="">— Select —</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Row 3: Description */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Project Description</label>
        <textarea placeholder="Brief scope of work, deliverables, or outcome…"
          value={form.Description}
          onChange={e => setForm(f => ({ ...f, Description: e.target.value }))}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 68 }}
        />
      </div>

      {/* Row 4: Keywords */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Keywords <span style={{ color: 'var(--danger)' }}>*</span></label>
        <KeywordInput value={form.Keywords_JSON} onChange={v => setForm(f => ({ ...f, Keywords_JSON: v }))} />
      </div>

      {/* Row 5: Cert checkbox */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}
        onClick={() => setForm(f => ({ ...f, Cert_Issued: !f.Cert_Issued }))}>
        {form.Cert_Issued
          ? <CheckSquare size={15} style={{ color: 'var(--brand)' }} />
          : <Square size={15} style={{ color: 'var(--text-muted)' }} />}
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Completion Certificate Issued</span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, background: '#f0f3f9', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer' }}>
          Cancel
        </button>
        <button onClick={onSave} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', borderRadius: 6, fontSize: 12, background: 'var(--brand)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
          <Save size={12} /> {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DeptProjectsTab({ deptId, projects: init, onToast }) {
  const [projects, setProjects] = useState(init || [])
  const [adding, setAdding]     = useState(false)
  const [form, setForm]         = useState(empty())
  const [editing, setEditing]   = useState(null)
  const [editForm, setEditForm] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title }

  const normalize = (f) => ({
    ...f,
    Value_Cr:        f.Value_Cr        ? Number(f.Value_Cr)        : null,
    Completion_Year: f.Completion_Year ? Number(f.Completion_Year) : null,
    Duration_Months: f.Duration_Months ? Number(f.Duration_Months) : null,
  })

  const save = async () => {
    if (!form.Project_Title || !form.Client_Name) return onToast('Project Title and Client are required', 'error')
    const r = await fetch(`${API}/api/departments/${deptId}/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalize(form)),
    })
    if (!r.ok) return onToast('Failed to add project', 'error')
    const created = await r.json()
    setProjects(p => [...p, created])
    setForm(empty()); setAdding(false)
    onToast('Project added', 'success')
  }

  const saveEdit = async (id) => {
    const r = await fetch(`${API}/api/departments/${deptId}/projects/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalize(editForm)),
    })
    if (!r.ok) return onToast('Failed to update', 'error')
    const updated = await r.json()
    setProjects(p => p.map(x => x.DPrM_ID === id ? updated : x))
    setEditing(null); onToast('Project updated', 'success')
  }

  const del = async (id) => {
    await fetch(`${API}/api/departments/${deptId}/projects/${id}`, { method: 'DELETE' })
    setProjects(p => p.filter(x => x.DPrM_ID !== id))
    onToast('Project removed', 'success')
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    await del(confirmDelete.id)
    setConfirmDelete(null)
  }

  const startEdit = (p) => {
    setEditing(p.DPrM_ID)
    setEditForm({
      Project_Title:   p.Project_Title   || '',
      Client_Name:     p.Client_Name     || '',
      Value_Cr:        p.Value_Cr        ?? '',
      Completion_Year: p.Completion_Year ?? '',
      Duration_Months: p.Duration_Months ?? '',
      Sector_Name:     p.Sector_Name     || '',
      Description:     p.Description     || '',
      Keywords_JSON:   p.Keywords_JSON   || '[]',
      Cert_Issued:     p.Cert_Issued     || false,
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => { setAdding(true); setEditing(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'var(--brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Add Project
        </button>
      </div>

      {adding && (
        <ProjectForm form={form} setForm={setForm} badge={`Project #${projects.length + 1}`}
          onSave={save} saveLabel="Save Project"
          onCancel={() => { setAdding(false); setForm(empty()) }} />
      )}

      {projects.length === 0 && !adding && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
          No past projects. Click "Add Project" to add one.
        </div>
      )}

      {projects.map((p, idx) => (
        <div key={p.DPrM_ID}>
          {editing === p.DPrM_ID ? (
            <ProjectForm form={editForm} setForm={setEditForm} badge={`Project #${idx + 1}`}
              onSave={() => saveEdit(p.DPrM_ID)} saveLabel="Update"
              onCancel={() => setEditing(null)} />
          ) : (
            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                    {p.Project_Title}
                    {p.Cert_Issued && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: '#22c55e18', color: '#22c55e', border: '1px solid #22c55e30' }}>✓ Cert</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {p.Client_Name}
                    {p.Completion_Year ? ` · ${p.Completion_Year}` : ''}
                    {p.Duration_Months ? ` · ${p.Duration_Months}mo` : ''}
                    {p.Sector_Name ? ` · ${p.Sector_Name}` : ''}
                  </div>
                  {p.Description && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{p.Description}</div>}
                  {parseKw(p.Keywords_JSON).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {parseKw(p.Keywords_JSON).map(k => (
                        <span key={k} style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'var(--brand)15', color: 'var(--brand)', border: '1px solid var(--brand)30' }}>{k}</span>
                      ))}
                    </div>
                  )}
                </div>
                {p.Value_Cr != null && (
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap' }}>₹{p.Value_Cr} Cr</div>
                )}
                <button onClick={() => startEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => setConfirmDelete({ id: p.DPrM_ID, title: p.Project_Title })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                  <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete Project?"
          message={`Remove "${confirmDelete.title}" from past projects? This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          danger
        />
      )}
    </div>
  )
}
