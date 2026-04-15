import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getSelectedLeagueId, setSelectedLeagueId as saveLeagueId } from '../lib/selectedLeague'
import { aggregatePlayerStats } from '../lib/playerStats'

export default function Dashboard() {
  const { profile } = useAuth()
  const [allLeagues, setAllLeagues] = useState([])
  const [selectedLeagueId, setSelectedLeagueIdState] = useState(null)
  function setSelectedLeagueId(id) {
  setSelectedLeagueIdState(id)
  saveLeagueId(id)
}
  const [members, setMembers] = useState([])
  const [league, setLeague] = useState(null)
  const [myStats, setMyStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [noLeague, setNoLeague] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState('')
  const [showLeave, setShowLeave] = useState(false)
  const [showJoin, setShowJoin] = useState(false)

  useEffect(() => { if (profile) loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    try {
      const { data: allMem } = await supabase
        .from('league_members').select('*, leagues(*)')
        .eq('user_id', profile.id)
      if (!allMem || allMem.length === 0) {
        setNoLeague(true); setLoading(false); return
      }
      const leagues = allMem.map(m => m.leagues).filter(Boolean)
      setAllLeagues(leagues)
      setNoLeague(false)
      const savedId = getSelectedLeagueId()
const activeId = savedId && leagues.find(l => l.id === savedId) ? savedId : leagues[0]?.id
      setSelectedLeagueId(activeId)
      await loadLeagueData(activeId)
    } catch (e) {
      console.error('Dashboard load error:', e)
      setNoLeague(true)
    }
    setLoading(false)
  }

  async function loadLeagueData(leagueId) {
    if (!leagueId) return
    try {
      const { data: lg } = await supabase.from('leagues').select('*').eq('id', leagueId).single()
      setLeague(lg)
      const { data: allMembers } = await supabase
        .from('league_members').select('*, profiles(*)')
        .eq('league_id', leagueId)
      const { data: pointsData } = await supabase
        .from('match_points').select('*')
        .eq('league_id', leagueId)
      // Fetch matches to count total completed for fair comparison
      const { data: matchData } = await supabase
        .from('matches').select('id, status')
      const totalCompletedMatches = (matchData || []).filter(m => m.status === 'completed').length
      const pointsMap = {}
      pointsData?.forEach(p => {
        pointsMap[p.user_id] = (pointsMap[p.user_id] || 0) + p.total_points
      })
      const enriched = (allMembers || []).map(m => ({
        ...m,
        total_points: pointsMap[m.user_id] || 0,
        matches_played: totalCompletedMatches,
        avg_points: totalCompletedMatches > 0
          ? Math.round((pointsMap[m.user_id] || 0) / totalCompletedMatches)
          : 0,
      })).sort((a, b) => b.total_points - a.total_points)
      setMembers(enriched)
      setMyStats(enriched.find(m => m.user_id === profile.id))
    } catch (e) {
      console.error('League data error:', e)
    }
  }

  async function switchLeague(leagueId) {
    setSelectedLeagueId(leagueId)
    setLoading(true)
    await loadLeagueData(leagueId)
    setLoading(false)
  }

  async function joinLeague() {
    if (!joinCode.trim()) return
    setJoining(true); setJoinError('')
    try {
      const code = joinCode.trim().toLowerCase()
      const { data: leagues } = await supabase
        .from('leagues').select('*')
        .ilike('invite_code', code)
      if (!leagues || leagues.length === 0) {
        setJoinError('Invalid invite code! Double check and try again.')
        setJoining(false); return
      }
      const lg = leagues[0]
      const { data: existing } = await supabase
        .from('league_members').select('id')
        .eq('league_id', lg.id).eq('user_id', profile.id).maybeSingle()
      if (existing) {
        setJoinError('You are already in this league!')
        setJoining(false); return
      }
      const { error } = await supabase.from('league_members').insert({
        league_id: lg.id, user_id: profile.id,
        purse_remaining: lg.purse_limit || 120, is_admin: false
      })
      if (error) { setJoinError('Error: ' + error.message); setJoining(false); return }
      setJoinCode('')
      setShowJoin(false)
      await loadData()
    } catch (e) {
      setJoinError('Something went wrong: ' + e.message)
    }
    setJoining(false)
  }

  async function leaveLeague() {
    if (!league || !profile) return
    if (!confirm(`Leave "${league.name}"? Your squad and all bids will be deleted permanently.`)) return
    try {
      await supabase.from('squad').delete().eq('league_id', league.id).eq('user_id', profile.id)
      await supabase.from('auction_bids').delete().eq('league_id', league.id).eq('bidder_id', profile.id)
      await supabase.from('match_points').delete().eq('league_id', league.id).eq('user_id', profile.id)
      await supabase.from('release_requests').delete().eq('league_id', league.id).eq('user_id', profile.id)
      await supabase.from('league_members').delete().eq('league_id', league.id).eq('user_id', profile.id)
      const remaining = allLeagues.filter(l => l.id !== league.id)
      if (remaining.length > 0) {
        setSelectedLeagueId(remaining[0].id)
        setAllLeagues(remaining)
        await loadLeagueData(remaining[0].id)
      } else {
        setAllLeagues([])
        setLeague(null)
        setNoLeague(true)
      }
      setShowLeave(false)
    } catch (e) {
      alert('Error leaving league: ' + e.message)
    }
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
      <p style={{ color:'var(--text2)', marginBottom:28, lineHeight:1.6, fontSize:14 }}>
        Ask your friends for the invite code and join below!
      </p>
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:20, padding:24 }}>
        <div style={{ fontSize:13, color:'var(--text2)', marginBottom:10, fontWeight:500 }}>Enter invite code:</div>
        <input className="input" placeholder="e.g. A3F9BC12" value={joinCode}
          onChange={e => setJoinCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && joinLeague()}
          style={{ marginBottom:10, textAlign:'center', fontSize:18, letterSpacing:3, fontFamily:'Rajdhani', fontWeight:700, textTransform:'uppercase' }} />
        {joinError && (
          <div style={{ color:'var(--red)', fontSize:13, marginBottom:10, padding:'8px 12px', background:'var(--red2)', borderRadius:8 }}>{joinError}</div>
        )}
        <button className="btn btn-primary" style={{ width:'100%', padding:14, fontSize:15 }} onClick={joinLeague} disabled={joining}>
          {joining ? '⟳ Joining...' : '🏏 Join League'}
        </button>
        <div style={{ marginTop:14, fontSize:13, color:'var(--text3)' }}>
          Want to create a league? Go to <a href="/admin" style={{ color:'var(--gold)', fontWeight:600 }}>Admin panel</a>
        </div>
      </div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>IPL 2026 Fantasy</div>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(22px,5vw,34px)', fontWeight:700 }}>{league?.name}</h1>
            <div style={{ color:'var(--text2)', fontSize:13, marginTop:2 }}>{members.length} friends · ₹120 Cr each</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:20, padding:'6px 12px', flexShrink:0 }}>
            <div className="live-dot" />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--red)', letterSpacing:1 }}>LIVE</span>
          </div>
        </div>
      </div>

      {/* League switcher */}
      {allLeagues.length > 1 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:8 }}>Switch League</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {allLeagues.map(lg => (
              <button key={lg.id} onClick={() => switchLeague(lg.id)} style={{
                padding:'7px 14px', borderRadius:20, fontSize:13, fontWeight:600,
                border:`1px solid ${selectedLeagueId===lg.id?'rgba(240,165,0,0.4)':'var(--border)'}`,
                cursor:'pointer', transition:'all 0.15s',
                background:selectedLeagueId===lg.id?'rgba(240,165,0,0.1)':'var(--navy2)',
                color:selectedLeagueId===lg.id?'var(--gold)':'var(--text2)',
              }}>{lg.name}</button>
            ))}
          </div>
        </div>
      )}

      {/* Join + Leave buttons */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <button onClick={() => { setShowJoin(!showJoin); setShowLeave(false) }} style={{
          padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600,
          border:'1px solid var(--border)', cursor:'pointer',
          background:showJoin?'rgba(0,212,170,0.1)':'var(--navy2)',
          color:showJoin?'var(--teal)':'var(--text3)',
        }}>+ Join another league</button>

        <button onClick={() => { setShowLeave(!showLeave); setShowJoin(false) }} style={{
          padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:600,
          border:'1px solid var(--border)', cursor:'pointer',
          background:showLeave?'rgba(255,71,87,0.1)':'var(--navy2)',
          color:showLeave?'var(--red)':'var(--text3)',
        }}>✕ Leave league</button>
      </div>

      {/* Join form */}
      {showJoin && (
        <div className="fade-in" style={{ padding:'16px 18px', background:'var(--navy2)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:14, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--teal)', marginBottom:10 }}>Join Another League</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <input className="input" placeholder="Enter invite code" value={joinCode}
              onChange={e => setJoinCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && joinLeague()}
              style={{ flex:1, minWidth:160, fontSize:14, letterSpacing:2, fontFamily:'Rajdhani', fontWeight:700, textTransform:'uppercase', padding:'8px 14px' }} />
            <button className="btn btn-teal" onClick={joinLeague} disabled={joining} style={{ padding:'8px 20px', flexShrink:0 }}>
              {joining ? '⟳' : 'Join'}
            </button>
          </div>
          {joinError && <div style={{ color:'var(--red)', fontSize:12, marginTop:8 }}>{joinError}</div>}
        </div>
      )}

      {/* Leave form */}
      {showLeave && (
        <div className="fade-in" style={{ padding:'16px 18px', background:'rgba(255,71,87,0.05)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:14, marginBottom:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--red)', marginBottom:6 }}>⚠️ Leave "{league?.name}"?</div>
          <div style={{ fontSize:12, color:'var(--text2)', marginBottom:12, lineHeight:1.6 }}>
            This will permanently delete your squad, bids and points in this league. This cannot be undone!
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-danger" style={{ flex:1, padding:10 }} onClick={leaveLeague}>
              Yes, Leave League
            </button>
            <button className="btn btn-ghost" style={{ flex:1, padding:10 }} onClick={() => setShowLeave(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

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
          <a href="/league-stats" style={{ fontSize:12, color:'var(--gold)', textDecoration:'none', fontWeight:600 }}>Full stats →</a>
        </div>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'32px 1fr 70px 55px 60px 65px', gap:6, padding:'8px 12px', background:'var(--navy3)', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600 }}>#</div>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Name</div>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Total Pts</div>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Matches</div>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Avg/M</div>
            <div style={{ fontSize:9, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Purse</div>
          </div>
          {members.map((m, i) => {
            const isMe = m.user_id === profile?.id
            return (
              <div key={m.id} style={{ display:'grid', gridTemplateColumns:'32px 1fr 70px 55px 60px 65px', gap:6, padding:'10px 12px', borderBottom:'1px solid var(--border)', background:isMe?'rgba(240,165,0,0.04)':'transparent', position:'relative', alignItems:'center' }}>
                {isMe && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:2, background:'var(--gold)' }} />}
                <div style={{ fontSize: i < 3 ? 14 : 12, fontWeight:700, color: i < 3 ? 'inherit' : 'var(--text3)', textAlign:'center' }}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                  <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'var(--text2)', flexShrink:0, overflow:'hidden' }}>
                    {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{m.profiles?.name}</span>
                      {isMe && <span style={{ fontSize:8, background:'rgba(240,165,0,0.2)', color:'var(--gold)', borderRadius:3, padding:'1px 4px', fontWeight:700, flexShrink:0 }}>YOU</span>}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:isMe?'var(--gold)':'var(--text)', textAlign:'right' }}>
                  {m.total_points.toLocaleString()}
                </div>
                <div style={{ fontSize:12, color:'var(--text2)', textAlign:'right' }}>
                  {m.matches_played}
                </div>
                <div style={{ fontSize:12, color:'var(--teal)', fontWeight:600, textAlign:'right' }}>
                  {m.avg_points}
                </div>
                <div style={{ fontSize:11, color:'var(--text2)', textAlign:'right' }}>
                  ₹{m.purse_remaining}Cr
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
          <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(league.invite_code?.toUpperCase()); alert('Copied!') }}>
            📋 Copy Code
          </button>
        </div>
      )}

      <TopPerformers profile={profile} league={league} />
      <MySquad profile={profile} league={league} />
      <FriendsSquads profile={profile} league={league} members={members} />
    </div>
  )
}

