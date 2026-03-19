import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function signInWithGoogle() {
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
          skipBrowserRedirect: false,
        }
      })
      if (error) setError(error.message)
    } catch (e) {
      setError('Login failed. Please try again.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #060C18 0%, #0A1628 50%, #060C18 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, position: 'relative', overflow: 'hidden'
    }}>
      {/* Background effects */}
      <div style={{ position:'absolute', top:'20%', left:'50%', transform:'translateX(-50%)', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle, rgba(240,165,0,0.04) 0%, transparent 70%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:'10%', right:'10%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(0,212,170,0.04) 0%, transparent 70%)', pointerEvents:'none' }} />

      <div style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ width:72, height:72, borderRadius:20, background:'linear-gradient(135deg, #F0A500, #E09400)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 20px', boxShadow:'0 8px 32px rgba(240,165,0,0.3)' }}>
            🏏
          </div>
          <h1 style={{ fontFamily:'Rajdhani, sans-serif', fontSize:36, fontWeight:700, color:'#F5F5F5', marginBottom:4, lineHeight:1.1 }}>
            Cricket Dugout
          </h1>
          <div style={{ color:'#F0A500', fontSize:14, fontWeight:600, letterSpacing:2, textTransform:'uppercase' }}>
            IPL Fantasy 2026
          </div>
        </div>

        {/* Card */}
        <div style={{ background:'rgba(10,22,40,0.8)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:24, padding:32, backdropFilter:'blur(20px)', boxShadow:'0 24px 64px rgba(0,0,0,0.5)' }}>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:22, fontFamily:'Rajdhani, sans-serif', fontWeight:700, color:'#F5F5F5', marginBottom:8 }}>
              Welcome back 👋
            </div>
            <div style={{ fontSize:14, color:'rgba(245,245,245,0.5)', lineHeight:1.6 }}>
              Sign in to manage your IPL fantasy team, join auctions and compete with friends
            </div>
          </div>

          {error && (
            <div style={{ padding:'12px 16px', background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:12, marginBottom:16, color:'#FF4757', fontSize:13, textAlign:'center' }}>
              {error}
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            disabled={loading}
            style={{
              width: '100%', padding: '14px 20px',
              background: loading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 14, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              transition: 'all 0.2s', marginBottom: 16,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.transform = 'translateY(-1px)' }}}
            onMouseLeave={e => { e.currentTarget.style.background = loading ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {loading ? (
              <>
                <div style={{ width:20, height:20, border:'2px solid rgba(0,0,0,0.2)', borderTop:'2px solid #000', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
                <span style={{ fontSize:15, fontWeight:600, color:'#333' }}>Signing in...</span>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span style={{ fontSize:15, fontWeight:600, color:'#333' }}>Continue with Google</span>
              </>
            )}
          </button>

          <div style={{ textAlign:'center', fontSize:12, color:'rgba(245,245,245,0.3)', lineHeight:1.6 }}>
            By signing in you agree to our terms.<br />
            Your data is kept private and secure.
          </div>
        </div>

        {/* Features */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:20 }}>
          {[
            { icon:'🔨', label:'Live Auction' },
            { icon:'🏏', label:'Fantasy Points' },
            { icon:'🏆', label:'Leaderboard' },
          ].map((f, i) => (
            <div key={i} style={{ textAlign:'center', padding:'12px 8px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12 }}>
              <div style={{ fontSize:22, marginBottom:4 }}>{f.icon}</div>
              <div style={{ fontSize:11, color:'rgba(245,245,245,0.4)', fontWeight:500 }}>{f.label}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
