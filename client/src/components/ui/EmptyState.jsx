import { FolderOpen } from 'lucide-react'

export default function EmptyState({ message = 'No data found', icon: Icon = FolderOpen }) {
  return (
    <div className="empty-state">
      <Icon size={40} />
      <p>{message}</p>
    </div>
  )
}
