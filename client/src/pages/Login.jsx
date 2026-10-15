import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { loginRequest } from '../lib/authConfig'
import sysforeLogo from '../../assets/Sysfore-logo-dark.png'


export default function Login() {
  const { instance } = useMsal()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      // Opens the real Microsoft login popup
      await instance.loginPopup(loginRequest)
      navigate('/dashboard')
    } catch (err) {
      // User closed popup or login failed - don't crash
      if (err?.errorCode !== 'user_cancelled') {
        setError('Sign-in failed. Please try again.')
        console.error('[MSAL]', err)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div className="login-shell" style={{ width: 400, maxWidth: '100%', padding: '0 16px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src={sysforeLogo}
            alt="Sysfore Technologies"
            style={{ height: 36, margin: '0 auto 16px' }}
          />
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            AI-Powered Tender Intelligence Agent
          </p>
        </div>

        {/* Card */}
        <div className="card">
          <h2 style={{
            fontSize: 16, fontWeight: 700,
            textAlign: 'center', marginBottom: 8, color: 'var(--text)',
          }}>
            Welcome Back
          </h2>
          <p style={{
            fontSize: 13, color: 'var(--text-2)',
            textAlign: 'center', marginBottom: 28, lineHeight: 1.6,
          }}>
            Sign in securely using your organisation's
            Microsoft Azure Active Directory account.
          </p>

          {/* Error message */}
          {error && (
            <div style={{
              background: 'var(--danger-bg)', border: '1px solid var(--danger)',
              borderRadius: 6, padding: '8px 12px', marginBottom: 16,
              fontSize: 13, color: 'var(--danger)', textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          {/* Sign in with Microsoft button */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn w-full"
            style={{
              justifyContent: 'center',
              background: '#fff',
              color: '#333',
              border: '1px solid var(--border)',
              padding: '11px 16px',
              fontSize: 14,
              fontWeight: 600,
              boxShadow: 'var(--shadow-sm)',
              gap: 12,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? (
              <>
                <span className="spinner" style={{ width: 18, height: 18 }} />
                Connecting to Microsoft…
              </>
            ) : (
              <>
                {/* Microsoft logo */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 21 21">
                  <path fill="#f25022" d="M1 1h9v9H1z" />
                  <path fill="#7fba00" d="M11 1h9v9h-9z" />
                  <path fill="#00a4ef" d="M1 11h9v9H1z" />
                  <path fill="#ffb900" d="M11 11h9v9h-9z" />
                </svg>
                Sign in with Microsoft
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center', marginTop: 24,
          fontSize: 12, color: 'var(--text-muted)',
        }}>
          Tender<span style={{ color: 'var(--brand)', fontWeight: 700 }}>Flow</span> v4.0
        </p>
      </div>
    </div>
  )
}
