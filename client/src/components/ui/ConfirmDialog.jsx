import { AlertTriangle } from 'lucide-react'
import Modal from './Modal'

export default function ConfirmDialog({ title, message, onConfirm, onCancel, danger = true, alertMode = false }) {
  return (
    <Modal
      title={title}
      onClose={onCancel || onConfirm}
      footer={
        alertMode ? (
          <button className="btn btn-primary" onClick={onConfirm}>OK</button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={onConfirm}
            >
              Confirm
            </button>
          </>
        )
      }
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <AlertTriangle size={20} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6 }}>{message}</p>
      </div>
    </Modal>
  )
}
