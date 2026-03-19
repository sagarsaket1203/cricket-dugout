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

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading your league...</div>
    </div>
  )

  if (noLeague) return (
    <div className="fade-up" style={{ maxWidth:480, margin:'40px auto', textAlign:'center', padding:'0 16px' }}>
      <div style={{ fontSize:56, marginBottom:16 }}>🏟️</div>
      <h2 style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, marginBottom:8 }}>You're not in a league yet</h2>
      <p style={{ color:'var(--text2)', marginBottom:28, lineHeight:1.6, fontSize:14 }}>Join your friends' league with an invite code, or create one in the Admin panel.</p>
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:20, padding:24 }}>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:10, fontWeight:500 }}>Enter invite code:</div>
        <input className="input" placeholder="e.g. A3F9BC12" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ marginBottom:10, textAlign:'center', fontSize:16, letterSpacing:2, fontFamily:'Rajdhani', fontWeight:700 }} />
        {joinError && <div style={{ color:'var(--red)', fontSize:13, marginBottom:10, padding:'8px 12px', background:'var(--red2)', borderRadius:8 }}>{joinError}</div>}
        <button className="btn btn-primary" style={{ width:'100%', padding:14 }} onClick={joinLeague} disabled={joining}>
          {joining ? 'Joining...' : '🏏 Join League'}
        </button>
        <div style={{ marginTop:14, fontSize:13, color:'var(--text3)' }}>
          Create a league? Go to <a href="/admin" style={{ color:'var(--gold)', fontWeight:600 }}>Admin panel</a>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>IPL 2026 Fantasy</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px, 5vw, 36px)', fontWeight:700 }}>{league?.name}</h1>
          <div style={{ color:'var(--text2)', fontSize:13, marginTop:4 }}>{members.length} friends · ₹120 Cr each</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:20, padding:'6px 12px', flexShrink:0 }}>
          <div className="live-dot" />
          <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', letterSpacing:1 }}>LIVE</span>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Your Points', value:myStats?.total_points?.toLocaleString()||'0', tag:`Rank #${myRank} of ${members.length}`, color:'var(--gold)', border:'rgba(240,165,0,0.2)', bg:'rgba(240,165,0,0.06)' },
          { label:'Your Rank', value:`#${myRank}`, tag:`of ${members.length} friends`, color:'var(--teal)', border:'rgba(0,212,170,0.2)', bg:'rgba(0,212,170,0.05)' },
          { label:'Gap to Leader', value:myRank===1?'👑':((leader?.total_points||0)-(myStats?.total_points||0)).toLocaleString(), tag:myRank===1?"You're leading!":`pts behind ${leader?.profiles?.name?.split(' ')[0]||'leader'}`, color:'var(--red)', border:'rgba(255,71,87,0.2)', bg:'rgba(255,71,87,0.05)' },
          { label:'Purse Left', value:`₹${myStats?.purse_remaining||120}Cr`, tag:'of ₹120 Cr total', color:'var(--blue)', border:'rgba(75,159,255,0.2)', bg:'rgba(75,159,255,0.05)' },
        ].map((s,i) => (
          <div key={i} style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, ${s.color}, transparent)` }} />
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>{s.label}</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:'clamp(22px,4vw,30px)', fontWeight:700, color:s.color, lineHeight:1, marginBottom:4 }}>{s.value}</div>
            <div style={{ fontSize:11, color:'var(--text2)' }}>{s.tag}</div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="fade-up-2" style={{ marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>Leaderboard</h2>
          <div style={{ fontSize:11, color:'var(--text3)' }}>Updated live</div>
        </div>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          {members.map((m, i) => {
            const isMe = m.user_id === profile?.id
            return (
              <div key={m.id} style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'12px 14px', borderBottom:'1px solid var(--border)',
                background:isMe?'rgba(240,165,0,0.04)':'transparent',
                position:'relative'
              }}>
                {isMe && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:2, background:'var(--gold)' }} />}
                <div style={{ width:28, height:28, borderRadius:'50%', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:i<3?16:11, fontWeight:700,
                  background:i<3?'transparent':'var(--navy4)', color:i<3?'inherit':'var(--text3)',
                  border:i>=3?'1px solid var(--border)':'none' }}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                </div>
                <div style={{ width:30, height:30, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--text2)', flexShrink:0, overflow:'hidden' }}>
                  {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                    <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.profiles?.name}</span>
                    {isMe && <span style={{ fontSize:9, background:'rgba(240,165,0,0.2)', color:'var(--gold)', borderRadius:4, padding:'1px 5px', fontWeight:700, flexShrink:0 }}>YOU</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>₹{m.purse_remaining}Cr left</div>
                </div>
                <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:isMe?'var(--gold)':'var(--text)', flexShrink:0 }}>
                  {m.total_points.toLocaleString()}
                </div>
              </div>
            )
          })}
          {members.length === 0 && (
            <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>👥</div>
              <div>No members yet — share your invite code!</div>
            </div>
          )}
        </div>
      </div>

      {/* Invite code */}
      {league && (
        <div style={{ padding:'16px 20px', background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:20, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:3 }}>Invite Code</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:26, fontWeight:700, color:'var(--gold)', letterSpacing:4 }}>{league.invite_code?.toUpperCase()}</div>
            <div style={{ fontSize:11, color:'var(--text2)', marginTop:1 }}>Share with friends to join</div>
          </div>
          <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(league.invite_code); alert('Copied!') }}>
            📋 Copy Code
          </button>
        </div>
      )}

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
    if (!confirm(`Request release of ${playerName}?\nAdmin must approve. You'll get ₹${boughtPrice} Cr back.`)) return
    const { data: existing } = await supabase.from('release_requests').select('id')
      .eq('player_id', playerId).eq('league_id', league.id).eq('status', 'pending').maybeSingle()
    if (existing) { alert('Already requested! Waiting for admin.'); return }
    const { error } = await supabase.from('release_requests').insert({
      league_id: league.id, user_id: profile.id, player_id: playerId, status: 'pending'
    })
    if (error) alert('Error: ' + error.message)
    else { alert('Request sent!'); loadSquad() }
  }

  const totalSpent = squad.reduce((a, s) => a + s.bought_price, 0)
  const pendingIds = new Set(requests.map(r => r.player_id))

  if (loading) return null

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>
          My Squad <span style={{ color:'var(--text3)', fontSize:15, fontWeight:400 }}>({squad.length})</span>
        </h2>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ padding:'5px 12px', background:'var(--red2)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:8 }}>
            <span style={{ fontSize:10, color:'var(--text3)' }}>Spent </span>
            <span style={{ fontFamily:'Rajdhani', fontSize:15, fontWeight:700, color:'var(--red)' }}>₹{totalSpent}Cr</span>
          </div>
          <div style={{ padding:'5px 12px', background:'var(--teal2)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:8 }}>
            <span style={{ fontSize:10, color:'var(--text3)' }}>Left </span>
            <span style={{ fontFamily:'Rajdhani', fontSize:15, fontWeight:700, color:'var(--teal)' }}>₹{120-totalSpent}Cr</span>
          </div>
        </div>
      </div>

      {squad.length === 0 ? (
        <div style={{ padding:32, textAlign:'center', background:'var(--navy2)', border:'2px dashed var(--border)', borderRadius:14, color:'var(--text3)' }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏏</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:600, marginBottom:4 }}>No players yet</div>
          <div style={{ fontSize:13 }}>Go to Auction to start bidding!</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:10 }}>
          {squad.map(s => {
            const rc = ROLE_COLOR[s.players?.role]
            const isPending = pendingIds.has(s.player_id)
            return (
              <div key={s.id} style={{ background:'var(--navy2)', border:`1px solid ${isPending?'rgba(240,165,0,0.3)':'var(--border)'}`, borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 12px 8px', display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:38, height:38, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:13, fontWeight:700, background:ROLE_BG[rc], color:ROLE_TEXT[rc] }}>
                    {s.players?.image_initials||s.players?.name?.slice(0,2)}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.players?.name}</div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{s.players?.team}</div>
                  </div>
                </div>
                <div style={{ background:'var(--navy3)', padding:'7px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--border)' }}>
                  <div style={{ fontFamily:'Rajdhani', fontSize:15, fontWeight:700, color:'var(--gold)' }}>₹{s.bought_price}Cr</div>
                  {isPending ? (
                    <span style={{ fontSize:9, padding:'2px 6px', borderRadius:5, background:'rgba(240,165,0,0.1)', color:'var(--gold)', fontWeight:700 }}>⏳</span>
                  ) : (
                    <button onClick={() => requestRelease(s.player_id, s.players?.name, s.bought_price)}
                      style={{ fontSize:9, padding:'3px 7px', borderRadius:5, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer', fontWeight:600 }}>
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