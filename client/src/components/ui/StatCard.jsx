export default function StatCard({ label, value, sub, icon, iconBg }) {
  return (
    <div className="stat-card hover-lift">
      <div className="flex-between">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {sub && <div className="stat-sub">{sub}</div>}
        </div>
        {icon && (
          <div className="stat-icon" style={{ background: iconBg }}>
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
