import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

/**
 * MultiCombobox - searchable multiselect dropdown with chip display.
 *
 * Props:
 *   options:      [{ value, label }]
 *   value:        [value, ...]        (controlled)
 *   onChange:     (newValues) => void
 *   placeholder:  string
 *   readOnly:     bool               (show chips, no interaction)
 */
export default function MultiCombobox({
  options = [],
  value = [],
  onChange,
  placeholder = 'Select...',
  readOnly = false,
  disabled = false,
}) {
  const isReadOnly = readOnly || disabled
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(
    (o) =>
      !value.includes(o.value) &&
      o.label.toLowerCase().includes(search.toLowerCase())
  )

  const selected = options.filter((o) => value.includes(o.value))

  const toggle = (val) => {
    if (isReadOnly) return
    const next = value.includes(val)
      ? value.filter((v) => v !== val)
      : [...value, val]
    onChange(next)
  }

  const remove = (val, e) => {
    e.stopPropagation()
    if (isReadOnly) return
    onChange(value.filter((v) => v !== val))
  }

  return (
    <div className="mc-wrap" ref={wrapRef}>
      <div
        className={`mc-trigger${open ? ' open' : ''}`}
        style={isReadOnly ? { opacity: 0.65, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
        onClick={() => !isReadOnly && setOpen((o) => !o)}
      >
        {selected.length === 0 ? (
          <span className="mc-placeholder">{placeholder}</span>
        ) : (
          selected.map((o) => (
            <span key={o.value} className="chip">
              {o.label}
              {!isReadOnly && (
                <span className="chip-remove" onClick={(e) => remove(o.value, e)}>
                  <X size={10} />
                </span>
              )}
            </span>
          ))
        )}
        {!isReadOnly && (
          <ChevronDown
            size={13}
            style={{
              marginLeft: 'auto',
              flexShrink: 0,
              color: 'var(--text-muted)',
              transform: open ? 'rotate(180deg)' : '',
              transition: 'transform 0.18s ease',
            }}
          />
        )}
      </div>

      {open && !isReadOnly && (
        <div className="mc-dropdown">
          <div className="mc-search">
            <input
              autoFocus
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="mc-list">
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                No options found
              </div>
            ) : (
              filtered.map((o) => (
                <div
                  key={o.value}
                  className="mc-option"
                  onClick={() => toggle(o.value)}
                >
                  <input type="checkbox" readOnly checked={value.includes(o.value)} />
                  {o.label}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
