/**
 * Slim animated bar shown at the top of a section while data is refreshing.
 * Disappears after 1 second (controlled by useStaleData's isRefreshing).
 */
export default function RefreshBar({ visible }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0,
      height: 2,
      borderRadius: '2px 2px 0 0',
      overflow: 'hidden',
      zIndex: 10,
    }}>
      <div style={{
        height: '100%',
        background: 'linear-gradient(90deg, transparent, #4f6ef7, transparent)',
        animation: 'refreshSlide 1s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes refreshSlide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  )
}
