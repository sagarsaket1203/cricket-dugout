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

  useEffect(() => {
    if (profile) loadLeague()
  }, [profile])

  async function loadLeague() {
    const { data: memberData } = await supabase
      .from('league_members')
      .select('*, leagues(*)')
      .eq('user_id', profile.id)
      .single()
    if (memberData) {
      setLeague(memberData.leagues)
      setMember(memberData)
    }
  }

  const initials = profile?.name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?'
  const isAdmin = profile?.email === ADMIN_EMAIL

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width:220, background:'#0A1220', borderRight:'1px solid var(--border)',
        display:'flex', flexDirection:'column', padding:'20px 0', flexShrink:0,
        position:'fixed', top:0, left:0, height:'100vh', zIndex:100
      }}>
        {/* Logo */}
        <div style={{ padding:'0 20px 24px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'var(--gold)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏏</div>
            <div>
              <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:18, color:'var(--text)', lineHeight:1.1 }}>Cricket</div>
              <div style={{ fontFamily:'Rajdhani', fontWeight:700, fontSize:18, color:'var(--gold)', lineHeight:1.1 }}>Dugout</div>
            </div>
          </div>
          {league && (
            <div style={{ marginTop:12, padding:'6px 10px', background:'var(--navy3)', borderRadius:8, fontSize:11, color:'var(--muted)' }}>
              <div style={{ color:'var(--text2)', fontWeight:500, fontSize:12 }}>{league.name}</div>
              <div>Code: <span style={{ color:'var(--gold)', fontWeight:600 }}>{league.invite_code}</span></div>
            </div>
          )}
        </div>

        {/* Nav Links */}
        <nav style={{ flex:1, padding:'16px 12px' }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 12px', borderRadius:10, marginBottom:4,
              textDecoration:'none', fontSize:14, fontWeight:500,
              transition:'all 0.15s',
              background:isActive ? 'rgba(245,166,35,0.12)' : 'transparent',
              color:isActive ? 'var(--gold)' : 'var(--text2)',
              borderLeft:isActive ? '3px solid var(--gold)' : '3px solid transparent',
            })}>
              <span style={{ fontSize:16 }}>{icon}</span>
              {label}
            </NavLink>
          ))}

          {/* Admin only visible to your email */}
          {isAdmin && (
            <NavLink to="/admin" style={({ isActive }) => ({
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 12px', borderRadius:10, marginBottom:4,
              textDecoration:'none', fontSize:14, fontWeight:500,
              transition:'all 0.15s',
              background:isActive ? 'rgba(245,166,35,0.12)' : 'transparent',
              color:isActive ? 'var(--gold)' : 'var(--text2)',
              borderLeft:isActive ? '3px solid var(--gold)' : '3px solid transparent',
            })}>
              <span style={{ fontSize:16 }}>⚙️</span>
              Admin
            </NavLink>
          )}
        </nav>

        {/* Purse */}
        {member && (
          <div style={{ padding:'12px 16px', margin:'0 12px', background:'var(--navy3)', borderRadius:10, marginBottom:12, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:4 }}>Your Purse</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:member.purse_remaining < 20 ? 'var(--red)' : member.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)' }}>
              ₹{member.purse_remaining} Cr
            </div>
            <div style={{ marginTop:6, background:'var(--navy4)', borderRadius:20, height:5, overflow:'hidden' }}>
              <div style={{
                height:'100%', borderRadius:20, transition:'width 0.4s',
                width:`${(member.purse_remaining / 120) * 100}%`,
                background:member.purse_remaining < 20 ? 'var(--red)' : member.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)'
              }} />
            </div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>of ₹120 Cr total</div>
          </div>
        )}

        {/* Profile */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg, var(--teal), var(--gold))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--navy)', flexShrink:0, overflow:'hidden' }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
              : initials}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{profile?.name}</div>
            {isAdmin && <div style={{ fontSize:10, color:'var(--gold)', fontWeight:600 }}>ADMIN</div>}
          </div>
          <button onClick={signOut} title="Sign out" style={{ background:'none', border:'none', color:'var(--muted)', fontSize:16, padding:4, cursor:'pointer' }}>↩</button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex:1, marginLeft:220, padding:'28px 32px', minHeight:'100vh' }}>
        <Outlet />
      </main>
    </div>
  )
}