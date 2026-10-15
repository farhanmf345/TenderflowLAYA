import { Loader2 } from 'lucide-react'

export default function Spinner({ size = 24, className = '', text = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-muted ${className}`}>
      <Loader2 size={size} className="spinner-anim" />
      {text && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{text}</span>}
    </div>
  )
}
