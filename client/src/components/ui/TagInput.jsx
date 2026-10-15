import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * TagInput - chip-based keyword entry with autocomplete suggestions.
 * Press Enter or comma to add a tag.
 *
 * Props:
 *   value:       [string, ...]
 *   onChange:    (newTags) => void
 *   placeholder: string
 *   suggestions: [string, ...] - optional list of existing keywords to suggest
 */
export default function TagInput({
  value = [],
  onChange,
  placeholder = 'Type and press Enter...',
  suggestions = [],
}) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef(null)

  const filtered = input.trim().length > 0
    ? suggestions.filter(
      s => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s)
    ).slice(0, 8)
    : []

  const addTag = (tag) => {
    const t = (tag || input).trim().replace(/,/g, '')
    if (t && !value.includes(t)) {
      onChange([...value, t])
    }
    setInput('')
    setShowSuggestions(false)
    setActiveIdx(-1)
  }

  const handleKeyDown = (e) => {
    if (showSuggestions && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); return }
      if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); addTag(filtered[activeIdx]); return }
      if (e.key === 'Escape') { setShowSuggestions(false); return }
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSuggestions(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const remove = (tag) => onChange(value.filter((t) => t !== tag))

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="tag-input-wrap" onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
        {value.map((tag) => (
          <span key={tag} className="chip">
            {tag}
            <span className="chip-remove" onClick={() => remove(tag)}>
              <X size={10} />
            </span>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); setActiveIdx(-1) }}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (input) setShowSuggestions(true) }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </div>

      {showSuggestions && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
          background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
          marginTop: 4, maxHeight: 200, overflowY: 'auto',
        }}>
          {filtered.map((s, i) => (
            <div
              key={s}
              onMouseDown={() => addTag(s)}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                background: i === activeIdx ? 'var(--brand-light, #eff2ff)' : 'transparent',
                color: i === activeIdx ? 'var(--brand, #4f6ef7)' : 'var(--text, #0f172a)',
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
