import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CompanyProfile from './pages/CompanyProfile'
import Departments from './pages/Departments'
import ScraperConfig from './pages/ScraperConfig'
import TenderBrowser from './pages/TenderBrowser'
import AppSettings from './pages/AppSettings'
import TokenUsage from './pages/TokenUsage'
import ManagerLayout from './pages/TenderManager/ManagerLayout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/company-profile" element={<CompanyProfile />} />
        <Route path="/departments" element={<Departments />} />
        <Route path="/scraper-config" element={<ScraperConfig />} />
        <Route path="/tenders" element={<TenderBrowser />} />
        <Route path="/settings" element={<AppSettings />} />
        <Route path="/token-usage" element={<TokenUsage />} />
        {/* Manager Portal — direct URL access, no auth required */}
        <Route path="/TenderManager/*" element={<ManagerLayout />} />
      </Routes>
    </BrowserRouter>
  )
}
