import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { user, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  useEffect(() => { if (user) navigate('/') }, [user])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--navy)', position: 'relative', overflow: 'hidden'
    }}>
      {/* Background effects */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        <div style={{ position:'absolute', top:'-20%', left:'-10%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)' }} />
        <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle, rgba(0,212,170,0.05) 0%, transparent 70%)' }} />
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:1000, height:1000, borderRadius:'50%', background:'radial-gradient(circle, rgba(240,165,0,0.02) 0%, transparent 60%)' }} />
        {/* Grid pattern */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize:'60px 60px' }} />
      </div>

      <div className="fade-up" style={{ width:'100%', maxWidth:440, padding:'0 20px', position:'relative', zIndex:1 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{
            width:80, height:80, borderRadius:22,
            background:'linear-gradient(135deg, rgba(240,165,0,0.2), rgba(240,165,0,0.05))',
            border:'1px solid rgba(240,165,0,0.3)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:40, margin:'0 auto 24px',
            boxShadow:'0 8px 32px rgba(240,165,0,0.15)',
            animation:'glow 3s ease infinite'
          }}>🏏</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:48, fontWeight:700, lineHeight:1, letterSpacing:1 }}>
            Cricket <span style={{ color:'var(--gold)', textShadow:'0 0 30px rgba(240,165,0,0.4)' }}>Dugout</span>
          </h1>
          <p style={{ color:'var(--text2)', marginTop:10, fontSize:15, fontWeight:400 }}>
            IPL Fantasy League for you and your friends
          </p>
        </div>

        {/* Card */}
        <div style={{
          background:'rgba(12,21,36,0.9)',
          border:'1px solid var(--border2)',
          borderRadius:20, padding:36,
          backdropFilter:'blur(20px)',
          boxShadow:'0 24px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}>
          <div style={{ marginBottom:28 }}>
            <h2 style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:600, marginBottom:6 }}>Welcome back 👋</h2>
            <p style={{ color:'var(--text2)', fontSize:14, lineHeight:1.6 }}>
              Sign in to access your league, join the live auction, and track your fantasy points.
            </p>
          </div>

          <button onClick={signInWithGoogle} style={{
            width:'100%', padding:'14px 20px',
            background:'#fff', color:'#1a1a1a',
            border:'none', borderRadius:12,
            display:'flex', alignItems:'center', justifyContent:'center', gap:12,
            fontSize:15, fontWeight:600, cursor:'pointer',
            transition:'all 0.2s', fontFamily:'Plus Jakarta Sans, sans-serif',
            boxShadow:'0 4px 16px rgba(0,0,0,0.2)'
          }}
            onMouseEnter={e => { e.currentTarget.style.background='#f5f5f5'; e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.background='#fff'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.2)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ margin:'24px 0', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
            <span style={{ fontSize:12, color:'var(--text3)', fontWeight:500 }}>HOW IT WORKS</span>
            <div style={{ flex:1, height:1, background:'var(--border)' }} />
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { icon:'🔨', title:'Live Auction', desc:'Bid on IPL players with ₹120 Cr purse' },
              { icon:'📊', title:'Real Points', desc:'Auto-calculated from actual match data' },
              { icon:'🏆', title:'Win the League', desc:'Most points at end of IPL season wins' },
            ].map((f, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--navy3)', borderRadius:10, border:'1px solid var(--border)' }}>
                <span style={{ fontSize:20 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{f.title}</div>
                  <div style={{ fontSize:12, color:'var(--text2)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ textAlign:'center', marginTop:20, fontSize:12, color:'var(--text3)' }}>
          Made with ❤️ for cricket lovers
        </p>
      </div>
    </div>
  )
}