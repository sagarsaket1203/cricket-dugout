import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calculateFantasyPoints, POINTS_GUIDE } from '../lib/fantasyPoints'
import { fetchCurrentMatches, fetchMatchScore, parseScorecardToPerformances } from '../lib/cricapi'

export default function Matches() {
  const { profile } = useAuth()
  const [matches, setMatches] = useState([])
  const [liveMatches, setLiveMatches] = useState([])
  const [matchPoints, setMatchPoints] = useState({})
  const [performances, setPerformances] = useState({})
  const [mySquadIds, setMySquadIds] = useState(new Set())
  const [league, setLeague] = useState(null)
  const [players, setPlayers] = useState({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [member, setMember] = useState(null)

  useEffect(() => { if (profile) load() }, [profile])
  useEffect(() => {
    const interval = setInterval(() => {
      if (liveMatches.length > 0) fetchLive()
    }, 120000)
    return () => clearInterval(interval)
  }, [liveMatches])

  async function load() {
    setLoading(true)
    try {
      const { data: mems } = await supabase.from('league_members').select('*, leagues(*)')
  .eq('user_id', profile.id)
const mem = mems?.[0]
      if (mem) { setLeague(mem.leagues); setMember(mem) }

      const { data: matchData } = await supabase
        .from('matches').select('*')
        .order('match_date', { ascending: false })
      setMatches(matchData || [])

      if (mem) {
        const { data: squadData } = await supabase
          .from('squad').select('player_id')
          .eq('league_id', mem.league_id)
          .eq('user_id', profile.id)
        setMySquadIds(new Set(squadData?.map(s => s.player_id) || []))

        const { data: pts } = await supabase
          .from('match_points').select('*')
          .eq('league_id', mem.league_id)
          .eq('user_id', profile.id)
        const ptsMap = {}
        pts?.forEach(p => { ptsMap[p.match_id] = p.total_points })
        setMatchPoints(ptsMap)

        const { data: perfs } = await supabase
          .from('performances').select('*, players(name,role)')
        const perfMap = {}
        perfs?.forEach(p => {
          if (!perfMap[p.match_id]) perfMap[p.match_id] = []
          perfMap[p.match_id].push(p)
        })
        setPerformances(perfMap)
      }

      const { data: playerData } = await supabase
        .from('players').select('id,name,role')
      const pm = {}
      playerData?.forEach(p => { pm[p.id] = p })
      setPlayers(pm)

      await fetchLive()
    } catch (e) {
      console.error('Matches load error:', e)
    }
    setLoading(false)
  }

  async function fetchLive() {
    try {
      const live = await fetchCurrentMatches()
      setLiveMatches(live)
    } catch (e) {
      console.log('Live fetch skipped')
    }
  }

  async function syncIPLMatches() {
    setSyncing(true)
    setSyncMsg('Fetching IPL matches from CricAPI...')
    try {
      const live = await fetchCurrentMatches()
      if (live.length === 0) {
        setSyncMsg('No IPL matches found right now. IPL 2026 starts 28 March — try again on or after that date!')
        setSyncing(false)
        return
      }
      let added = 0
      for (const m of live) {
        const team1 = shortenTeam(m.teamInfo?.[0]?.name || m.teams?.[0] || 'TBD')
        const team2 = shortenTeam(m.teamInfo?.[1]?.name || m.teams?.[1] || 'TBD')
        const status = m.matchStarted && !m.matchEnded ? 'live' : m.matchEnded ? 'completed' : 'upcoming'
        const { data: existing } = await supabase
          .from('matches').select('id')
          .eq('cricapi_id', m.id).maybeSingle()
        if (!existing) {
          await supabase.from('matches').insert({
            team1, team2,
            match_date: m.dateTimeGMT || m.date,
            venue: m.venue || '',
            status,
            cricapi_id: m.id
          })
          added++
        } else {
          await supabase.from('matches').update({ status }).eq('cricapi_id', m.id)
        }
      }
      setSyncMsg(`✅ Synced! ${added} new matches added. ${live.length} IPL matches found.`)
      load()
    } catch (e) {
      setSyncMsg('Error: ' + e.message)
    }
    setSyncing(false)
  }

  async function syncMatchPoints(match) {
    if (!match.cricapi_id) {
      setSyncMsg('No CricAPI ID — sync matches first.')
      return
    }
    setSyncing(true)
    setSyncMsg(`Fetching scorecard for ${match.team1} vs ${match.team2}...`)
    try {
      const scorecard = await fetchMatchScore(match.cricapi_id)
      if (!scorecard) {
        setSyncMsg('Scorecard not available yet. Try after match ends.')
        setSyncing(false)
        return
      }
      const perfs = parseScorecardToPerformances(scorecard)
      let pointsAdded = 0
      for (const perf of perfs) {
        const lastName = perf.playerName.split(' ').pop()
        const { data: playerRows } = await supabase
          .from('players').select('id,name')
          .ilike('name', `%${lastName}%`)
        if (!playerRows?.length) continue
        const player = playerRows.find(p =>
          p.name.toLowerCase().includes(perf.playerName.toLowerCase().split(' ')[0])
        ) || playerRows[0]
        const { points } = calculateFantasyPoints(perf)
        await supabase.from('performances').upsert({
          match_id: match.id, player_id: player.id,
          ...perf, fantasy_points: points
        }, { onConflict: 'match_id,player_id' })
        if (league) {
          const { data: sq } = await supabase.from('squad').select('user_id')
            .eq('player_id', player.id).eq('league_id', league.id).maybeSingle()
          if (sq) {
            const { data: ex } = await supabase.from('match_points').select('*')
              .eq('match_id', match.id).eq('user_id', sq.user_id)
              .eq('league_id', league.id).maybeSingle()
            if (ex) {
              await supabase.from('match_points')
                .update({ total_points: ex.total_points + points }).eq('id', ex.id)
            } else {
              await supabase.from('match_points').insert({
                match_id: match.id, user_id: sq.user_id,
                league_id: league.id, total_points: points
              })
            }
            pointsAdded += points
          }
        }
      }
      setSyncMsg(`✅ Done! ${perfs.length} performances synced. +${pointsAdded} fantasy pts.`)
      load()
    } catch (e) {
      setSyncMsg('Error: ' + e.message)
    }
    setSyncing(false)
  }

  function shortenTeam(name) {
    const map = {
      'mumbai indians':'MI','chennai super kings':'CSK',
      'royal challengers bengaluru':'RCB','royal challengers bangalore':'RCB',
      'kolkata knight riders':'KKR','rajasthan royals':'RR',
      'delhi capitals':'DC','punjab kings':'PBKS',
      'sunrisers hyderabad':'SRH','gujarat titans':'GT',
      'lucknow super giants':'LSG'
    }
    return map[name?.toLowerCase()] || name
  }

  const totalPts = Object.values(matchPoints).reduce((a, b) => a + b, 0)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading matches...</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ marginBottom:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Season 2026</div>
            <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px,5vw,36px)', fontWeight:700, marginBottom:4 }}>IPL Matches</h1>
            <div style={{ color:'var(--text2)', fontSize:13 }}>Auto-synced · Points update after each match</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ padding:'8px 14px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10 }}>
              <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px' }}>Your Total</div>
              <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--gold)', lineHeight:1.1 }}>{totalPts.toLocaleString()} pts</div>
            </div>
            <button className="btn btn-teal" onClick={syncIPLMatches} disabled={syncing} style={{ fontSize:13 }}>
              {syncing ? '⟳ Syncing...' : '🔄 Sync'}
            </button>
            <button className="btn btn-ghost" onClick={() => setShowGuide(!showGuide)} style={{ fontSize:13 }}>
              📋 Guide
            </button>
          </div>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div style={{ padding:'10px 14px', background:syncMsg.includes('Error')?'var(--red2)':'var(--teal2)', border:`1px solid ${syncMsg.includes('Error')?'rgba(255,71,87,0.3)':'rgba(0,212,170,0.3)'}`, borderRadius:10, marginBottom:14, color:syncMsg.includes('Error')?'var(--red)':'var(--teal)', fontSize:13, fontWeight:500 }}>
          {syncMsg}
        </div>
      )}

      {/* Live matches from API */}
      {liveMatches.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <div className="live-dot" />
            <h2 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700 }}>Live Now</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:10 }}>
            {liveMatches.map(m => (
              <div key={m.id} style={{ background:'linear-gradient(135deg, rgba(255,71,87,0.08), var(--navy2))', border:'1px solid rgba(255,71,87,0.2)', borderRadius:14, padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div>
                    <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, marginBottom:2 }}>{m.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{m.venue}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, background:'var(--red2)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:20, padding:'3px 8px', flexShrink:0 }}>
                    <div className="live-dot" style={{ width:5, height:5 }} />
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--red)' }}>LIVE</span>
                  </div>
                </div>
                {m.score?.map((s, i) => (
                  <div key={i} style={{ fontFamily:'Rajdhani', fontSize:14, color:'var(--text2)', marginBottom:2 }}>
                    {s.inning}: <span style={{ color:'var(--gold)', fontWeight:700 }}>{s.r}/{s.w}</span> ({s.o} ov)
                  </div>
                ))}
                <div style={{ marginTop:8, fontSize:11, color:'var(--teal)' }}>{m.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No matches yet - IPL not started */}
      {matches.length === 0 && (
        <div style={{ padding:36, textAlign:'center', marginBottom:20, background:'linear-gradient(135deg, rgba(240,165,0,0.05), var(--navy2))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:18 }}>
          <div style={{ fontSize:52, marginBottom:14 }}>🏏</div>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:26, fontWeight:700, marginBottom:8 }}>
            IPL 2026 — Ready to Sync!
          </h2>
          <div style={{ color:'var(--text2)', fontSize:14, marginBottom:6, lineHeight:1.7 }}>
            IPL 2026 starts <span style={{ color:'var(--gold)', fontWeight:700 }}>28 March 2026</span>.<br />
            Once matches begin, click Sync to pull all live data automatically.
          </div>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:24, padding:'8px 16px', background:'var(--navy3)', borderRadius:10, display:'inline-block' }}>
            🤖 CricAPI will detect all IPL 2026 matches automatically — no manual setup needed
          </div>
          <div>
            <button className="btn btn-primary" onClick={syncIPLMatches} disabled={syncing} style={{ padding:'12px 28px', fontSize:15 }}>
              {syncing ? '⟳ Syncing...' : '🔄 Sync IPL Matches'}
            </button>
          </div>
        </div>
      )}

      {/* Points guide */}
      {showGuide && (
        <div className="fade-in card" style={{ padding:20, marginBottom:20 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:14, color:'var(--gold)' }}>
            Fantasy Points System
          </h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:6 }}>
            {POINTS_GUIDE.map((g, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 10px', background:'var(--navy3)', borderRadius:8, border:'1px solid var(--border)' }}>
                <span style={{ fontSize:11, color:'var(--text2)' }}>{g.action}</span>
                <span style={{ fontSize:13, fontWeight:700, fontFamily:'Rajdhani', color:g.pts.startsWith('+')?'var(--teal)':'var(--red)' }}>{g.pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match cards */}
      {matches.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:12 }}>
          {matches.map(m => {
            const myPts = matchPoints[m.id] || 0
            const matchPerfs = (performances[m.id] || []).filter(p => mySquadIds.has(p.player_id))
            const isLive = m.status === 'live'
            const isDone = m.status === 'completed'
            const statusColor = isLive ? 'var(--red)' : isDone ? 'var(--teal)' : 'var(--text3)'
            const statusBg = isLive ? 'var(--red2)' : isDone ? 'var(--teal2)' : 'var(--navy4)'

            return (
              <div key={m.id} style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', transition:'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--border2)'; e.currentTarget.style.transform='translateY(-1px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)' }}>

                {/* Match header */}
                <div style={{ background:'var(--navy3)', padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700 }}>{m.team1} vs {m.team2}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {m.match_date ? new Date(m.match_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'Date TBD'}
                      {m.venue && ` · ${m.venue}`}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginLeft:10 }}>
                    <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:myPts>0?'var(--gold)':'var(--text3)' }}>
                      {myPts > 0 ? `+${myPts}` : '—'}
                    </div>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:20, background:statusBg, marginTop:2 }}>
                      {isLive && <div className="live-dot" style={{ width:5, height:5 }} />}
                      <span style={{ fontSize:9, color:statusColor, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{m.status}</span>
                    </div>
                  </div>
                </div>

                {/* Performances */}
                {matchPerfs.length > 0 ? (
                  <>
                    {matchPerfs.slice(0, 3).map(p => {
                      const { points, breakdown } = calculateFantasyPoints(p)
                      return (
                        <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {players[p.player_id]?.name || 'Player'}
                            </div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                              {p.runs > 0 && `${p.runs}r`}
                              {p.runs > 0 && p.wickets > 0 && ' · '}
                              {p.wickets > 0 && `${p.wickets}w`}
                              {p.catches > 0 && ` · ${p.catches}c`}
                            </div>
                            <div style={{ fontSize:10, color:'var(--text3)', marginTop:1 }}>
                              {breakdown.slice(0,2).map(b => `${b.label}(${b.pts>0?'+':''}${b.pts})`).join(' · ')}
                            </div>
                          </div>
                          <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:points>=0?'var(--teal)':'var(--red)', flexShrink:0, marginLeft:10 }}>
                            {points >= 0 ? `+${points}` : points}
                          </div>
                        </div>
                      )
                    })}
                    {matchPerfs.length > 3 && (
                      <div style={{ padding:'8px 14px', fontSize:11, color:'var(--text3)', textAlign:'center', borderBottom:'1px solid var(--border)' }}>
                        +{matchPerfs.length - 3} more players
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding:16, color:'var(--text3)', fontSize:13, textAlign:'center' }}>
                    {m.status === 'upcoming' ? (
                      <div>
                        <div style={{ fontSize:20, marginBottom:4 }}>📅</div>
                        <div>Match not played yet</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ marginBottom:10 }}>Scorecard not synced yet</div>
                        {member?.is_admin && (
                          <button className="btn btn-teal" style={{ fontSize:12, padding:'5px 12px' }}
                            onClick={() => syncMatchPoints(m)} disabled={syncing}>
                            🔄 Sync Scorecard
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Match total */}
                {myPts > 0 && (
                  <div style={{ padding:'8px 14px', background:'rgba(240,165,0,0.04)', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid rgba(240,165,0,0.1)' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>Your total this match</span>
                    <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>+{myPts} pts</span>
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