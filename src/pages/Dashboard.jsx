import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Dashboard() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [league, setLeague] = useState(null)
  const [myStats, setMyStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [noLeague, setNoLeague] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')

  useEffect(() => { if (profile) loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    const { data: memberData } = await supabase
      .from('league_members').select('*, leagues(*), profiles(*)')
      .eq('user_id', profile.id).single()
    if (!memberData) { setNoLeague(true); setLoading(false); return }
    setLeague(memberData.leagues)
    const { data: allMembers } = await supabase
      .from('league_members').select('*, profiles(*)')
      .eq('league_id', memberData.league_id)
    const { data: pointsData } = await supabase
      .from('match_points').select('*')
      .eq('league_id', memberData.league_id)
    const pointsMap = {}
    pointsData?.forEach(p => { pointsMap[p.user_id] = (pointsMap[p.user_id] || 0) + p.total_points })
    const enriched = (allMembers || []).map(m => ({
      ...m, total_points: pointsMap[m.user_id] || 0
    })).sort((a, b) => b.total_points - a.total_points)
    setMembers(enriched)
    setMyStats(enriched.find(m => m.user_id === profile.id))
    setLoading(false)
  }

  async function joinLeague() {
    if (!joinCode.trim()) return
    setJoining(true); setJoinError('')
    const { data: lg } = await supabase.from('leagues').select('*').eq('invite_code', joinCode.trim().toLowerCase()).single()
    if (!lg) { setJoinError('Invalid invite code!'); setJoining(false); return }
    const { error } = await supabase.from('league_members').insert({ league_id: lg.id, user_id: profile.id, purse_remaining: lg.purse_limit || 120, is_admin: false })
    if (error) { setJoinError('Could not join. Already in this league?'); setJoining(false); return }
    setNoLeague(false); loadData(); setJoining(false)
  }

  const myRank = members.findIndex(m => m.user_id === profile?.id) + 1
  const leader = members[0]
  const rankColors = ['#FFD700', '#C0C0C0', '#CD7F32']

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading your league...</div>
    </div>
  )

  if (noLeague) return (
    <div className="fade-up" style={{ maxWidth:480, margin:'60px auto', textAlign:'center' }}>
      <div style={{ fontSize:64, marginBottom:20 }}>🏟️</div>
      <h2 style={{ fontFamily:'Rajdhani', fontSize:32, fontWeight:700, marginBottom:8 }}>You're not in a league yet</h2>
      <p style={{ color:'var(--text2)', marginBottom:32, lineHeight:1.6 }}>Join your friends' league with an invite code, or create one in the Admin panel.</p>
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:20, padding:28 }}>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:12, fontWeight:500 }}>Enter invite code from your friend:</div>
        <input className="input" placeholder="e.g. A3F9BC12" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ marginBottom:12, textAlign:'center', fontSize:16, letterSpacing:2, fontFamily:'Rajdhani', fontWeight:700 }} />
        {joinError && <div style={{ color:'var(--red)', fontSize:13, marginBottom:12, padding:'8px 12px', background:'var(--red2)', borderRadius:8 }}>{joinError}</div>}
        <button className="btn btn-primary" style={{ width:'100%', padding:14 }} onClick={joinLeague} disabled={joining}>
          {joining ? 'Joining...' : '🏏 Join League'}
        </button>
        <div style={{ marginTop:16, fontSize:13, color:'var(--text3)' }}>
          Creating a league? Go to <a href="/admin" style={{ color:'var(--gold)', fontWeight:600 }}>Admin panel</a>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:32 }}>
        <div>
          <div style={{ fontSize:12, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:6 }}>IPL 2026 Fantasy</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:36, fontWeight:700, letterSpacing:0.5 }}>
            {league?.name}
          </h1>
          <div style={{ color:'var(--text2)', fontSize:14, marginTop:4, display:'flex', alignItems:'center', gap:8 }}>
            <span>{members.length} friends competing</span>
            <span style={{ color:'var(--border2)' }}>·</span>
            <span>₹120 Cr purse each</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:20, padding:'7px 14px' }}>
            <div className="live-dot" />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', letterSpacing:1 }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="fade-up-1" style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:28 }}>
        {[
          { label:'Your Points', value:myStats?.total_points?.toLocaleString() || '0', tag:`Rank #${myRank} of ${members.length}`, color:'var(--gold)', accent:'rgba(240,165,0,0.08)', border:'rgba(240,165,0,0.2)' },
          { label:'Your Rank', value:`#${myRank}`, tag:`of ${members.length} friends`, color:'var(--teal)', accent:'rgba(0,212,170,0.06)', border:'rgba(0,212,170,0.2)' },
          { label:'Gap to Leader', value:myRank===1?'👑':((leader?.total_points||0)-(myStats?.total_points||0)).toLocaleString(), tag:myRank===1?"You're leading!":`pts behind ${leader?.profiles?.name?.split(' ')[0]}`, color:'var(--red)', accent:'rgba(255,71,87,0.06)', border:'rgba(255,71,87,0.2)' },
          { label:'Purse Left', value:`₹${myStats?.purse_remaining||120}Cr`, tag:`of ₹120 Cr total`, color:'var(--blue)', accent:'rgba(75,159,255,0.06)', border:'rgba(75,159,255,0.2)' },
        ].map((s,i) => (
          <div key={i} className="stat-card" style={{ background:s.accent, border:`1px solid ${s.border}` }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:10 }}>{s.label}</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:32, fontWeight:700, color:s.color, lineHeight:1, marginBottom:6 }}>{s.value}</div>
            <div style={{ fontSize:12, color:'var(--text2)' }}>{s.tag}</div>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, ${s.color}, transparent)`, borderRadius:'2px 2px 0 0' }} />
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="fade-up-2" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700 }}>Leaderboard</h2>
          <div style={{ fontSize:12, color:'var(--text3)' }}>Updated live</div>
        </div>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'52px 1fr 110px 120px 90px', gap:8, padding:'12px 20px', background:'var(--navy3)', borderBottom:'1px solid var(--border)', fontSize:11, textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text3)', fontWeight:600 }}>
            <div>#</div><div>Player</div><div style={{ textAlign:'center' }}>Points</div><div style={{ textAlign:'center' }}>Purse Left</div><div style={{ textAlign:'center' }}>Form</div>
          </div>
          {members.map((m, i) => {
            const isMe = m.user_id === profile?.id
            return (
              <div key={m.id} style={{
                display:'grid', gridTemplateColumns:'52px 1fr 110px 120px 90px',
                gap:8, padding:'14px 20px', alignItems:'center',
                borderBottom:'1px solid var(--border)',
                background:isMe?'rgba(240,165,0,0.04)':'transparent',
                transition:'background 0.15s',
                position:'relative'
              }}
                onMouseEnter={e => { if (!isMe) e.currentTarget.style.background='rgba(255,255,255,0.02)' }}
                onMouseLeave={e => { if (!isMe) e.currentTarget.style.background='transparent' }}>

                {isMe && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:2, background:'var(--gold)', borderRadius:'0 2px 2px 0' }} />}

                <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {i < 3 ? (
                    <div style={{ width:30, height:30, borderRadius:'50%', background:`${rankColors[i]}22`, border:`1px solid ${rankColors[i]}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                    </div>
                  ) : (
                    <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--text3)' }}>{i+1}</div>
                  )}
                </div>

                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg, var(--navy4), var(--navy5))', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--text2)', flexShrink:0, overflow:'hidden' }}>
                    {m.profiles?.avatar_url
                      ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : m.profiles?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                      {m.profiles?.name}
                      {isMe && <span style={{ fontSize:9, background:'rgba(240,165,0,0.2)', color:'var(--gold)', borderRadius:4, padding:'2px 6px', fontWeight:700, letterSpacing:'0.5px' }}>YOU</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>₹{m.purse_remaining} Cr remaining</div>
                  </div>
                </div>

                <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, textAlign:'center', color:isMe?'var(--gold)':'var(--text)' }}>
                  {m.total_points.toLocaleString()}
                </div>

                <div style={{ textAlign:'center' }}>
                  <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:600,
                    background: m.purse_remaining < 20 ? 'var(--red2)' : m.purse_remaining < 40 ? 'rgba(240,165,0,0.1)' : 'var(--teal2)',
                    color: m.purse_remaining < 20 ? 'var(--red)' : m.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)' }}>
                    ₹{m.purse_remaining} Cr
                  </div>
                </div>

                <div style={{ textAlign:'center' }}>
                  <span style={{ fontSize:13, fontWeight:600, color: i === 0 ? 'var(--gold)' : i < 3 ? 'var(--teal)' : 'var(--text3)' }}>
                    {i === 0 ? '🔥 Hot' : i < 3 ? '↑ Up' : '— Steady'}
                  </span>
                </div>
              </div>
            )
          })}
          {members.length === 0 && (
            <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>
              <div style={{ fontSize:36, marginBottom:12 }}>👥</div>
              <div>No members yet — share your invite code!</div>
            </div>
          )}
        </div>
      </div>

      {/* Invite code */}
      {league && (
        <div className="fade-up-3" style={{ padding:'18px 24px', background:'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.03))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Invite Code</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, color:'var(--gold)', letterSpacing:4 }}>{league.invite_code?.toUpperCase()}</div>
            <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>Share with friends to join your league</div>
          </div>
          <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(league.invite_code); alert('Copied!') }}>
            📋 Copy Code
          </button>
        </div>
      )}

      {/* My Squad */}
      <MySquad profile={profile} league={league} />
    </div>
  )
}

