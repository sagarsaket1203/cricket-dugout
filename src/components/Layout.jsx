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
]

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [league, setLeague] = useState(null)
  const [member, setMember] = useState(null)
  const [releaseCount, setReleaseCount] = useState(0)

  useEffect(() => {
    if (profile) loadLeague()
  }, [profile])

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

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240,
        background: 'linear-gradient(180deg, #0A1220 0%, #060C18 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, height: '100vh', zIndex: 100,
        boxShadow: '4px 0 24px rgba(0,0,0,0.3)'
      }}>

        {/* Logo */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom: league ? 14 : 0 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, var(--gold), #E09400)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, boxShadow: '0 4px 16px rgba(240,165,0,0.3)',
              flexShrink: 0
            }}>🏏</div>
            <div>
              <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:20, color:'var(--text)', lineHeight:1.1, letterSpacing:0.5 }}>Cricket</div>
              <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:20, color:'var(--gold)', lineHeight:1.1, letterSpacing:0.5 }}>Dugout</div>
            </div>
          </div>

          {league && (
            <div style={{ padding:'10px 12px', background:'var(--navy3)', borderRadius:10, border:'1px solid var(--border)' }}>
              <div style={{ fontSize:11, color:'var(--text2)', fontWeight:600, marginBottom:2 }}>{league.name}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:10, color:'var(--text3)' }}>Code:</span>
                <span style={{ fontSize:13, color:'var(--gold)', fontWeight:700, letterSpacing:2, fontFamily:'Rajdhani' }}>{league.invite_code?.toUpperCase()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'14px 12px', overflowY:'auto' }} className="no-scroll">
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, padding:'0 8px', marginBottom:8 }}>Menu</div>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to==='/'} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, marginBottom: 3,
              textDecoration: 'none', fontSize: 14, fontWeight: 500,
              transition: 'all 0.2s',
              background: isActive ? 'rgba(240,165,0,0.1)' : 'transparent',
              color: isActive ? 'var(--gold)' : 'var(--text2)',
              borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
            })}>
              <span style={{ fontSize:17, width:20, textAlign:'center' }}>{icon}</span>
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, padding:'12px 8px 8px' }}>Admin</div>
              <NavLink to="/admin" style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, marginBottom: 3,
                textDecoration: 'none', fontSize: 14, fontWeight: 500,
                transition: 'all 0.2s', position: 'relative',
                background: isActive ? 'rgba(240,165,0,0.1)' : 'transparent',
                color: isActive ? 'var(--gold)' : 'var(--text2)',
                borderLeft: isActive ? '2px solid var(--gold)' : '2px solid transparent',
              })}>
                <span style={{ fontSize:17, width:20, textAlign:'center' }}>⚙️</span>
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
          <div style={{ margin:'0 12px 12px', padding:'14px 16px', background:'var(--navy3)', borderRadius:12, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600 }}>Your Purse</div>
              <div style={{ fontSize:10, color:'var(--text2)' }}>of ₹120 Cr</div>
            </div>
            <div style={{ fontFamily:'Rajdhani', fontSize:26, fontWeight:700, color:purseColor, lineHeight:1, marginBottom:8 }}>
              ₹{purseLeft} <span style={{ fontSize:14, fontWeight:500 }}>Cr</span>
            </div>
            <div style={{ background:'var(--navy5)', borderRadius:20, height:5, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:20, transition:'width 0.6s ease, background 0.3s',
                width:`${pursePct}%`, background:purseColor,
                boxShadow:`0 0 8px ${purseColor}`
              }} />
            </div>
          </div>
        )}

        {/* Profile */}
        <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg, var(--teal), var(--gold))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'var(--navy)', flexShrink:0, overflow:'hidden', boxShadow:'0 0 12px rgba(240,165,0,0.2)' }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.name}</div>
            {isAdmin && <div style={{ fontSize:10, color:'var(--gold)', fontWeight:700, letterSpacing:'0.5px' }}>ADMIN</div>}
          </div>
          <button onClick={signOut} title="Sign out" style={{ background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', fontSize:14, padding:'6px 8px', cursor:'pointer', borderRadius:8, transition:'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background='var(--navy5)'; e.currentTarget.style.color='var(--red)' }}
            onMouseLeave={e => { e.currentTarget.style.background='var(--navy4)'; e.currentTarget.style.color='var(--text2)' }}>
            ↩
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, marginLeft:240, padding:'32px 36px', minHeight:'100vh', maxWidth:'calc(100vw - 240px)' }}>
        <Outlet />
      </main>
    </div>
  )
}