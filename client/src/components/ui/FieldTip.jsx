/** Concise inline help — hover the ? icon for field guidance. */
export default function FieldTip({ text }) {
  if (!text) return null
  return (
    <span
      title={text}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 14,
        height: 14,
        marginLeft: 5,
        borderRadius: '50%',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
        fontSize: 9,
        fontWeight: 700,
        cursor: 'help',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
    >
      ?
    </span>
  )
}
