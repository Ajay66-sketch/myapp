// client/src/components/AuthModal.tsx
import { useState } from 'react'
import { useStore } from '../store/useStore'

export function AuthModal() {
  const { login, register, authLoading, authError } = useStore()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [err, setErr] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setSuccessMsg('')

    if (isLogin) {
      if (!email || !password) return setErr('Please fill in all fields')
      try {
        await login({ email, password })
        setSuccessMsg('Welcome back! Logging in...')
        const { postHogAnalytics } = await import('../analytics/postHogAnalytics')
        postHogAnalytics.track('user_logged_in', { email })
      } catch (e: any) {
        setErr(e.message || 'Invalid email or password')
      }
    } else {
      if (!email || !password || !name) return setErr('Please fill in all fields')
      try {
        await register({ name, email, password })
        setSuccessMsg('Account created successfully!')
        const { postHogAnalytics } = await import('../analytics/postHogAnalytics')
        postHogAnalytics.track('user_signed_up', { name, email })
      } catch (e: any) {
        setErr(e.message || 'Registration failed')
      }
    }
  }

  // Simulated Mock Google Login
  const handleMockGoogleLogin = async () => {
    setErr('')
    try {
      const mockCredential = JSON.stringify({
        sub: 'mock_google_id_' + Math.floor(Math.random() * 10000),
        email: email || 'student@university.edu',
        name: name || 'Google Academic Student',
        picture: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      })
      
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: btoa(mockCredential) }),
      })

      if (response.ok) {
        const data = await response.json()
        const store = useStore.getState()
        store.login({ email: data.user.email, password: 'password123' }).catch(async () => {
          // If login fails, save manually
          const { setAccessToken } = await import('../api/apiService')
          setAccessToken(data.accessToken)
          useStore.setState({
            user: data.user,
            accessToken: data.accessToken,
            isAuthenticated: true,
          })
          store.setupSocketListeners()
          store.fetchNotifications()
          store.fetchLeaderboards()
        })
        setSuccessMsg('Google authentication successful!')
        const { postHogAnalytics } = await import('../analytics/postHogAnalytics')
        postHogAnalytics.track('google_auth_success', { email: data.user.email })
      } else {
        setErr('Mock Google authentication failed')
      }
    } catch (e) {
      setErr('Google connection error')
    }
  }

  return (
    <div className="auth-card glass-panel">
      <div className="auth-header">
        <h2 className="gradient-text">{isLogin ? 'Welcome Back Study Buddy' : 'Create Productivity Account'}</h2>
        <p className="auth-subtitle">Sync timers, unlock AI context tutoring, and level up with friends!</p>
      </div>

      <div className="tab-row">
        <button
          className={`tab-btn ${isLogin ? 'active' : ''}`}
          onClick={() => { setIsLogin(true); setErr(''); }}
        >
          Login
        </button>
        <button
          className={`tab-btn ${!isLogin ? 'active' : ''}`}
          onClick={() => { setIsLogin(false); setErr(''); }}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="auth-form">
        {!isLogin && (
          <div className="form-group">
            <label>Academic Name / Username</label>
            <input
              type="text"
              placeholder="e.g. Marie Curie"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        )}

        <div className="form-group">
          <label>Academic Email</label>
          <input
            type="email"
            placeholder="student@university.edu"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label>Secure Password</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {err && <div className="auth-error-banner">{err}</div>}
        {authError && <div className="auth-error-banner">{authError}</div>}
        {successMsg && <div className="auth-success-banner">{successMsg}</div>}

        <button type="submit" className="btn btn-primary btn-block" disabled={authLoading}>
          {authLoading ? (
            <div className="spinner"></div>
          ) : isLogin ? (
            'Log In to Dashboard'
          ) : (
            'Create Account & Start Focusing'
          )}
        </button>
      </form>

      <div className="auth-divider">
        <span>OR CONTINUE WITH</span>
      </div>

      <button onClick={handleMockGoogleLogin} className="btn btn-secondary btn-block btn-google">
        <svg viewBox="0 0 24 24" width="20" height="20" className="google-icon">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        Sign in with Google Academic
      </button>
    </div>
  )
}