function TopPerformers({ profile, league }) {
  const [topPlayers, setTopPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.1)','Bowler':'rgba(0,212,170,0.1)','All-Rounder':'rgba(255,71,87,0.1)','WK-Batsman':'rgba(75,159,255,0.1)' }
  const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }

  useEffect(() => { if (profile && league) loadTopPerformers() }, [profile, league])

  async function loadTopPerformers() {
    setLoading(true)
    try {
      const { data: playerData } = await supabase.from('players').select('*')
      const playersMap = {}
      playerData?.forEach(p => { playersMap[p.id] = p })

      // Try player_match_performances first (new table, user-specific)
      const { data: pmpData } = await supabase
        .from('player_match_performances').select('*')
        .eq('user_id', profile.id)
        .eq('league_id', league.id)

      if (pmpData && pmpData.length > 0) {
        const statsMap = {}
        for (const perf of pmpData) {
          const player = playersMap[perf.player_id]
          if (!player) continue
          if (!statsMap[perf.player_id]) {
            statsMap[perf.player_id] = {
              playerId: perf.player_id, name: player.name, role: player.role, team: player.team,
              totalPoints: 0, matchCount: 0,
            }
          }
          statsMap[perf.player_id].totalPoints += perf.fantasy_points || 0
          statsMap[perf.player_id].matchCount += 1
        }
        const aggregated = Object.values(statsMap)
          .map(s => ({ ...s, avgPoints: s.matchCount > 0 ? Math.round(s.totalPoints / s.matchCount) : 0 }))
          .sort((a, b) => b.totalPoints - a.totalPoints)
        setTopPlayers(aggregated.slice(0, 5))
      } else {
        // Fallback: legacy performances table
        const { data: squadData } = await supabase
          .from('squad').select('player_id')
          .eq('league_id', league.id).eq('user_id', profile.id)
        const squadIds = new Set(squadData?.map(s => s.player_id) || [])

        const { data: perfs } = await supabase.from('performances').select('*')
        const aggregated = aggregatePlayerStats(perfs || [], squadIds, playersMap)
        setTopPlayers(aggregated.slice(0, 5))
      }
    } catch (e) {
      console.error('TopPerformers error:', e)
    }
    setLoading(false)
  }

  if (loading || !league || topPlayers.length === 0) return null

  return (
    <div style={{ marginTop:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>
          🏆 Top Performers
        </h2>
        <a href="/player-stats" style={{ fontSize:12, color:'var(--gold)', textDecoration:'none', fontWeight:600 }}>View all →</a>
      </div>
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
        {topPlayers.map((s, i) => (
          <div key={s.playerId} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:i<3?16:12, fontWeight:700, width:24, textAlign:'center', color:i>=3?'var(--text3)':'inherit', flexShrink:0 }}>
              {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
            </div>
            <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:11, fontWeight:700, background:ROLE_BG[s.role], color:ROLE_TEXT[s.role] }}>
              {s.name?.slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
              <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>
                {s.team} · {s.matchCount} match{s.matchCount!==1?'es':''} · avg {s.avgPoints}/match
              </div>
            </div>
            <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>
              {s.totalPoints}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MySquad({ profile, league }) {
  const [squad, setSquad] = useState([])
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.1)','Bowler':'rgba(0,212,170,0.1)','All-Rounder':'rgba(255,71,87,0.1)','WK-Batsman':'rgba(75,159,255,0.1)' }
  const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }

  useEffect(() => { if (profile && league) loadSquad() }, [profile, league])

  async function loadSquad() {
    setLoading(true)
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
    if (!confirm(`Request release of ${playerName}?\nAdmin must approve. You'll get ₹${boughtPrice}Cr back.`)) return
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

  if (loading || !league) return null

  return (
    <div style={{ marginTop:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>
          My Squad <span style={{ color:'var(--text3)', fontSize:15, fontWeight:400 }}>({squad.length}/15)</span>
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
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:10 }}>
          {squad.map(s => {
            const isPending = pendingIds.has(s.player_id)
            return (
              <div key={s.id} style={{ background:'var(--navy2)', border:`1px solid ${isPending?'rgba(240,165,0,0.3)':s.is_traded?'rgba(0,212,170,0.3)':'var(--border)'}`, borderRadius:12, overflow:'hidden', transition:'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.2)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ padding:'12px 12px 8px', display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:38, height:38, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:13, fontWeight:700, background:ROLE_BG[s.players?.role], color:ROLE_TEXT[s.players?.role] }}>
                    {s.players?.image_initials||s.players?.name?.slice(0,2)}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.players?.name}</div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>
                      {s.players?.team} · {s.players?.role?.replace('All-Rounder','AR').replace('WK-Batsman','WK')}
                    </div>
                    {s.is_traded && <div style={{ fontSize:9, color:'var(--teal)', fontWeight:700, marginTop:2 }}>🔄 Traded</div>}
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

function FriendsSquads({ profile, league, members }) {
  const [squads, setSquads] = useState({})
  const [loading, setLoading] = useState(true)
  const [openFriend, setOpenFriend] = useState(null)
  const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.1)','Bowler':'rgba(0,212,170,0.1)','All-Rounder':'rgba(255,71,87,0.1)','WK-Batsman':'rgba(75,159,255,0.1)' }
  const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }

  useEffect(() => {
    if (league && members?.length) loadAllSquads()
  }, [league, members])

  async function loadAllSquads() {
    if (!league) return
    setLoading(true)
    const { data } = await supabase
      .from('squad').select('*, players(*)')
      .eq('league_id', league.id)
    const grouped = {}
    data?.forEach(s => {
      if (!grouped[s.user_id]) grouped[s.user_id] = []
      grouped[s.user_id].push(s)
    })
    setSquads(grouped)
    setLoading(false)
  }

  const friends = members.filter(m => m.user_id !== profile?.id)
  if (loading || friends.length === 0) return null

  return (
    <div style={{ marginTop:28 }}>
      <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:16 }}>
        Friends' Squads
        <span style={{ color:'var(--text3)', fontSize:14, fontWeight:400, marginLeft:8 }}>({friends.length} friends)</span>
      </h2>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {friends.map(m => {
          const friendSquad = squads[m.user_id] || []
          const isOpen = openFriend === m.user_id
          const spent = friendSquad.reduce((a, s) => a + (s.bought_price || 0), 0)
          return (
            <div key={m.user_id} style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
              <div onClick={() => setOpenFriend(isOpen ? null : m.user_id)}
                style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg, var(--teal), var(--gold))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'var(--navy)', flexShrink:0, overflow:'hidden' }}>
                  {m.profiles?.avatar_url
                    ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    : m.profiles?.name?.slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{m.profiles?.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span>{friendSquad.length}/15 players</span>
                    <span style={{ color:'var(--border2)' }}>·</span>
                    <span style={{ color:'var(--red)' }}>₹{spent}Cr spent</span>
                    <span style={{ color:'var(--border2)' }}>·</span>
                    <span style={{ color:'var(--teal)' }}>₹{m.purse_remaining}Cr left</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:4, flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  {[
                    { role:'Batsman', short:'BAT' },
                    { role:'Bowler', short:'BWL' },
                    { role:'All-Rounder', short:'AR' },
                    { role:'WK-Batsman', short:'WK' },
                  ].map(({ role, short }) => {
                    const count = friendSquad.filter(s => s.players?.role === role).length
                    if (!count) return null
                    return (
                      <div key={role} style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:5, background:ROLE_BG[role], color:ROLE_TEXT[role] }}>
                        {count} {short}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize:16, color:'var(--text3)', flexShrink:0, marginLeft:6 }}>
                  {isOpen ? '▲' : '▼'}
                </div>
              </div>
              {isOpen && (
                <div style={{ borderTop:'1px solid var(--border)', padding:'14px 16px', background:'var(--navy3)' }}>
                  {friendSquad.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'12px 0', color:'var(--text3)', fontSize:13 }}>No players yet</div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:8 }}>
                      {friendSquad.sort((a,b) => (b.bought_price||0) - (a.bought_price||0)).map(s => (
                        <div key={s.id} style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                          <div style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:12, fontWeight:700, background:ROLE_BG[s.players?.role], color:ROLE_TEXT[s.players?.role] }}>
                              {s.players?.image_initials || s.players?.name?.slice(0,2)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.players?.name}</div>
                              <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>{s.players?.team}</div>
                              {s.is_traded && <div style={{ fontSize:9, color:'var(--teal)', fontWeight:700 }}>🔄 Traded</div>}
                            </div>
                          </div>
                          <div style={{ background:'var(--navy4)', padding:'5px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--border)' }}>
                            <span style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>
                              {s.players?.role?.replace('All-Rounder','AR').replace('WK-Batsman','WK')}
                            </span>
                            <span style={{ fontFamily:'Rajdhani', fontSize:14, fontWeight:700, color:'var(--gold)' }}>₹{s.bought_price}Cr</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}