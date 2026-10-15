import { useState, useEffect } from 'react'
import { Plus, Trash2, ToggleLeft, ToggleRight, FileText, SlidersHorizontal } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const API = 'http://localhost:8000'

import {
  PRE_FILTER_FIELDS,
  QUAL_GATE_FIELDS,
  fieldLabel as criteriaFieldLabel,
} from '../../lib/criteriaFields'

const PRE_FIELD_OPTIONS = PRE_FILTER_FIELDS
const GATE_FIELD_OPTIONS = QUAL_GATE_FIELDS
const OPERATOR_OPTIONS = [
  { value: '=', label: 'is equal to' },
  { value: '!=', label: 'is not equal to' },
  { value: '>', label: 'is greater than' },
  { value: '<', label: 'is less than' },
  { value: '>=', label: 'is greater than or equal to' },
  { value: '<=', label: 'is less than or equal to' },
  { value: 'IN', label: 'is one of' },
  { value: 'NOT IN', label: 'is not one of' },
]
const ACTION_OPTIONS = [
  { value: 'Discard', label: 'Discard' },
  { value: 'Accept', label: 'Accept' },
]

const ruleFieldLabel = (rule) => criteriaFieldLabel(
  rule.Criteria_Type === 'PRE_FILTER' ? PRE_FIELD_OPTIONS : GATE_FIELD_OPTIONS,
  rule.Target_Field,
)
const opLabel = (v) => OPERATOR_OPTIONS.find(o => o.value === v)?.label || v

const emptyRule = { type: 'PRE_FILTER', field: '', operator: '=', value: '', action: 'Discard' }

