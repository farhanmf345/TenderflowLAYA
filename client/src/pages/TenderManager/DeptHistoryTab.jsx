import { useState } from 'react'
import { Plus, Trash2, Save, Pencil } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const API = 'http://localhost:8000'

const SECTORS = ['IT', 'Energy', 'Healthcare', 'Construction', 'Finance', 'Education',
  'Defence', 'Agriculture', 'Transport', 'Water', 'Telecom', 'Manufacturing', 'Other']

const OUTCOMES = [
  { value: 'WON',           label: 'Won' },
  { value: 'SUBMITTED',     label: 'Submitted' },
  { value: 'SHORTLISTED',   label: 'Shortlisted' },
  { value: 'LOST',          label: 'Lost' },
  { value: 'DISQUALIFIED',  label: 'Disqualified' },
]

const OUTCOME_COLOR = {
  WON:          '#22c55e',
  SUBMITTED:    'var(--brand)',
  SHORTLISTED:  '#f59e0b',
  LOST:         '#ef4444',
  DISQUALIFIED: '#ef4444',
}

const empty = () => ({
  Tender_Title:  '',
  Tender_Ref:    '',
  Issuing_Org:   '',
  Portal_Source: '',
  Submission_Date: '',
  Outcome:       '',
  Value_Cr:      '',
  Sector_Name:   '',
  Notes:         '',
})

