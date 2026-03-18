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
    const me = enriched.find(m => m.user_id === profile.id)
setMyStats(me)
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

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300 }}><div style={{ fontFamily:'Rajdhani',fontSize:20,color:'var(--gold)' }}>Loading...</div></div>

  if (noLeague) return (
    <div className="fade-in" style={{ maxWidth:480,margin:'60px auto',textAlign:'center' }}>
      <div style={{ fontSize:64,marginBottom:20 }}>🏟️</div>
      <h2 style={{ fontFamily:'Rajdhani',fontSize:28,fontWeight:700,marginBottom:8 }}>You're not in a league yet</h2>
      <p style={{ color:'var(--muted)',marginBottom:32 }}>Join with an invite code or create one in Admin.</p>
      <div style={{ background:'var(--navy2)',border:'1px solid var(--border)',borderRadius:16,padding:24 }}>
        <div style={{ fontSize:14,color:'var(--text2)',marginBottom:12,fontWeight:500 }}>Enter invite code:</div>
        <input className="input" placeholder="e.g. a3f9bc12" value={joinCode} onChange={e => setJoinCode(e.target.value)} style={{ marginBottom:12 }} />
        {joinError && <div style={{ color:'var(--red)',fontSize:13,marginBottom:12 }}>{joinError}</div>}
        <button className="btn btn-primary" style={{ width:'100%' }} onClick={joinLeague} disabled={joining}>{joining ? 'Joining...' : 'Join League'}</button>
        <div style={{ marginTop:16,fontSize:13,color:'var(--muted)' }}>Create a league? Go to <a href="/admin" style={{ color:'var(--gold)' }}>Admin panel</a></div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="fade-in" style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28 }}>
        <div>
          <h1 style={{ fontFamily:'Rajdhani',fontSize:32,fontWeight:700 }}>{league?.name} <span style={{ color:'var(--gold)' }}>·</span> IPL 2026</h1>
          <div style={{ color:'var(--muted)',fontSize:14,marginTop:4 }}>{members.length} friends competing · ₹120 Cr purse each</div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:6,background:'rgba(232,69,69,0.1)',border:'1px solid rgba(232,69,69,0.2)',borderRadius:20,padding:'6px 14px' }}>
          <div className="live-dot" />
          <span style={{ fontSize:12,fontWeight:700,color:'var(--red)',letterSpacing:0.5 }}>LIVE</span>
        </div>
      </div>

      <div className="fade-in-1" style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:24 }}>
        {[
          { label:'Your Points',value:myStats?.total_points||0,tag:`Rank #${myRank} of ${members.length}`,color:'var(--gold)',accent:'rgba(245,166,35,0.15)' },
          { label:'Your Rank',value:`#${myRank}`,tag:`of ${members.length} friends`,color:'var(--teal)',accent:'rgba(0,201,167,0.1)' },
          { label:'Gap to Leader',value:myRank===1?'—':((leader?.total_points||0)-(myStats?.total_points||0)),tag:myRank===1?"You're leading!":`pts behind ${leader?.profiles?.name?.split(' ')[0]}`,color:'var(--red)',accent:'rgba(232,69,69,0.1)' },
          { label:'Purse Left',value:`₹${myStats?.purse_remaining||120}Cr`,tag:`of ₹120 Cr`,color:'var(--blue)',accent:'rgba(59,130,246,0.1)' },
        ].map((s,i) => (
          <div key={i} style={{ background:s.accent,border:`1px solid ${s.color}30`,borderRadius:'var(--radius)',padding:'18px 20px',borderTop:`3px solid ${s.color}` }}>
            <div style={{ fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:6 }}>{s.label}</div>
            <div style={{ fontFamily:'Rajdhani',fontSize:30,fontWeight:700,color:s.color }}>{s.value}</div>
            <div style={{ fontSize:12,color:'var(--text2)',marginTop:2 }}>{s.tag}</div>
          </div>
        ))}
      </div>

      <div className="fade-in-2 card" style={{ overflow:'hidden' }}>
        <div style={{ background:'#0A1628',padding:'14px 20px',display:'grid',gridTemplateColumns:'44px 1fr 100px 110px 90px',gap:8,fontSize:11,textTransform:'uppercase',letterSpacing:'0.8px',color:'var(--muted)',borderBottom:'1px solid var(--border)' }}>
          <div>#</div><div>Friend</div><div style={{ textAlign:'center' }}>Points</div><div style={{ textAlign:'center' }}>Purse Left</div><div style={{ textAlign:'center' }}>Change</div>
        </div>
        {members.map((m,i) => {
          const isMe = m.user_id === profile?.id
          const rankColors = ['var(--gold)','#C0C0C0','#CD7F32']
          return (
            <div key={m.id} style={{ display:'grid',gridTemplateColumns:'44px 1fr 100px 110px 90px',gap:8,padding:'14px 20px',alignItems:'center',borderBottom:'1px solid var(--border)',background:isMe?'rgba(245,166,35,0.05)':'transparent' }}>
              <div style={{ width:30,height:30,borderRadius:'50%',background:i<3?rankColors[i]:'var(--navy3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:i===0?'var(--navy)':i<3?'#fff':'var(--muted)',border:i>=3?'1px solid var(--border)':'none' }}>{i+1}</div>
              <div>
                <div style={{ fontSize:14,fontWeight:500,display:'flex',alignItems:'center',gap:6 }}>
                  {m.profiles?.name}
                  {isMe && <span style={{ fontSize:10,background:'rgba(245,166,35,0.2)',color:'var(--gold)',borderRadius:4,padding:'1px 6px',fontWeight:700 }}>YOU</span>}
                </div>
                <div style={{ fontSize:11,color:'var(--muted)',marginTop:2 }}>₹{m.purse_remaining} Cr remaining</div>
              </div>
              <div style={{ fontFamily:'Rajdhani',fontSize:22,fontWeight:700,textAlign:'center',color:isMe?'var(--gold)':'var(--text)' }}>{m.total_points.toLocaleString()}</div>
              <div style={{ textAlign:'center' }}><div style={{ display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:600,background:'rgba(0,201,167,0.1)',color:'var(--teal)' }}>₹{m.purse_remaining} Cr</div></div>
              <div style={{ textAlign:'center',fontSize:13,color:i%3===0?'var(--teal)':i%3===1?'var(--muted)':'var(--red)',fontWeight:600 }}>{i%3===0?'↑ +1':i%3===1?'— same':'↓ −1'}</div>
            </div>
          )
        })}
        {members.length === 0 && <div style={{ padding:40,textAlign:'center',color:'var(--muted)' }}>No members yet. Share your invite code!</div>}
      </div>

      {league && (
        <div className="fade-in-3" style={{ marginTop:16,padding:'14px 20px',background:'var(--navy2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:12,color:'var(--muted)',marginBottom:2 }}>Share invite code with friends</div>
            <div style={{ fontFamily:'Rajdhani',fontSize:22,fontWeight:700,color:'var(--gold)',letterSpacing:2 }}>{league.invite_code?.toUpperCase()}</div>
          </div>
          <button className="btn btn-secondary" onClick={() => { navigator.clipboard.writeText(league.invite_code); alert('Copied!') }}>📋 Copy Code</button>
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

  useEffect(() => { if (profile && league) loadSquad() }, [profile, league])

  async function loadSquad() {
    const { data } = await supabase
      .from('squad').select('*, players(*)')
      .eq('league_id', league.id).eq('user_id', profile.id)
      .order('bought_price', { ascending: false })
    setSquad(data || [])
    const { data: reqs } = await supabase
      .from('release_requests').select('player_id,status')
      .eq('league_id', league.id).eq('user_id', profile.id).eq('status', 'pending')
    setRequests(reqs || [])
    setLoading(false)
  }

  async function requestRelease(playerId, playerName, boughtPrice) {
    if (!confirm(`Request release of ${playerName}?\n\nAdmin must approve. You'll get ₹${boughtPrice} Cr back if approved.`)) return
    const { data: existing } = await supabase
      .from('release_requests').select('id')
      .eq('player_id', playerId).eq('league_id', league.id).eq('status', 'pending').maybeSingle()
    if (existing) { alert('Release already requested! Waiting for admin approval.'); return }
    const { error } = await supabase.from('release_requests').insert({
      league_id: league.id, user_id: profile.id, player_id: playerId, status: 'pending'
    })
    if (error) alert('Error: ' + error.message)
    else { alert(`Request sent! Admin will approve or reject.`); loadSquad() }
  }

  const totalSpent = squad.reduce((a, s) => a + s.bought_price, 0)
  const pendingIds = new Set(requests.map(r => r.player_id))

  if (loading) return null

  return (
    <div style={{ marginTop:24 }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14 }}>
        <div style={{ fontFamily:'Rajdhani',fontSize:22,fontWeight:700 }}>
          My Squad <span style={{ color:'var(--muted)',fontSize:16,fontWeight:400 }}>({squad.length} players)</span>
        </div>
        <div style={{ display:'flex',gap:12 }}>
          <div style={{ padding:'6px 14px',background:'rgba(232,69,69,0.1)',border:'1px solid rgba(232,69,69,0.2)',borderRadius:8 }}>
            <span style={{ fontSize:11,color:'var(--muted)' }}>Spent </span>
            <span style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--red)' }}>₹{totalSpent} Cr</span>
          </div>
          <div style={{ padding:'6px 14px',background:'rgba(0,201,167,0.1)',border:'1px solid rgba(0,201,167,0.2)',borderRadius:8 }}>
            <span style={{ fontSize:11,color:'var(--muted)' }}>Left </span>
            <span style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--teal)' }}>₹{120-totalSpent} Cr</span>
          </div>
        </div>
      </div>

      {squad.length === 0 ? (
        <div style={{ padding:32,textAlign:'center',background:'var(--navy2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',color:'var(--muted)' }}>
          <div style={{ fontSize:32,marginBottom:8 }}>🏏</div>
          <div>No players yet — go to Auction to bid!</div>
        </div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10 }}>
          {squad.map(s => {
            const isPending = pendingIds.has(s.player_id)
            return (
              <div key={s.id} style={{ background:'var(--navy2)',border:`1px solid ${isPending?'rgba(245,166,35,0.4)':'rgba(245,166,35,0.2)'}`,borderRadius:12,overflow:'hidden' }}>
                <div style={{ padding:'12px 14px',display:'flex',alignItems:'center',gap:10 }}>
                  <div style={{ width:40,height:40,borderRadius:9,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Rajdhani',fontSize:14,fontWeight:700,
                    background:ROLE_COLOR[s.players?.role]==='bat'?'rgba(245,166,35,0.15)':ROLE_COLOR[s.players?.role]==='bowl'?'rgba(0,201,167,0.15)':ROLE_COLOR[s.players?.role]==='ar'?'rgba(232,69,69,0.15)':'rgba(59,130,246,0.15)',
                    color:ROLE_COLOR[s.players?.role]==='bat'?'var(--gold)':ROLE_COLOR[s.players?.role]==='bowl'?'var(--teal)':ROLE_COLOR[s.players?.role]==='ar'?'var(--red)':'var(--blue)' }}>
                    {s.players?.image_initials||s.players?.name?.slice(0,2)}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{s.players?.name}</div>
                    <div style={{ fontSize:11,color:'var(--muted)',marginTop:2 }}>{s.players?.team} · {s.players?.role}</div>
                  </div>
                </div>
                <div style={{ background:'#0A1220',padding:'7px 14px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                  <span style={{ fontFamily:'Rajdhani',fontSize:15,fontWeight:700,color:'var(--gold)' }}>₹{s.bought_price} Cr</span>
                  {isPending ? (
                    <span style={{ fontSize:10,padding:'3px 8px',borderRadius:6,background:'rgba(245,166,35,0.15)',color:'var(--gold)',fontWeight:600 }}>⏳ Pending</span>
                  ) : (
                    <button onClick={() => requestRelease(s.player_id, s.players?.name, s.bought_price)}
                      style={{ fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid rgba(232,69,69,0.3)',background:'rgba(232,69,69,0.1)',color:'var(--red)',cursor:'pointer',fontFamily:'DM Sans,sans-serif',fontWeight:600 }}>
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