export default function ManagerRules({ manager, departmentId }) {
  const [tab, setTab] = useState('structured')
  const [rules, setRules] = useState([])
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [ruleForm, setRuleForm] = useState(emptyRule)
  const [noteInput, setNoteInput] = useState('')
  const [confirmPending, setConfirmPending] = useState(null)

  const depts = manager.departments || []
  const [activeDept, setActiveDept] = useState(departmentId || depts[0]?.Department_ID || null)

  useEffect(() => {
    if (departmentId) {
      setActiveDept(departmentId)
    }
  }, [departmentId])

  useEffect(() => {
    if (!activeDept) { setLoading(false); return }
    setLoading(true)
    fetch(`${API}/api/criteria/?department_id=${activeDept}`)
      .then(r => r.json())
      .then(data => {
        setRules(data.filter(c => c.Criteria_Type !== 'NOTE'))
        setNotes(data.filter(c => c.Criteria_Type === 'NOTE'))
      })
      .catch(() => { })
      .finally(() => setLoading(false))
  }, [activeDept])

  // ── STRUCTURED RULES ──────────────────────────────────────────────────────

  const addRule = async () => {
    if (!ruleForm.field || !ruleForm.value.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${API}/api/criteria/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Department_ID: activeDept,
          Criteria_Type: ruleForm.type,
          Target_Field: ruleForm.field,
          Operator: ruleForm.operator,
          Target_Value: ruleForm.value.trim(),
          Action: ruleForm.action,
          Is_Active: true,
        }),
      })
      const created = await res.json()
      setRules(r => [...r, created])
      setRuleForm(emptyRule)
      setShowRuleForm(false)
    } finally { setSaving(false) }
  }

  const toggleRule = async (rule) => {
    const updated = { ...rule, Is_Active: !rule.Is_Active }
    await fetch(`${API}/api/criteria/${rule.Criteria_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Is_Active: updated.Is_Active }),
    })
    setRules(r => r.map(x => x.Criteria_ID === rule.Criteria_ID ? updated : x))
  }

  const deleteRule = async (id) => {
    await fetch(`${API}/api/criteria/${id}`, { method: 'DELETE' })
    setRules(r => r.filter(x => x.Criteria_ID !== id))
  }

  // ── CUSTOM NOTES ──────────────────────────────────────────────────────────

  const addNote = async () => {
    const text = noteInput.trim()
    if (!text) return
    const res = await fetch(`${API}/api/criteria/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Department_ID: activeDept,
        Criteria_Type: 'NOTE',
        Target_Field: 'custom',
        Operator: '==',
        Target_Value: text,
        Is_Active: true,
      }),
    })
    const created = await res.json()
    setNotes(n => [...n, created])
    setNoteInput('')
  }

  const deleteNote = async (id) => {
    await fetch(`${API}/api/criteria/${id}`, { method: 'DELETE' })
    setNotes(n => n.filter(x => x.Criteria_ID !== id))
  }

  const handleConfirm = async () => {
    if (!confirmPending) return
    if (confirmPending.type === 'rule') await deleteRule(confirmPending.id)
    if (confirmPending.type === 'note') await deleteNote(confirmPending.id)
    setConfirmPending(null)
  }

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div style={departmentId ? { maxWidth: 960 } : { padding: '28px 32px', maxWidth: 960 }}>
      {/* Header */}
      {!departmentId && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Participation Rules</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
            Define eligibility criteria for your department's tender participation
          </div>
        </div>
      )}

      {/* Dept selector (if multiple) */}
      {!departmentId && depts.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {depts.map(d => (
            <button
              key={d.Department_ID}
              onClick={() => { setActiveDept(d.Department_ID); setShowRuleForm(false); setRuleForm(emptyRule) }}
              style={{
                padding: '5px 14px', borderRadius: 16, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${activeDept === d.Department_ID ? 'var(--brand)' : 'var(--border)'}`,
                background: activeDept === d.Department_ID ? 'var(--brand)12' : 'var(--card-bg)',
                color: activeDept === d.Department_ID ? 'var(--brand)' : 'var(--text-2)',
              }}
            >
              {d.Department_Name}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {[
          { id: 'structured', Icon: SlidersHorizontal, label: 'Structured Rules' },
          { id: 'notes', Icon: FileText, label: 'Custom Notes' },
        ].map(({ id, Icon, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${tab === id ? 'var(--brand)' : 'var(--border)'}`,
            background: tab === id ? 'var(--brand)12' : 'var(--card-bg)',
            color: tab === id ? 'var(--brand)' : 'var(--text-2)',
            transition: 'all 0.15s',
          }}>
            <Icon size={13} /> {label}
            <span style={{
              fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '0 6px',
              background: tab === id ? 'var(--brand)25' : 'var(--bg-2)',
              color: tab === id ? 'var(--brand)' : 'var(--text-muted)',
            }}>
              {id === 'structured' ? rules.length : notes.length}
            </span>
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading rules…</div>}

      {/* ── STRUCTURED RULES TAB ── */}
      {!loading && tab === 'structured' && (
        <div>
          {/* Add Rule toggle button */}
          <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => { setShowRuleForm(p => !p); setRuleForm(emptyRule) }}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px' }}
            >
              <Plus size={13} /> {showRuleForm ? 'Cancel' : 'Add Rule'}
            </button>
          </div>

          {/* Inline Rule Builder — matches admin Departments.jsx pattern */}
          {showRuleForm && (
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 16, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>New Rule Setup</div>

              {/* Step 1: Rule type cards */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                {[
                  {
                    val: 'PRE_FILTER', icon: '🚦', label: 'Tender Pre-Filter',
                    desc: 'Filter on scraped tender metadata. Applied before qualification.',
                    effect: 'Discards tender or Accepts tender',
                    effectStyle: { background: '#fef3c7', color: '#b45309' },
                  },
                  {
                    val: 'QUAL_GATE', icon: '🔒', label: 'Qualification Gate',
                    desc: 'Filter on qualification score. Applied after scoring.',
                    effect: 'Suppresses or Sends an email',
                    effectStyle: { background: '#fef3c7', color: '#b45309' },
                  },
                ].map(ct => (
                  <div
                    key={ct.val}
                    onClick={() => setRuleForm({ ...ruleForm, type: ct.val, field: '' })}
                    style={{
                      flex: 1, border: `1px solid ${ruleForm.type === ct.val ? 'var(--brand)' : 'var(--border)'}`,
                      borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      background: ruleForm.type === ct.val ? 'var(--brand)12' : 'var(--card-bg)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{ct.icon} {ct.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>{ct.desc}</div>
                    <div style={{
                      display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 20, ...ct.effectStyle,
                    }}>{ct.effect}</div>
                  </div>
                ))}
              </div>

              {/* Step 2: Action selector (Discard / Accept) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Rule Action *</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {ACTION_OPTIONS.map(a => (
                    <button
                      key={a.value} type="button"
                      onClick={() => setRuleForm({ ...ruleForm, action: a.value })}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                        borderColor: ruleForm.action === a.value
                          ? (a.value === 'Discard' ? '#b91c1c' : '#16a34a')
                          : 'var(--border)',
                        background: ruleForm.action === a.value
                          ? (a.value === 'Discard' ? '#fee2e2' : '#dcfce7')
                          : 'var(--card-bg)',
                        color: ruleForm.action === a.value
                          ? (a.value === 'Discard' ? '#b91c1c' : '#15803d')
                          : 'var(--text-muted)',
                      }}
                    >
                      {a.value === 'Discard' ? '✕ Discard' : '✓ Accept'}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  <strong>Discard</strong> — tender is dropped when rule matches. <strong>Accept</strong> — tender is kept only when rule matches.
                </p>
              </div>

              {/* Step 3: Field / Operator / Value */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Field *</div>
                  <select
                    value={ruleForm.field}
                    onChange={e => setRuleForm({ ...ruleForm, field: e.target.value })}
                    style={selStyle}
                  >
                    <option value="">Select field…</option>
                    {(ruleForm.type === 'PRE_FILTER' ? PRE_FIELD_OPTIONS : GATE_FIELD_OPTIONS).map(f =>
                      <option key={f.value} value={f.value}>{f.label}</option>
                    )}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Operator *</div>
                  <select
                    value={ruleForm.operator}
                    onChange={e => setRuleForm({ ...ruleForm, operator: e.target.value })}
                    style={selStyle}
                  >
                    {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Value *</div>
                  <input
                    value={ruleForm.value}
                    onChange={e => setRuleForm({ ...ruleForm, value: e.target.value })}
                    placeholder="e.g. Government, 40, ELIGIBLE"
                    style={{ ...selStyle, width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* Live sentence preview */}
              {ruleForm.field && ruleForm.value && (
                <div style={{
                  marginBottom: 14, padding: '8px 12px', borderRadius: 8, fontSize: 12,
                  background: ruleForm.action === 'Discard' ? '#fee2e2' : '#dcfce7',
                  color: ruleForm.action === 'Discard' ? '#b91c1c' : '#15803d',
                  border: `1px solid ${ruleForm.action === 'Discard' ? '#fecaca' : '#bbf7d0'}`,
                  fontWeight: 500,
                }}>
                  <strong>{ruleForm.action}</strong> if{' '}
                  <strong>{criteriaFieldLabel(
                    ruleForm.type === 'PRE_FILTER' ? PRE_FIELD_OPTIONS : GATE_FIELD_OPTIONS,
                    ruleForm.field,
                  )}</strong>{' '}
                  {opLabel(ruleForm.operator)}{' '}
                  <strong>"{ruleForm.value}"</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={addRule}
                  disabled={saving || !ruleForm.field || !ruleForm.value.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ opacity: saving || !ruleForm.field || !ruleForm.value.trim() ? 0.55 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save Rule'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowRuleForm(false); setRuleForm(emptyRule) }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {rules.length === 0 && !showRuleForm && (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No rules defined yet. Click "Add Rule" to create one.
            </div>
          )}

          {/* Rules table — matches admin criteria table */}
          {rules.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)' }}>
                    {['TYPE', 'RULE', 'ACTION', 'EFFECT', 'ACTIVE', ''].map((h, i) => (
                      <th key={i} style={{
                        padding: '8px 12px', fontSize: 10, fontWeight: 700,
                        color: 'var(--text-muted)', textAlign: 'left', letterSpacing: '0.06em',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => {
                    const action = rule.Action || 'Discard'
                    const isPreFilter = rule.Criteria_Type === 'PRE_FILTER'
                    let effectLabel, effectBg, effectColor
                    if (isPreFilter) {
                      if (action === 'Discard') { effectLabel = 'Discard Tender'; effectBg = '#fee2e2'; effectColor = '#b91c1c' }
                      else { effectLabel = 'Accept Tender'; effectBg = '#dcfce7'; effectColor = '#15803d' }
                    } else {
                      if (action === 'Discard') { effectLabel = 'Suppress Email'; effectBg = '#fef3c7'; effectColor = '#b45309' }
                      else { effectLabel = 'Send Email'; effectBg = '#e0f2fe'; effectColor = '#0369a1' }
                    }
                    return (
                      <tr
                        key={rule.Criteria_ID}
                        style={{
                          borderBottom: idx < rules.length - 1 ? '1px solid var(--border)' : 'none',
                          opacity: rule.Is_Active ? 1 : 0.45,
                          background: 'var(--card-bg)',
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {/* Type badge */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                            background: isPreFilter ? '#eef2ff' : '#fef3c7',
                            color: isPreFilter ? '#4338ca' : '#b45309',
                            border: `1px solid ${isPreFilter ? '#c7d2fe' : '#fde68a'}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {isPreFilter ? 'Pre-Filter' : 'Qual. Gate'}
                          </span>
                        </td>

                        {/* Rule sentence */}
                        <td style={{ padding: '10px 12px', fontSize: 13 }}>
                          <strong>{ruleFieldLabel(rule)}</strong>
                          {' '}<span style={{ color: 'var(--text-muted)' }}>{opLabel(rule.Operator)}</span>{' '}
                          <strong>"{rule.Target_Value}"</strong>
                        </td>

                        {/* Action badge */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: action === 'Discard' ? '#fee2e2' : '#dcfce7',
                            color: action === 'Discard' ? '#b91c1c' : '#15803d',
                            border: `1px solid ${action === 'Discard' ? '#fecaca' : '#bbf7d0'}`,
                          }}>
                            {action}
                          </span>
                        </td>

                        {/* Effect badge */}
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: effectBg, color: effectColor,
                          }}>
                            {effectLabel}
                          </span>
                        </td>

                        {/* Active toggle */}
                        <td style={{ padding: '10px 12px' }}>
                          <button onClick={() => toggleRule(rule)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                            {rule.Is_Active
                              ? <ToggleRight size={20} style={{ color: 'var(--brand)' }} />
                              : <ToggleLeft size={20} style={{ color: 'var(--text-muted)' }} />}
                          </button>
                        </td>

                        {/* Remove */}
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            onClick={() => setConfirmPending({
                              type: 'rule', id: rule.Criteria_ID,
                              label: `${ruleFieldLabel(rule)} ${opLabel(rule.Operator)} "${rule.Target_Value}"`,
                            })}
                            className="btn btn-danger btn-sm"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CUSTOM NOTES TAB ── */}
      {!loading && tab === 'notes' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14, lineHeight: 1.6 }}>
            Write custom eligibility requirements in plain English. These are stored as reference notes
            and displayed alongside structured rules.
            <br />
            <em style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Example: "Successfully closed 4 large-scale projects in 3 months"
            </em>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNote()}
              placeholder="Type a custom requirement and press Enter…"
              style={{
                flex: 1, padding: '9px 14px', fontSize: 13,
                background: '#ffffff', border: '1px solid var(--border)',
                borderRadius: 8, color: 'var(--text)', outline: 'none',
              }}
            />
            <button onClick={addNote} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', fontSize: 12 }}>
              <Plus size={13} /> Add
            </button>
          </div>

          {notes.length === 0 && (
            <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No custom notes yet. Type a requirement above and press Enter.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {notes.map((note, i) => (
              <div key={note.Criteria_ID} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                background: '#ffffff', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              }}>
                <span style={{
                  minWidth: 20, height: 20, borderRadius: '50%',
                  background: 'var(--brand)', color: '#fff',
                  fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>{i + 1}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                  {note.Target_Value}
                </span>
                <button
                  onClick={() => setConfirmPending({ type: 'note', id: note.Criteria_ID, label: note.Target_Value })}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}
                >
                  <Trash2 size={13} style={{ color: 'var(--danger)' }} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirmPending && (
        <ConfirmDialog
          title={confirmPending.type === 'rule' ? 'Delete Rule?' : 'Delete Note?'}
          message={
            confirmPending.type === 'rule'
              ? `Remove the rule "${confirmPending.label}"? This cannot be undone.`
              : `Remove the note "${confirmPending.label.slice(0, 80)}${confirmPending.label.length > 80 ? '…' : ''}"? This cannot be undone.`
          }
          onConfirm={handleConfirm}
          onCancel={() => setConfirmPending(null)}
          danger
        />
      )}
    </div>
  )
}

const selStyle = {
  padding: '8px 10px', fontSize: 13, borderRadius: 6,
  background: '#ffffff', border: '1px solid var(--border)',
  color: 'var(--text)', cursor: 'pointer', outline: 'none', width: '100%',
}
