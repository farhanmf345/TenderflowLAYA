import { useState, useEffect } from 'react'
import { Plus, X, Search, Sparkles, Loader } from 'lucide-react'
import ConfirmDialog from '../../components/ui/ConfirmDialog'

const API = 'http://localhost:8000'

export default function DeptKeywordsTab({ deptId, keywords: init, onToast }) {
  const [mapped, setMapped] = useState(init || [])
  const [all, setAll] = useState([])
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(null) // { kid, kword }

  // AI suggestions state
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState([])

  useEffect(() => {
    if (!adding || all.length > 0) return
    fetch(`${API}/api/keywords/`).then(r => r.json()).then(setAll).catch(() => { })
  }, [adding])

  const available = all.filter(k =>
    !mapped.find(m => m.keyword?.Keyword_ID === k.Keyword_ID || m.Keyword_ID === k.Keyword_ID) &&
    k.Keyword.toLowerCase().includes(search.toLowerCase())
  )

  const add = async (k) => {
    const r = await fetch(`${API}/api/departments/${deptId}/keywords/${k.Keyword_ID}`, { method: 'POST' })
    if (!r.ok) return onToast('Failed to add keyword', 'error')
    setMapped(m => [...m, { Keyword_ID: k.Keyword_ID, keyword: k }])
    onToast(`"${k.Keyword}" added`, 'success')
  }

  const remove = async (kid, kword) => {
    await fetch(`${API}/api/departments/${deptId}/keywords/${kid}`, { method: 'DELETE' })
    setMapped(m => m.filter(x => (x.keyword?.Keyword_ID || x.Keyword_ID) !== kid))
    onToast(`"${kword}" removed`, 'success')
  }

  const handleConfirmRemove = async () => {
    if (!confirmRemove) return
    await remove(confirmRemove.kid, confirmRemove.kword)
    setConfirmRemove(null)
  }

  // ── AI Generation ─────────────────────────────────────────────────────────
  const generateAI = async () => {
    setGenerating(true)
    setSuggestions([])
    try {
      const r = await fetch(`${API}/api/departments/${deptId}/generate-keywords`, { method: 'POST' })
      if (!r.ok) { onToast('AI generation failed', 'error'); return }
      const data = await r.json()
      // Filter out keywords that are already mapped
      const mappedWords = mapped.map(m => (m.keyword?.Keyword || m.Keyword || '').toLowerCase())
      setSuggestions(data.filter(s => !mappedWords.includes(s.toLowerCase())))
      if (data.length === 0) onToast('No new suggestions generated', 'info')
    } catch {
      onToast('AI generation failed', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const addSuggestion = async (text) => {
    // 1. Upsert keyword (Sector_ID=1 as default; adjust if needed)
    const r = await fetch(`${API}/api/keywords/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Keyword: text, Sector_ID: 1 }),
    })
    if (!r.ok) { onToast('Failed to create keyword', 'error'); return }
    const kw = await r.json()
    // 2. Map to department
    await add(kw)
    // 3. Remove from suggestion chips
    setSuggestions(s => s.filter(sg => sg !== text))
  }

  const dismissSuggestion = (text) => setSuggestions(s => s.filter(sg => sg !== text))

  return (
    <div>
      {/* Current keywords */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, minHeight: 36 }}>
        {mapped.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No keywords yet.</div>}
        {mapped.map(m => {
          const k = m.keyword || m
          return (
            <span key={k.Keyword_ID} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 16, background: 'var(--brand)12', color: 'var(--brand)', border: '1px solid var(--brand)30' }}>
              {k.Keyword}
              <button onClick={() => setConfirmRemove({ kid: k.Keyword_ID, kword: k.Keyword })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                <X size={11} style={{ color: 'var(--brand)' }} />
              </button>
            </span>
          )
        })}
      </div>

      {/* Action buttons row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => setAdding(p => !p)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', background: adding ? '#f0f3f9' : 'var(--brand)', border: adding ? '1px solid var(--border)' : 'none', borderRadius: 8, color: adding ? 'var(--text-2)' : '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={13} /> {adding ? 'Close' : 'Add Keyword'}
        </button>

        <button
          onClick={generateAI}
          disabled={generating}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px',
            background: generating ? '#f0f3f9' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none', borderRadius: 8, color: generating ? 'var(--text-2)' : '#fff',
            fontSize: 12, fontWeight: 600, cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1, transition: 'all 0.15s',
          }}
        >
          {generating
            ? <><Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating…</>
            : <><Sparkles size={12} /> Generate from AI</>
          }
        </button>
      </div>

      {/* AI Suggestions */}
      {suggestions.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #c4b5fd', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            ✨ AI Suggestions — click to add
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map(s => (
              <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 16, background: '#fff', color: '#6d28d9', border: '1px solid #c4b5fd', cursor: 'pointer', transition: 'all 0.15s' }}>
                <span onClick={() => addSuggestion(s)} style={{ cursor: 'pointer' }}>+ {s}</span>
                <button onClick={() => dismissSuggestion(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', marginLeft: 2 }}>
                  <X size={10} style={{ color: '#a78bfa' }} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add keyword picker */}
      {adding && (
        <div style={{ background: '#ffffff', border: '1px solid var(--border)', borderRadius: 10, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Search size={13} style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search keywords…"
              style={{ flex: 1, padding: '5px 8px', fontSize: 12, background: '#f0f3f9', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
            {available.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No matching keywords.</div>}
            {available.map(k => (
              <button key={k.Keyword_ID} onClick={() => add(k)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: '#f0f3f9', border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer' }}>
                + {k.Keyword}
              </button>
            ))}
          </div>
        </div>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remove Keyword?"
          message={`Remove "${confirmRemove.kword}" from this department's keywords?`}
          onConfirm={handleConfirmRemove}
          onCancel={() => setConfirmRemove(null)}
          danger
        />
      )}
    </div>
  )
}
