import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

export default function Modal({ title, onClose, children, footer, size = '' }) {
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-box${size === 'lg' ? ' modal-lg' : ''} scale-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
