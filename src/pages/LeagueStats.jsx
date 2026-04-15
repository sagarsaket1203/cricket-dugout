import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getSelectedLeagueId } from '../lib/selectedLeague'

export default function LeagueStats() {
  const { profile } = useAuth()
  const [members, setMembers] = useState([])
  const [league, setLeague] = useState(null)
  const [matches, setMatches] = useState([])
  const [matchPointsAll, setMatchPointsAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('total_points')
  const [sortDir, setSortDir] = useState('desc')
  const [expandedUser, setExpandedUser] = useState(null)

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
    try {
      const { data: mems } = await supabase
        .from('league_members').select('*, leagues(*)')
        .eq('user_id', profile.id)
      const savedId = getSelectedLeagueId()
      const mem = (savedId && mems?.find(m => m.league_id === savedId)) || mems?.[0]
      if (!mem) { setLoading(false); return }
      setLeague(mem.leagues)

      const { data: allMembers } = await supabase
        .from('league_members').select('*, profiles(*)')
        .eq('league_id', mem.league_id)

      const { data: pointsData } = await supabase
        .from('match_points').select('*')
        .eq('league_id', mem.league_id)
      setMatchPointsAll(pointsData || [])

      const { data: matchData } = await supabase
        .from('matches').select('*')
        .order('match_date', { ascending: false })
      setMatches(matchData || [])

      // Aggregate points per user — count ALL completed matches equally for fair comparison
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
      }))
      setMembers(enriched)
    } catch (e) {
      console.error('LeagueStats load error:', e)
    }
    setLoading(false)
  }

  const sorted = [...members].sort((a, b) => {
    const aVal = a[sortBy] ?? 0
    const bVal = b[sortBy] ?? 0
    return sortDir === 'desc' ? bVal - aVal : aVal - bVal
  })

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  function getSortIcon(field) {
    if (sortBy !== field) return '↕'
    return sortDir === 'desc' ? '↓' : '↑'
  }

  // Get per-match points for a specific user
  function getUserMatchPoints(userId) {
    return matchPointsAll
      .filter(p => p.user_id === userId)
      .map(p => {
        const match = matches.find(m => m.id === p.match_id)
        return { ...p, match }
      })
      .sort((a, b) => {
        const da = a.match?.match_date ? new Date(a.match.match_date) : 0
        const db = b.match?.match_date ? new Date(b.match.match_date) : 0
        return db - da
      })
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading league stats...</div>
    </div>
  )

  if (!league) return (
    <div style={{ padding:36, textAlign:'center', color:'var(--text3)' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🏟️</div>
      <div>Join a league first to see stats!</div>
    </div>
  )

  const totalMatches = matches.filter(m => m.status === 'completed').length

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>IPL 2026 Fantasy</div>
        <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px,5vw,36px)', fontWeight:700, marginBottom:4 }}>
          🏆 League Standings
        </h1>
        <div style={{ color:'var(--text2)', fontSize:13 }}>
          {league.name} · {members.length} members · {totalMatches} match{totalMatches !== 1 ? 'es' : ''} completed
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:10, marginBottom:24 }}>
        <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--gold), transparent)' }} />
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Members</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, color:'var(--gold)', lineHeight:1 }}>{members.length}</div>
        </div>
        <div style={{ background:'rgba(0,212,170,0.05)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--teal), transparent)' }} />
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Matches Done</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, color:'var(--teal)', lineHeight:1 }}>{totalMatches}</div>
        </div>
        <div style={{ background:'rgba(75,159,255,0.05)', border:'1px solid rgba(75,159,255,0.2)', borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--blue), transparent)' }} />
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Leader</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--blue)', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {sorted[0]?.profiles?.name || '—'}
          </div>
        </div>
      </div>

      {/* Leaderboard table */}
      {members.length === 0 ? (
        <div style={{ padding:36, textAlign:'center', background:'var(--navy2)', border:'2px dashed var(--border)', borderRadius:18, color:'var(--text3)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>👥</div>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, marginBottom:8 }}>No Members Yet</h2>
          <div style={{ fontSize:13, lineHeight:1.7 }}>Share your invite code to get friends in the league!</div>
        </div>
      ) : (
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 90px 70px 80px 80px', gap:8, padding:'10px 14px', background:'var(--navy3)', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600 }}>#</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Member</div>
            {[
              { key:'total_points', label:'Total Pts' },
              { key:'matches_played', label:'Matches' },
              { key:'avg_points', label:'Avg/Match' },
              { key:'purse_remaining', label:'Purse Left' },
            ].map(col => (
              <div
                key={col.key}
                onClick={() => toggleSort(col.key)}
                style={{ fontSize:10, color: sortBy === col.key ? 'var(--gold)' : 'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right', cursor:'pointer', userSelect:'none' }}
              >
                {col.label} {getSortIcon(col.key)}
              </div>
            ))}
          </div>

          {/* Rows */}
          {sorted.map((m, i) => {
            const isMe = m.user_id === profile?.id
            const isExpanded = expandedUser === m.user_id
            const userMatchPts = isExpanded ? getUserMatchPoints(m.user_id) : []
            return (
              <div key={m.id}>
                <div
                  onClick={() => setExpandedUser(isExpanded ? null : m.user_id)}
                  style={{
                    display:'grid', gridTemplateColumns:'40px 1fr 90px 70px 80px 80px', gap:8,
                    padding:'12px 14px', borderBottom:'1px solid var(--border)',
                    alignItems:'center', cursor:'pointer', transition:'background 0.15s',
                    background: isMe ? 'rgba(240,165,0,0.04)' : isExpanded ? 'rgba(255,255,255,0.02)' : 'transparent',
                    position:'relative',
                  }}
                  onMouseEnter={e => { if (!isExpanded && !isMe) e.currentTarget.style.background='rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (!isExpanded && !isMe) e.currentTarget.style.background='transparent'; if (isMe) e.currentTarget.style.background='rgba(240,165,0,0.04)' }}
                >
                  {isMe && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:2, background:'var(--gold)' }} />}
                  <div style={{ fontSize: i < 3 ? 16 : 13, fontWeight:700, color: i < 3 ? 'inherit' : 'var(--text3)', textAlign:'center' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--text2)', flexShrink:0, overflow:'hidden' }}>
                      {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.profiles?.name}</span>
                        {isMe && <span style={{ fontSize:9, background:'rgba(240,165,0,0.2)', color:'var(--gold)', borderRadius:4, padding:'1px 5px', fontWeight:700, flexShrink:0 }}>YOU</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color: isMe ? 'var(--gold)' : 'var(--text)', textAlign:'right' }}>
                    {m.total_points.toLocaleString()}
                  </div>
                  <div style={{ fontSize:13, color:'var(--text2)', textAlign:'right' }}>
                    {m.matches_played}
                  </div>
                  <div style={{ fontSize:13, color:'var(--teal)', fontWeight:600, textAlign:'right' }}>
                    {m.avg_points}
                  </div>
                  <div style={{ fontSize:13, color:'var(--text2)', textAlign:'right' }}>
                    ₹{m.purse_remaining}Cr
                  </div>
                </div>

                {/* Expanded per-match breakdown */}
                {isExpanded && (
                  <div style={{ padding:'10px 14px 14px', background:'var(--navy3)', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      Match-by-Match Points for {m.profiles?.name?.split(' ')[0]}
                    </div>
                    {userMatchPts.length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {userMatchPts.map((mp, j) => (
                          <div key={j} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', background:'var(--navy2)', borderRadius:8, border:'1px solid var(--border)' }}>
                            <div style={{ fontSize:12, color:'var(--text2)' }}>
                              {mp.match ? `${mp.match.team1} vs ${mp.match.team2}` : 'Match'}
                              {mp.match?.match_date && (
                                <span style={{ fontSize:10, color:'var(--text3)', marginLeft:6 }}>
                                  {new Date(mp.match.match_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
                                </span>
                              )}
                            </div>
                            <div style={{
                              fontFamily:'Rajdhani', fontSize:16, fontWeight:700,
                              color: mp.total_points > 0 ? 'var(--teal)' : mp.total_points < 0 ? 'var(--red)' : 'var(--text3)'
                            }}>
                              {mp.total_points > 0 ? `+${mp.total_points}` : mp.total_points}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--text3)' }}>No match points recorded yet</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Per-match leaderboard section */}
      {matches.filter(m => m.status === 'completed').length > 0 && (
        <div style={{ marginTop:28 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:14 }}>
            📊 Points by Match
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {matches.filter(m => m.status === 'completed').map(match => {
              const matchUserPts = matchPointsAll
                .filter(p => p.match_id === match.id)
                .map(p => {
                  const member = members.find(m => m.user_id === p.user_id)
                  return { ...p, member }
                })
                .filter(p => p.member)
                .sort((a, b) => b.total_points - a.total_points)

              if (matchUserPts.length === 0) return null

              return (
                <div key={match.id} style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                  <div style={{ padding:'10px 14px', background:'var(--navy3)', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700 }}>{match.team1} vs {match.team2}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                        {match.match_date ? new Date(match.match_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : ''}
                      </div>
                    </div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>
                      {matchUserPts.length} user{matchUserPts.length !== 1 ? 's' : ''} scored
                    </div>
                  </div>
                  <div>
                    {matchUserPts.map((up, j) => {
                      const isMe = up.user_id === profile?.id
                      return (
                        <div key={up.user_id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderBottom:'1px solid var(--border)', background: isMe ? 'rgba(240,165,0,0.04)' : 'transparent' }}>
                          <div style={{ fontSize:11, fontWeight:700, color: j < 3 ? 'var(--gold)' : 'var(--text3)', width:20, textAlign:'center', flexShrink:0 }}>
                            {j + 1}
                          </div>
                          <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'var(--text2)', flexShrink:0, overflow:'hidden' }}>
                            {up.member?.profiles?.avatar_url
                              ? <img src={up.member.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                              : up.member?.profiles?.name?.slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ flex:1, fontSize:12, fontWeight:isMe ? 600 : 500, color: isMe ? 'var(--gold)' : 'var(--text2)', minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {up.member?.profiles?.name}
                            {isMe && <span style={{ fontSize:9, marginLeft:4, background:'rgba(240,165,0,0.2)', color:'var(--gold)', borderRadius:3, padding:'0 4px', fontWeight:700 }}>YOU</span>}
                          </div>
                          <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color: up.total_points > 0 ? 'var(--teal)' : up.total_points < 0 ? 'var(--red)' : 'var(--text3)', flexShrink:0 }}>
                            {up.total_points > 0 ? `+${up.total_points}` : up.total_points}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
