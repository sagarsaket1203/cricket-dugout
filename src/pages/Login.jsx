import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/')
  }, [user])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)', position: 'relative', overflow: 'hidden'
    }}>
      {/* Background decoration */}
      <div style={{
        position: 'absolute', top: -200, right: -200,
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: -200, left: -200,
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,201,167,0.05) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* Floating cricket elements */}
      {['🏏', '🏟️', '⚾', '🎯', '🏆'].map((emoji, i) => (
        <div key={i} style={{
          position: 'absolute',
          fontSize: 28 + (i * 4),
          opacity: 0.06,
          top: `${15 + i * 18}%`,
          left: i % 2 === 0 ? `${5 + i * 3}%` : undefined,
          right: i % 2 !== 0 ? `${5 + i * 3}%` : undefined,
          transform: `rotate(${i * 15 - 30}deg)`,
          pointerEvents: 'none'
        }}>{emoji}</div>
      ))}

      <div className="fade-in" style={{ width: '100%', maxWidth: 420, padding: '0 20px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'linear-gradient(135deg, rgba(245,166,35,0.2), rgba(245,166,35,0.05))',
            border: '1px solid rgba(245,166,35,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 20px'
          }}>🏏</div>
          <h1 style={{ fontFamily: 'Rajdhani', fontSize: 42, fontWeight: 700, lineHeight: 1 }}>
            Cricket <span style={{ color: 'var(--gold)' }}>Dugout</span>
          </h1>
          <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 15 }}>
            IPL Fantasy League with your friends
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--navy2)', border: '1px solid var(--border)',
          borderRadius: 20, padding: 32
        }}>
          <h2 style={{ fontFamily: 'Rajdhani', fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Welcome back</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
            Sign in to access your league, join the auction, and track fantasy points.
          </p>

          <button
            onClick={signInWithGoogle}
            style={{
              width: '100%', padding: '14px 20px',
              background: '#fff', color: '#1a1a1a',
              border: 'none', borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: 'DM Sans, sans-serif'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f0f0f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ marginTop: 24, padding: 16, background: 'var(--navy3)', borderRadius: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              <div style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>How it works:</div>
              <div>🔨 Bid on IPL players in a live auction (₹120 Cr purse)</div>
              <div style={{ marginTop: 4 }}>📊 Earn fantasy points from real match performances</div>
              <div style={{ marginTop: 4 }}>🏆 Most points at end of IPL wins!</div>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--muted)' }}>
          Made for friends who love cricket 🏏
        </p>
      </div>
    </div>
  )
}
