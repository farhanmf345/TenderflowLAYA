import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import PageWrapper from '../components/layout/PageWrapper'
import { useTheme } from '../lib/hooks/useTheme'
import api from '../lib/api'
import ConfirmDialog from '../components/ui/ConfirmDialog'

const ABOUT_ROWS = [
  { label: 'Version', value: 'TenderFlow v4.0' },
  { label: 'Build', value: '2026-04-16' },
  { label: 'Backend', value: 'FastAPI + SQLAlchemy' },
  { label: 'AI Engine', value: 'Gemini 2.5 Pro + Gemini 2.5 Flash' },
  { label: 'Relational DB', value: 'Azure PostgreSQL' },
  { label: 'Vector DB', value: 'ChromaDB' },
]

export default function AppSettings() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const [emailFrom, setEmailFrom] = useState('TenderFlow Alerts')
  const [replyTo, setReplyTo] = useState('')

  const [testEmail, setTestEmail] = useState('')
  const [saved, setSaved] = useState(false)
  const [alertData, setAlertData] = useState(null)

  useEffect(() => {
    api.get('/settings/').then(res => {
      if (res.data?.email_from_name) setEmailFrom(res.data.email_from_name)
      if (res.data?.reply_to != null) setReplyTo(res.data.reply_to)
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!emailFrom.trim()) return
    try {
      await api.put('/settings/', {
        email_from_name: emailFrom.trim(),
        reply_to: replyTo.trim(),
        theme,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setAlertData({ title: 'Error', message: 'Failed to save settings.' })
    }
  }

  return (
    <PageWrapper>
      {/* ── Page Header ──────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div className="page-title">App Settings</div>
        <div className="page-sub">
          Platform-level preferences - scraper parameters have moved to{' '}
          <a
            href="/scraper-config"
            onClick={e => { e.preventDefault(); navigate('/scraper-config') }}
            style={{ color: 'var(--brand)' }}
          >
            Extraction Agents
          </a>
        </div>
      </div>

      {/* ── Two-column grid ──────────────────────────────── */}
      <div className="grid-2" style={{ alignItems: 'start' }}>

        {/* ── LEFT COLUMN ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Display & Theme */}
          <div className="card">
            <div className="section-title">Display &amp; Theme</div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '10px 0',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Theme</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>
                  Switch between light and dark mode. Also togglable from the header icon.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Light</span>
                {/* Pill toggle switch */}
                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={theme === 'dark'}
                    onChange={toggleTheme}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                  />
                  <span style={{
                    position: 'absolute', inset: 0,
                    background: theme === 'dark' ? 'var(--brand)' : '#cbd5e1',
                    borderRadius: 22,
                    transition: 'background .2s',
                  }} />
                  <span style={{
                    position: 'absolute',
                    top: 3, left: theme === 'dark' ? 21 : 3,
                    width: 16, height: 16,
                    background: '#fff',
                    borderRadius: '50%',
                    boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                    transition: 'left .2s',
                  }} />
                </label>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Dark</span>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="card">
            <div className="section-title">Notification Settings</div>

            {/* Email From Name */}
            <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Email From Name
              </div>
              <input
                className="form-input"
                value={emailFrom}
                onChange={e => setEmailFrom(e.target.value)}
                style={{ marginTop: 6 }}
              />
            </div>



            {/* Send Test Email */}
            <div style={{ padding: '14px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                Send test email
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input
                  className="form-input"
                  type="email"
                  placeholder="your@email.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    if (!testEmail) return
                    try {
                      await api.post('/settings/test-email', { email: testEmail })
                      setAlertData({ title: 'Success', message: 'Test email sent successfully! Check your inbox.' })
                    } catch (err) {
                      setAlertData({ title: 'Error', message: 'Failed to send test email. Check backend logs.' })
                    }
                  }}
                  disabled={!testEmail}
                >
                  Send Test
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary btn-sm"
              style={!emailFrom.trim() ? { marginTop: 8, opacity: 0.5, cursor: 'not-allowed' } : { marginTop: 8 }}
              onClick={handleSave}
              disabled={!emailFrom.trim()}
            >
              {saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>


          {/* About */}
          <div className="card">
            <div className="section-title">About</div>
            <table>
              <tbody>
                {ABOUT_ROWS.map(({ label, value }) => (
                  <tr key={label}>
                    <td style={{ color: 'var(--text-muted)', paddingLeft: 0, width: '40%' }}>{label}</td>
                    <td style={{ paddingLeft: 0 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Alert Dialog */}
      {alertData && (
        <ConfirmDialog
          title={alertData.title}
          message={alertData.message}
          onConfirm={() => setAlertData(null)}
          alertMode={true}
        />
      )}
    </PageWrapper>
  )
}
