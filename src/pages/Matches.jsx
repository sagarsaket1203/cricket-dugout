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
    const interval = setInterval(() => { if (liveMatches.length > 0) fetchLive() }, 120000)
    return () => clearInterval(interval)
  }, [liveMatches])

  async function load() {
    setLoading(true)
    const { data: mem } = await supabase.from('league_members').select('*, leagues(*)')
      .eq('user_id', profile.id).single()
    if (mem) { setLeague(mem.leagues); setMember(mem) }
    const { data: matchData } = await supabase.from('matches').select('*').order('match_date', { ascending: false })
    setMatches(matchData || [])
    if (mem) {
      const { data: squadData } = await supabase.from('squad').select('player_id')
        .eq('league_id', mem.league_id).eq('user_id', profile.id)
      setMySquadIds(new Set(squadData?.map(s => s.player_id) || []))
      const { data: pts } = await supabase.from('match_points').select('*')
        .eq('league_id', mem.league_id).eq('user_id', profile.id)
      const ptsMap = {}
      pts?.forEach(p => { ptsMap[p.match_id] = p.total_points })
      setMatchPoints(ptsMap)
      const { data: perfs } = await supabase.from('performances').select('*, players(name, role)')
      const perfMap = {}
      perfs?.forEach(p => { if (!perfMap[p.match_id]) perfMap[p.match_id] = []; perfMap[p.match_id].push(p) })
      setPerformances(perfMap)
    }
    const { data: playerData } = await supabase.from('players').select('id, name, role')
    const pm = {}
    playerData?.forEach(p => { pm[p.id] = p })
    setPlayers(pm)
    await fetchLive()
    setLoading(false)
  }

  async function fetchLive() {
    try { const live = await fetchCurrentMatches(); setLiveMatches(live) }
    catch (e) { console.log('Live fetch skipped') }
  }

  async function syncIPLMatches() {
    setSyncing(true); setSyncMsg('Fetching IPL matches from CricAPI...')
    try {
      const live = await fetchCurrentMatches()
      if (live.length === 0) {
        setSyncMsg('No IPL matches right now. IPL starts 22 March 2026!')
        setSyncing(false); return
      }
      let added = 0
      for (const m of live) {
        const team1 = shortenTeam(m.teamInfo?.[0]?.name || m.teams?.[0] || 'TBD')
        const team2 = shortenTeam(m.teamInfo?.[1]?.name || m.teams?.[1] || 'TBD')
        const status = m.matchStarted && !m.matchEnded ? 'live' : m.matchEnded ? 'completed' : 'upcoming'
        const { data: existing } = await supabase.from('matches').select('id').eq('cricapi_id', m.id).maybeSingle()
        if (!existing) {
          await supabase.from('matches').insert({ team1, team2, match_date: m.dateTimeGMT || m.date, venue: m.venue || '', status, cricapi_id: m.id })
          added++
        } else {
          await supabase.from('matches').update({ status }).eq('cricapi_id', m.id)
        }
      }
      setSyncMsg(`✅ Synced! ${added} new matches added.`)
      load()
    } catch (e) { setSyncMsg('Error: ' + e.message) }
    setSyncing(false)
  }

  async function syncMatchPoints(match) {
    if (!match.cricapi_id) { setSyncMsg('No CricAPI ID — sync IPL matches first.'); return }
    setSyncing(true); setSyncMsg(`Fetching scorecard for ${match.team1} vs ${match.team2}...`)
    try {
      const scorecard = await fetchMatchScore(match.cricapi_id)
      if (!scorecard) { setSyncMsg('Scorecard not available yet.'); setSyncing(false); return }
      const perfs = parseScorecardToPerformances(scorecard)
      let pointsAdded = 0
      for (const perf of perfs) {
        const lastName = perf.playerName.split(' ').pop()
        const { data: playerRows } = await supabase.from('players').select('id, name').ilike('name', `%${lastName}%`)
        if (!playerRows || playerRows.length === 0) continue
        const player = playerRows.find(p => p.name.toLowerCase().includes(perf.playerName.toLowerCase().split(' ')[0])) || playerRows[0]
        const { points } = calculateFantasyPoints(perf)
        await supabase.from('performances').upsert({ match_id: match.id, player_id: player.id, ...perf, fantasy_points: points }, { onConflict: 'match_id,player_id' })
        if (league) {
          const { data: sq } = await supabase.from('squad').select('user_id').eq('player_id', player.id).eq('league_id', league.id).maybeSingle()
          if (sq) {
            const { data: ex } = await supabase.from('match_points').select('*').eq('match_id', match.id).eq('user_id', sq.user_id).eq('league_id', league.id).maybeSingle()
            if (ex) await supabase.from('match_points').update({ total_points: ex.total_points + points }).eq('id', ex.id)
            else await supabase.from('match_points').insert({ match_id: match.id, user_id: sq.user_id, league_id: league.id, total_points: points })
            pointsAdded += points
          }
        }
      }
      setSyncMsg(`✅ Done! ${perfs.length} performances synced. ${pointsAdded} fantasy points added.`)
      load()
    } catch (e) { setSyncMsg('Error: ' + e.message) }
    setSyncing(false)
  }

  function shortenTeam(name) {
    const map = { 'mumbai indians':'MI','chennai super kings':'CSK','royal challengers bengaluru':'RCB','royal challengers bangalore':'RCB','kolkata knight riders':'KKR','rajasthan royals':'RR','delhi capitals':'DC','punjab kings':'PBKS','sunrisers hyderabad':'SRH','gujarat titans':'GT','lucknow super giants':'LSG' }
    return map[name?.toLowerCase()] || name
  }

  const totalPts = Object.values(matchPoints).reduce((a, b) => a + b, 0)
  const daysToIPL = Math.max(0, Math.floor((new Date('2026-03-22') - new Date()) / 86400000))
  const hoursToIPL = Math.max(0, Math.floor(((new Date('2026-03-22') - new Date()) % 86400000) / 3600000))
  const minsToIPL = Math.max(0, Math.floor(((new Date('2026-03-22') - new Date()) % 3600000) / 60000))

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading matches...</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:32 }}>
        <div>
          <div style={{ fontSize:12, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:6 }}>Season 2026</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:36, fontWeight:700, marginBottom:4 }}>IPL Matches</h1>
          <div style={{ color:'var(--text2)', fontSize:14 }}>Auto-synced from CricAPI · Points calculated after each match</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
          <div style={{ padding:'10px 20px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12 }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', fontWeight:600 }}>Your Total</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:26, fontWeight:700, color:'var(--gold)', lineHeight:1.1 }}>{totalPts.toLocaleString()} <span style={{ fontSize:14, fontWeight:500 }}>pts</span></div>
          </div>
          <button className="btn btn-teal" onClick={syncIPLMatches} disabled={syncing} style={{ padding:'10px 18px' }}>
            {syncing ? '⟳ Syncing...' : '🔄 Sync Matches'}
          </button>
          <button className="btn btn-ghost" onClick={() => setShowGuide(!showGuide)} style={{ padding:'10px 18px' }}>
            📋 Points Guide
          </button>
        </div>
      </div>

      {/* Sync message */}
      {syncMsg && (
        <div className="fade-in" style={{ padding:'12px 16px', background:syncMsg.includes('Error')?'var(--red2)':'var(--teal2)', border:`1px solid ${syncMsg.includes('Error')?'rgba(255,71,87,0.3)':'rgba(0,212,170,0.3)'}`, borderRadius:10, marginBottom:16, color:syncMsg.includes('Error')?'var(--red)':'var(--teal)', fontSize:14, fontWeight:500 }}>
          {syncMsg}
        </div>
      )}

      {/* Live matches */}
      {liveMatches.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            <div className="live-dot" />
            <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>Live Now</h2>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
            {liveMatches.map(m => (
              <div key={m.id} style={{ background:'linear-gradient(135deg, rgba(255,71,87,0.08), rgba(12,21,36,0.9))', border:'1px solid rgba(255,71,87,0.2)', borderRadius:16, padding:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div>
                    <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:2 }}>{m.name}</div>
                    <div style={{ fontSize:12, color:'var(--text3)' }}>{m.venue}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:5, background:'var(--red2)', border:'1px solid rgba(255,71,87,0.3)', borderRadius:20, padding:'4px 10px' }}>
                    <div className="live-dot" style={{ width:6, height:6 }} />
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--red)' }}>LIVE</span>
                  </div>
                </div>
                {m.score?.map((s, i) => (
                  <div key={i} style={{ fontFamily:'Rajdhani', fontSize:16, color:'var(--text2)', marginBottom:4 }}>
                    <span style={{ color:'var(--text3)', fontSize:13 }}>{s.inning}: </span>
                    <span style={{ color:'var(--gold)', fontWeight:700, fontSize:18 }}>{s.r}/{s.w}</span>
                    <span style={{ color:'var(--text3)', fontSize:13 }}> ({s.o} ov)</span>
                  </div>
                ))}
                <div style={{ marginTop:10, fontSize:12, color:'var(--teal)', fontStyle:'italic' }}>{m.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Countdown */}
      {matches.length === 0 && (
        <div className="fade-up card" style={{ padding:48, textAlign:'center', marginBottom:24, background:'linear-gradient(135deg, rgba(240,165,0,0.05), var(--navy2))', border:'1px solid rgba(240,165,0,0.15)' }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🏏</div>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:32, fontWeight:700, marginBottom:8 }}>IPL 2026 starts 22 March!</h2>
          <div style={{ color:'var(--text2)', fontSize:14, marginBottom:28 }}>Click "Sync Matches" once IPL begins to pull all data automatically.</div>
          <div style={{ display:'flex', justifyContent:'center', gap:16 }}>
            {[{ label:'Days', value:daysToIPL }, { label:'Hours', value:hoursToIPL }, { label:'Minutes', value:minsToIPL }].map(c => (
              <div key={c.label} style={{ background:'var(--navy3)', borderRadius:14, padding:'20px 32px', border:'1px solid var(--border)' }}>
                <div style={{ fontFamily:'Rajdhani', fontSize:48, fontWeight:700, color:'var(--gold)', lineHeight:1 }}>{c.value}</div>
                <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', marginTop:4 }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Points guide */}
      {showGuide && (
        <div className="fade-in card" style={{ padding:24, marginBottom:24 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:16, color:'var(--gold)' }}>Fantasy Points Scoring System</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {POINTS_GUIDE.map((g, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--navy3)', borderRadius:8, border:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--text2)' }}>{g.action}</span>
                <span style={{ fontSize:14, fontWeight:700, fontFamily:'Rajdhani', color:g.pts.startsWith('+')?'var(--teal)':'var(--red)' }}>{g.pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Match cards */}
      {matches.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {matches.map(m => {
            const myPts = matchPoints[m.id] || 0
            const matchPerfs = (performances[m.id] || []).filter(p => mySquadIds.has(p.player_id))
            const statusColor = m.status==='live'?'var(--red)':m.status==='completed'?'var(--teal)':'var(--text3)'
            const statusBg = m.status==='live'?'var(--red2)':m.status==='completed'?'var(--teal2)':'var(--navy4)'
            return (
              <div key={m.id} style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden', transition:'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--border2)'; e.currentTarget.style.transform='translateY(-2px)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)' }}>
                <div style={{ background:'var(--navy3)', padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>{m.team1} vs {m.team2}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {m.match_date ? new Date(m.match_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'TBD'}
                      {m.venue && ` · ${m.venue}`}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:myPts>0?'var(--gold)':'var(--text3)' }}>+{myPts}</div>
                    <div style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, background:statusBg, marginTop:2 }}>
                      {m.status==='live' && <div className="live-dot" style={{ width:5, height:5 }} />}
                      <span style={{ fontSize:9, color:statusColor, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{m.status}</span>
                    </div>
                  </div>
                </div>

                {matchPerfs.length > 0 ? matchPerfs.slice(0,4).map(p => {
                  const { points, breakdown } = calculateFantasyPoints(p)
                  return (
                    <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'10px 18px', borderBottom:'1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{players[p.player_id]?.name || 'Player'}</div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                          {p.runs > 0 && `${p.runs} runs`}{p.runs > 0 && p.wickets > 0 && ' · '}{p.wickets > 0 && `${p.wickets} wkts`}{p.catches > 0 && ` · ${p.catches} catch`}
                        </div>
                        <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>{breakdown.slice(0,2).map(b => `${b.label}(${b.pts>0?'+':''}${b.pts})`).join(' · ')}</div>
                      </div>
                      <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:points>=0?'var(--teal)':'var(--red)', flexShrink:0, marginLeft:12 }}>{points>=0?'+':''}{points}</div>
                    </div>
                  )
                }) : (
                  <div style={{ padding:20, color:'var(--text3)', fontSize:13, textAlign:'center' }}>
                    {m.status==='upcoming' ? (
                      <div>
                        <div style={{ fontSize:24, marginBottom:6 }}>📅</div>
                        <div>Match not played yet</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ marginBottom:10 }}>Scorecard not synced yet</div>
                        {member?.is_admin && (
                          <button className="btn btn-teal" style={{ fontSize:12, padding:'6px 14px' }} onClick={() => syncMatchPoints(m)} disabled={syncing}>
                            🔄 Sync Scorecard
                          </button>
                        )}
                      </div>
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