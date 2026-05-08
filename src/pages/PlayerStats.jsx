import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getSelectedLeagueId } from '../lib/selectedLeague'
import { aggregatePlayerStats } from '../lib/playerStats'

const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.1)','Bowler':'rgba(0,212,170,0.1)','All-Rounder':'rgba(255,71,87,0.1)','WK-Batsman':'rgba(75,159,255,0.1)' }
const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }

export default function PlayerStats() {
  const { profile } = useAuth()
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState(null)
  const [matches, setMatches] = useState({})
  const [expandedPlayer, setExpandedPlayer] = useState(null)

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

      const { data: playerData } = await supabase.from('players').select('*').order('name')
      const playersMap = {}
      playerData?.forEach(p => { playersMap[p.id] = p })

      const { data: matchData } = await supabase.from('matches').select('*')
      const matchMap = {}
      matchData?.forEach(m => { matchMap[m.id] = m })
      setMatches(matchMap)

      // Try to load from player_match_performances first (new table)
      const { data: pmpData, error: pmpError } = await supabase
        .from('player_match_performances').select('*')
        .eq('user_id', profile.id)
        .eq('league_id', mem.league_id)
      if (pmpError) {
        console.error('PlayerStats pmp query error:', pmpError)
      }

      const hasPmpData = !!(pmpData && pmpData.length > 0)
      const hasMissingPmpPoints = hasPmpData && pmpData.some(perf => perf.fantasy_points === null || perf.fantasy_points === undefined)

      if (hasPmpData && !hasMissingPmpPoints) {
        const pmpPlayerIds = new Set(pmpData.map(p => p.player_id))
        const aggregated = aggregatePlayerStats(pmpData, pmpPlayerIds, playersMap)
        setStats(aggregated)
      } else {
        if (hasMissingPmpPoints) {
          console.warn('PlayerStats fallback triggered due to missing fantasy_points in player_match_performances')
        }
        // Fallback: load from performances table (legacy) with league + squad filtering
        const { data: squadData, error: squadError } = await supabase
          .from('squad').select('player_id')
          .eq('league_id', mem.league_id).eq('user_id', profile.id)
        if (squadError) throw squadError

        const squadIds = new Set(squadData?.map(s => s.player_id) || [])
        const squadPlayerIds = [...squadIds]
        if (squadPlayerIds.length === 0) {
          setStats([])
          setLoading(false)
          return
        }

        const { data: perfs, error: perfError } = await supabase
          .from('performances').select('*')
          .in('player_id', squadPlayerIds)
        if (perfError) throw perfError
        const allPerfs = perfs || []

        const aggregated = aggregatePlayerStats(allPerfs, squadIds, playersMap)
        setStats(aggregated)
      }
    } catch (e) {
      console.error('PlayerStats load error:', e)
    }
    setLoading(false)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading player stats...</div>
    </div>
  )

  const totalPoints = stats.reduce((a, s) => a + s.totalPoints, 0)

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Season 2026</div>
        <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px,5vw,36px)', fontWeight:700, marginBottom:4 }}>Player Stats</h1>
        <div style={{ color:'var(--text2)', fontSize:13 }}>
          {league ? `${league.name} · ` : ''}Track which players are contributing most to your fantasy points
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:10, marginBottom:24 }}>
        <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--gold), transparent)' }} />
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Total Points</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, color:'var(--gold)', lineHeight:1 }}>{totalPoints.toLocaleString()}</div>
        </div>
        <div style={{ background:'rgba(0,212,170,0.05)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--teal), transparent)' }} />
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Players</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, color:'var(--teal)', lineHeight:1 }}>{stats.length}</div>
        </div>
        <div style={{ background:'rgba(75,159,255,0.05)', border:'1px solid rgba(75,159,255,0.2)', borderRadius:14, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, var(--blue), transparent)' }} />
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600, marginBottom:8 }}>Best Player</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--blue)', lineHeight:1.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {stats[0]?.name || '—'}
          </div>
        </div>
      </div>

      {/* Player list */}
      {stats.length === 0 ? (
        <div style={{ padding:36, textAlign:'center', background:'var(--navy2)', border:'2px dashed var(--border)', borderRadius:18, color:'var(--text3)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📊</div>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, marginBottom:8 }}>No Player Stats Yet</h2>
          <div style={{ fontSize:13, lineHeight:1.7 }}>
            Once matches are played and performances are recorded,<br />your player stats will appear here.
          </div>
        </div>
      ) : (
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          {/* Table header */}
          <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 80px 60px 70px', gap:8, padding:'10px 14px', background:'var(--navy3)', borderBottom:'1px solid var(--border)', alignItems:'center' }}>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600 }}>#</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Player</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Total Pts</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Matches</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', textAlign:'right' }}>Avg/Match</div>
          </div>

          {stats.map((s, i) => {
            const isExpanded = expandedPlayer === s.playerId
            return (
              <div key={s.playerId}>
                <div
                  onClick={() => setExpandedPlayer(isExpanded ? null : s.playerId)}
                  style={{
                    display:'grid', gridTemplateColumns:'40px 1fr 80px 60px 70px', gap:8,
                    padding:'12px 14px', borderBottom:'1px solid var(--border)',
                    alignItems:'center', cursor:'pointer', transition:'background 0.15s',
                    background: isExpanded ? 'rgba(240,165,0,0.04)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background='rgba(255,255,255,0.02)' }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background='transparent' }}
                >
                  <div style={{ fontSize:13, fontWeight:700, color: i < 3 ? 'var(--gold)' : 'var(--text3)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                    <div style={{
                      width:32, height:32, borderRadius:8, flexShrink:0,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontFamily:'Rajdhani', fontSize:11, fontWeight:700,
                      background: ROLE_BG[s.role], color: ROLE_TEXT[s.role]
                    }}>
                      {s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.name}</div>
                      <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>
                        {s.team} · {s.role?.replace('All-Rounder','AR').replace('WK-Batsman','WK')}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--gold)', textAlign:'right' }}>
                    {s.totalPoints}
                  </div>
                  <div style={{ fontSize:13, color:'var(--text2)', textAlign:'right' }}>
                    {s.matchCount}
                  </div>
                  <div style={{ fontSize:13, color:'var(--teal)', fontWeight:600, textAlign:'right' }}>
                    {s.avgPoints}
                  </div>
                </div>

                {/* Expanded per-match breakdown */}
                {isExpanded && (
                  <div style={{ padding:'10px 14px 14px', background:'var(--navy3)', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ fontSize:11, color:'var(--text3)', fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                      Match-by-Match Breakdown
                    </div>
                    {s.matches.length > 0 ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        {s.matches.map((m, j) => {
                          const match = matches[m.matchId]
                          return (
                            <div key={j} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 10px', background:'var(--navy2)', borderRadius:8, border:'1px solid var(--border)' }}>
                              <div style={{ fontSize:12, color:'var(--text2)' }}>
                                {match ? `${match.team1} vs ${match.team2}` : 'Match'}
                                {match?.match_date && (
                                  <span style={{ fontSize:10, color:'var(--text3)', marginLeft:6 }}>
                                    {new Date(match.match_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontFamily:'Rajdhani', fontSize:16, fontWeight:700,
                                color: m.points > 0 ? 'var(--teal)' : m.points < 0 ? 'var(--red)' : 'var(--text3)'
                              }}>
                                {m.points > 0 ? `+${m.points}` : m.points}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize:12, color:'var(--text3)' }}>No match data</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
