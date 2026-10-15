export default function Badge({ type = 'active', children }) {
  const classMap = {
    active: 'badge-active',
    inactive: 'badge-inactive',
    running: 'badge-running',
    eligible: 'badge-eligible',
    ineligible: 'badge-ineligible',
    conditional: 'badge-conditional',
    inherited: 'badge-inherited',
    warning: 'badge-warning',
  }

  return (
    <span className={`badge ${classMap[type] || 'badge-active'}`}>
      {children}
    </span>
  )
}
