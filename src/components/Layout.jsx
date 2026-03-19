import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'sagarsaket120305@gmail.com'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⚡' },
  { to: '/auction', label: 'Auction', icon: '🔨' },
  { to: '/players', label: 'Players', icon: '🏏' },
  { to: '/matches', label: 'Matches', icon: '📊' },
  { to: '/trades', label: 'Trades', icon: '🔄' },
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [league, setLeague] = useState(null)
  const [member, setMember] = useState(null)
  const [releaseCount, setReleaseCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => { if (profile) loadLeague() }, [profile])

  async function loadLeague() {
    const { data } = await supabase
      .from('league_members').select('*, leagues(*)')
      .eq('user_id', profile.id).single()
    if (data) { setLeague(data.leagues); setMember(data) }
    if (profile.email === ADMIN_EMAIL) {
      const { data: releases } = await supabase
        .from('release_requests').select('id').eq('status', 'pending')
      setReleaseCount(releases?.length || 0)
    }
  }

  const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?'
  const isAdmin = profile?.email === ADMIN_EMAIL
  const purseLeft = member?.purse_remaining ?? 120
  const pursePct = (purseLeft / 120) * 100
  const purseColor = purseLeft < 20 ? 'var(--red)' : purseLeft < 40 ? 'var(--gold)' : 'var(--teal)'

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: league ? 14 : 0 }}>
          <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg, var(--gold), #E09400)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:'0 4px 16px rgba(240,165,0,0.3)', flexShrink:0 }}>🏏</div>
          <div>
            <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:20, color:'var(--text)', lineHeight:1.1 }}>Cricket</div>
            <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:20, color:'var(--gold)', lineHeight:1.1 }}>Dugout</div>
          </div>
        </div>
        {league && (
          <div style={{ padding:'8px 12px', background:'var(--navy3)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, marginBottom:2 }}>{league.name}</div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:10, color:'var(--text3)' }}>Code:</span>
              <span style={{ fontSize:13, color:'var(--gold)', fontWeight:700, letterSpacing:2, fontFamily:'Rajdhani' }}>{league.invite_code?.toUpperCase()}</span>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'12px', overflowY:'auto' }} className="no-scroll">
        <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, padding:'0 8px', marginBottom:8 }}>Menu</div>
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to==='/'} onClick={() => setMobileOpen(false)} style={({ isActive }) => ({
            display:'flex', alignItems:'center', gap:10,
            padding:'11px 12px', borderRadius:10, marginBottom:3,
            textDecoration:'none', fontSize:14, fontWeight:500,
            transition:'all 0.2s',
            background:isActive?'rgba(240,165,0,0.1)':'transparent',
            color:isActive?'var(--gold)':'var(--text2)',
            borderLeft:isActive?'2px solid var(--gold)':'2px solid transparent',
          })}>
            <span style={{ fontSize:18, width:22, textAlign:'center' }}>{icon}</span>
            {label}
          </NavLink>
        ))}
        {isAdmin && (
          <>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, padding:'12px 8px 8px' }}>Admin</div>
            <NavLink to="/admin" onClick={() => setMobileOpen(false)} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'11px 12px', borderRadius:10, marginBottom:3,
              textDecoration:'none', fontSize:14, fontWeight:500,
              transition:'all 0.2s', position:'relative',
              background:isActive?'rgba(240,165,0,0.1)':'transparent',
              color:isActive?'var(--gold)':'var(--text2)',
              borderLeft:isActive?'2px solid var(--gold)':'2px solid transparent',
            })}>
              <span style={{ fontSize:18, width:22, textAlign:'center' }}>⚙️</span>
              Admin Panel
              {releaseCount > 0 && (
                <span style={{ marginLeft:'auto', background:'var(--red)', color:'#fff', fontSize:10, fontWeight:700, width:18, height:18, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {releaseCount}
                </span>
              )}
            </NavLink>
          </>
        )}
      </nav>

      {/* Purse */}
      {member && (
        <div style={{ margin:'0 12px 12px', padding:'12px 16px', background:'var(--navy3)', borderRadius:12, border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600 }}>Your Purse</div>
            <div style={{ fontSize:10, color:'var(--text2)' }}>of ₹120 Cr</div>
          </div>
          <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:purseColor, lineHeight:1, marginBottom:7 }}>
            ₹{purseLeft} <span style={{ fontSize:13, fontWeight:500 }}>Cr</span>
          </div>
          <div style={{ background:'var(--navy5)', borderRadius:20, height:5, overflow:'hidden' }}>
            <div style={{ height:'100%', borderRadius:20, transition:'width 0.6s ease', width:`${pursePct}%`, background:purseColor, boxShadow:`0 0 8px ${purseColor}` }} />
          </div>
        </div>
      )}

      {/* Profile */}
      <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg, var(--teal), var(--gold))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--navy)', flexShrink:0, overflow:'hidden' }}>
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : initials}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.name}</div>
          {isAdmin && <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700 }}>ADMIN</div>}
        </div>
        <button onClick={signOut} style={{ background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', fontSize:14, padding:'6px 8px', cursor:'pointer', borderRadius:8 }}>↩</button>
      </div>
    </>
  )

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* Desktop sidebar */}
      <aside style={{
        width:230,
        background:'linear-gradient(180deg, #0A1220 0%, #060C18 100%)',
        borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column',
        position:'fixed', top:0, left:0, height:'100vh', zIndex:100,
        boxShadow:'4px 0 24px rgba(0,0,0,0.3)',
        transition:'transform 0.3s ease',
      }} className="desktop-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile header */}
      <header style={{
        display:'none', position:'fixed', top:0, left:0, right:0, zIndex:200,
        background:'rgba(6,12,24,0.95)', backdropFilter:'blur(20px)',
        borderBottom:'1px solid var(--border)', padding:'12px 16px',
        alignItems:'center', justifyContent:'space-between'
      }} className="mobile-header">
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg, var(--gold), #E09400)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🏏</div>
          <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:18, color:'var(--text)' }}>
            Cricket <span style={{ color:'var(--gold)' }}>Dugout</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {member && <div style={{ fontFamily:'Rajdhani', fontSize:15, fontWeight:700, color:purseColor }}>₹{purseLeft}Cr</div>}
          <button onClick={() => setMobileOpen(!mobileOpen)} style={{ background:'var(--navy3)', border:'1px solid var(--border)', color:'var(--text)', fontSize:20, padding:'6px 10px', cursor:'pointer', borderRadius:8 }}>
            {mobileOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:150 }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)' }} onClick={() => setMobileOpen(false)} />
          <div style={{ position:'absolute', top:0, left:0, bottom:0, width:280, background:'linear-gradient(180deg, #0A1220 0%, #060C18 100%)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <nav style={{
        display:'none', position:'fixed', bottom:0, left:0, right:0, zIndex:200,
        background:'rgba(6,12,24,0.97)', backdropFilter:'blur(20px)',
        borderTop:'1px solid var(--border)', padding:'8px 0 12px',
        justifyContent:'space-around', alignItems:'center'
      }} className="mobile-bottom-nav">
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} end={to==='/'} style={({ isActive }) => ({
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            textDecoration:'none', padding:'4px 12px', borderRadius:10,
            color:isActive?'var(--gold)':'var(--text3)', fontSize:10, fontWeight:600,
            transition:'all 0.15s', background:isActive?'rgba(240,165,0,0.08)':'transparent'
          })}>
            <span style={{ fontSize:22 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink to="/admin" style={({ isActive }) => ({
            display:'flex', flexDirection:'column', alignItems:'center', gap:3,
            textDecoration:'none', padding:'4px 12px', borderRadius:10,
            color:isActive?'var(--gold)':'var(--text3)', fontSize:10, fontWeight:600,
            transition:'all 0.15s', background:isActive?'rgba(240,165,0,0.08)':'transparent',
            position:'relative'
          })}>
            <span style={{ fontSize:22 }}>⚙️</span>
            Admin
            {releaseCount > 0 && <span style={{ position:'absolute', top:0, right:8, background:'var(--red)', color:'#fff', fontSize:9, fontWeight:700, width:14, height:14, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>{releaseCount}</span>}
          </NavLink>
        )}
      </nav>

      {/* Main content */}
      <main style={{ flex:1, minHeight:'100vh' }} className="main-content">
        <Outlet />
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (min-width: 769px) {
          .desktop-sidebar { display: flex !important; }
          .mobile-header { display: none !important; }
          .mobile-bottom-nav { display: none !important; }
          .main-content { margin-left: 230px; padding: 32px 36px; max-width: calc(100vw - 230px); }
        }

        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .mobile-header { display: flex !important; }
          .mobile-bottom-nav { display: flex !important; }
          .main-content { margin-left: 0 !important; padding: 80px 16px 90px !important; max-width: 100vw !important; }
        }
      `}</style>
    </div>
  )
}