// ─── Shared input styles ──────────────────────────────────────────────────────
const inputStyle = {
  padding: '7px 10px', fontSize: 12, borderRadius: 6,
  background: '#ffffff', border: '1px solid var(--border)',
  color: 'var(--text)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

// ─── Tender form card ─────────────────────────────────────────────────────────
function TenderForm({ form, setForm, onSave, onCancel, saveLabel = 'Save', badge }) {
  return (
    <div style={{ background: '#ffffff', border: '1px solid var(--brand)40', borderRadius: 10, padding: 16, marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
      {badge && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 10, background: 'var(--brand)18', color: 'var(--brand)' }}>{badge}</span>
        </div>
      )}

      {/* Row 1: Tender Title + Ref */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Tender Title <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input style={inputStyle} placeholder="e.g. Supply of IT Equipment for NTPC"
            value={form.Tender_Title} onChange={e => setForm(f => ({ ...f, Tender_Title: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Reference / Bid No.</label>
          <input style={inputStyle} placeholder="e.g. NTPC/IT/2023/001"
            value={form.Tender_Ref} onChange={e => setForm(f => ({ ...f, Tender_Ref: e.target.value }))} />
        </div>
      </div>

      {/* Row 2: Issuing Org + Portal Source + Submission Date + Outcome */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Issuing Organisation</label>
          <input style={inputStyle} placeholder="e.g. NTPC Ltd"
            value={form.Issuing_Org} onChange={e => setForm(f => ({ ...f, Issuing_Org: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Portal / Source</label>
          <input style={inputStyle} placeholder="e.g. CPPP"
            value={form.Portal_Source} onChange={e => setForm(f => ({ ...f, Portal_Source: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Submission Date</label>
          <input style={inputStyle} type="date"
            value={form.Submission_Date} onChange={e => setForm(f => ({ ...f, Submission_Date: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Outcome</label>
          <select style={inputStyle} value={form.Outcome} onChange={e => setForm(f => ({ ...f, Outcome: e.target.value }))}>
            <option value="">Select outcome…</option>
            {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Row 3: Value + Sector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Tender Value (₹ Cr)</label>
          <input style={inputStyle} type="number" placeholder="e.g. 12.5"
            value={form.Value_Cr} onChange={e => setForm(f => ({ ...f, Value_Cr: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Sector</label>
          <select style={inputStyle} value={form.Sector_Name} onChange={e => setForm(f => ({ ...f, Sector_Name: e.target.value }))}>
            <option value="">— Select —</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Row 4: Notes */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Notes</label>
        <textarea placeholder="Reason for loss, key learnings, special conditions…"
          value={form.Notes}
          onChange={e => setForm(f => ({ ...f, Notes: e.target.value }))}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
        />
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
export default function DeptHistoryTab({ deptId, history: init, onToast }) {
  const [history, setHistory] = useState(init || [])
  const [adding, setAdding]   = useState(false)
  const [form, setForm]       = useState(empty())
  const [editing, setEditing] = useState(null)   // DTH_ID being edited
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, title }

  const normalize = (f) => ({
    ...f,
    Value_Cr: f.Value_Cr ? Number(f.Value_Cr) : null,
    Submission_Date: f.Submission_Date || null,
    Outcome: f.Outcome || null,
  })

  // Full-replace sync (PUT replaces all)
  const syncToServer = async (updated) => {
    setSaving(true)
    const payload = updated.map(h => ({
      Tender_Title:    h.Tender_Title,
      Tender_Ref:      h.Tender_Ref    || null,
      Issuing_Org:     h.Issuing_Org   || null,
      Portal_Source:   h.Portal_Source || null,
      Submission_Date: h.Submission_Date || null,
      Outcome:         h.Outcome       || null,
      Value_Cr:        h.Value_Cr != null ? Number(h.Value_Cr) : null,
      Sector_Name:     h.Sector_Name   || null,
      Notes:           h.Notes         || null,
    }))
    const r = await fetch(`${API}/api/departments/${deptId}/tenders`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!r.ok) { onToast('Failed to save', 'error'); return null }
    return await r.json()
  }

  const add = async () => {
    if (!form.Tender_Title) return onToast('Tender Title is required', 'error')
    const saved = await syncToServer([...history, normalize(form)])
    if (saved) { setHistory(saved); setForm(empty()); setAdding(false); onToast('History entry added', 'success') }
  }

  const saveEdit = async (id) => {
    const updated = history.map(h => (h.DTH_ID === id ? { ...h, ...normalize(editForm) } : h))
    const saved = await syncToServer(updated)
    if (saved) { setHistory(saved); setEditing(null); onToast('Entry updated', 'success') }
  }

  const del = async (id) => {
    const updated = history.filter(h => h.DTH_ID !== id)
    const saved = await syncToServer(updated)
    if (saved) { setHistory(saved); onToast('Entry removed', 'success') }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    await del(confirmDelete.id)
    setConfirmDelete(null)
  }

  const startEdit = (h) => {
    setEditing(h.DTH_ID)
    setEditForm({
      Tender_Title:    h.Tender_Title    || '',
      Tender_Ref:      h.Tender_Ref      || '',
      Issuing_Org:     h.Issuing_Org     || '',
      Portal_Source:   h.Portal_Source   || '',
      Submission_Date: h.Submission_Date || '',
      Outcome:         h.Outcome         || '',
      Value_Cr:        h.Value_Cr        ?? '',
      Sector_Name:     h.Sector_Name     || '',
      Notes:           h.Notes           || '',
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={() => { setAdding(true); setEditing(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: 'var(--brand)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={13} /> Add Tender
        </button>
      </div>

      {adding && (
        <TenderForm form={form} setForm={setForm} badge={`Tender #${history.length + 1}`}
          onSave={add} saveLabel={saving ? 'Saving…' : 'Save Entry'}
          onCancel={() => { setAdding(false); setForm(empty()) }} />
      )}

      {history.length === 0 && !adding && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>
          No tender history recorded. Click "Add Tender" to add one.
        </div>
      )}

      {history.map((h, idx) => (
        <div key={h.DTH_ID ?? idx}>
          {editing === h.DTH_ID ? (
            <TenderForm form={editForm} setForm={setEditForm} badge={`Tender #${idx + 1}`}
              onSave={() => saveEdit(h.DTH_ID)} saveLabel={saving ? 'Saving…' : 'Update'}
              onCancel={() => setEditing(null)} />
          ) : (
            <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{h.Tender_Title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {[h.Issuing_Org, h.Portal_Source, h.Submission_Date, h.Sector_Name].filter(Boolean).join(' · ')}
                  </div>
                  {h.Tender_Ref && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Ref: {h.Tender_Ref}</div>}
                  {h.Notes && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 5, lineHeight: 1.5, fontStyle: 'italic' }}>{h.Notes}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {h.Value_Cr != null && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', whiteSpace: 'nowrap' }}>₹{h.Value_Cr} Cr</div>
                  )}
                  {h.Outcome && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      color: OUTCOME_COLOR[h.Outcome] || 'var(--text-muted)',
                      background: `${OUTCOME_COLOR[h.Outcome] || 'var(--text-muted)'}18`,
                      border: `1px solid ${OUTCOME_COLOR[h.Outcome] || 'var(--text-muted)'}40`,
                    }}>
                      {OUTCOMES.find(o => o.value === h.Outcome)?.label || h.Outcome}
                    </span>
                  )}
                  <button onClick={() => startEdit(h)} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => setConfirmDelete({ id: h.DTH_ID, title: h.Tender_Title })} disabled={saving} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      {confirmDelete && (
        <ConfirmDialog
          title="Remove History Entry?"
          message={`Remove "${confirmDelete.title}" from tender history? This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmDelete(null)}
          danger
        />
      )}
    </div>
  )
}
