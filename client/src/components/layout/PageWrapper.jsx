import Sidebar from './Sidebar'
import Header from './Header'

export default function PageWrapper({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <Header />
      <main className="main-content fade-in">
        {children}
      </main>
    </div>
  )
}