function MySquad({ profile, league }) {
  const [squad, setSquad] = useState([])
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const ROLE_COLOR = { 'Batsman':'bat','Bowler':'bowl','All-Rounder':'ar','WK-Batsman':'wk' }
  const ROLE_BG = { 'bat':'rgba(240,165,0,0.1)','bowl':'rgba(0,212,170,0.1)','ar':'rgba(255,71,87,0.1)','wk':'rgba(75,159,255,0.1)' }
  const ROLE_TEXT = { 'bat':'var(--gold)','bowl':'var(--teal)','ar':'var(--red)','wk':'var(--blue)' }

  useEffect(() => { if (profile && league) loadSquad() }, [profile, league])

  async function loadSquad() {
    const { data } = await supabase.from('squad').select('*, players(*)')
      .eq('league_id', league.id).eq('user_id', profile.id)
      .order('bought_price', { ascending: false })
    setSquad(data || [])
    const { data: reqs } = await supabase.from('release_requests').select('player_id,status')
      .eq('league_id', league.id).eq('user_id', profile.id).eq('status', 'pending')
    setRequests(reqs || [])
    setLoading(false)
  }

  async function requestRelease(playerId, playerName, boughtPrice) {
    if (!confirm(`Request release of ${playerName}?\n\nAdmin must approve. You'll get ₹${boughtPrice} Cr back if approved.`)) return
    const { data: existing } = await supabase.from('release_requests').select('id')
      .eq('player_id', playerId).eq('league_id', league.id).eq('status', 'pending').maybeSingle()
    if (existing) { alert('Release already requested! Waiting for admin approval.'); return }
    const { error } = await supabase.from('release_requests').insert({
      league_id: league.id, user_id: profile.id, player_id: playerId, status: 'pending'
    })
    if (error) alert('Error: ' + error.message)
    else { alert('Request sent! Admin will approve or reject.'); loadSquad() }
  }

  const totalSpent = squad.reduce((a, s) => a + s.bought_price, 0)
  const pendingIds = new Set(requests.map(r => r.player_id))

  if (loading) return null

  return (
    <div className="fade-up-4">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <h2 style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700 }}>
          My Squad <span style={{ color:'var(--text3)', fontSize:16, fontWeight:400 }}>({squad.length} players)</span>
        </h2>
        <div style={{ display:'flex', gap:10 }}>
          <div style={{ padding:'6px 14px', background:'var(--red2)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:10 }}>
            <span style={{ fontSize:11, color:'var(--text3)' }}>Spent </span>
            <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--red)' }}>₹{totalSpent} Cr</span>
          </div>
          <div style={{ padding:'6px 14px', background:'var(--teal2)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:10 }}>
            <span style={{ fontSize:11, color:'var(--text3)' }}>Left </span>
            <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--teal)' }}>₹{120-totalSpent} Cr</span>
          </div>
        </div>
      </div>

      {squad.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', background:'var(--navy2)', border:'2px dashed var(--border)', borderRadius:16, color:'var(--text3)' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏏</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:600, marginBottom:4 }}>No players yet</div>
          <div style={{ fontSize:13 }}>Go to Auction to start bidding!</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {squad.map(s => {
            const rc = ROLE_COLOR[s.players?.role]
            const isPending = pendingIds.has(s.player_id)
            return (
              <div key={s.id} style={{
                background:'var(--navy2)',
                border:`1px solid ${isPending?'rgba(240,165,0,0.3)':'var(--border)'}`,
                borderRadius:14, overflow:'hidden',
                transition:'all 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.borderColor=isPending?'rgba(240,165,0,0.5)':'var(--border2)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor=isPending?'rgba(240,165,0,0.3)':'var(--border)'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:42, height:42, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:15, fontWeight:700, background:ROLE_BG[rc], color:ROLE_TEXT[rc], border:`1px solid ${ROLE_TEXT[rc]}22` }}>
                    {s.players?.image_initials || s.players?.name?.slice(0,2)}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.players?.name}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
                      <span className={`badge badge-${rc}`} style={{ fontSize:9, padding:'1px 6px' }}>{s.players?.role}</span>
                      <span style={{ fontSize:11, color:'var(--text3)' }}>{s.players?.team}</span>
                    </div>
                  </div>
                </div>
                <div style={{ background:'var(--navy3)', padding:'8px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Bought</div>
                    <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>₹{s.bought_price} Cr</div>
                  </div>
                  {isPending ? (
                    <span style={{ fontSize:10, padding:'3px 8px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--gold)', fontWeight:600, border:'1px solid rgba(240,165,0,0.2)' }}>⏳ Pending</span>
                  ) : (
                    <button onClick={() => requestRelease(s.player_id, s.players?.name, s.bought_price)}
                      style={{ fontSize:10, padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer', fontFamily:'Plus Jakarta Sans,sans-serif', fontWeight:600, transition:'all 0.15s' }}>
                      Release
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}