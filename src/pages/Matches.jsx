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
    const { data: mem } = await supabase.from('league_members').select('*, leagues(*)').eq('user_id', profile.id).single()
    if (mem) { setLeague(mem.leagues); setMember(mem) }
    const { data: matchData } = await supabase.from('matches').select('*').order('match_date', { ascending: false })
    setMatches(matchData || [])
    if (mem) {
      const { data: squadData } = await supabase.from('squad').select('player_id').eq('league_id', mem.league_id).eq('user_id', profile.id)
      setMySquadIds(new Set(squadData?.map(s => s.player_id) || []))
      const { data: pts } = await supabase.from('match_points').select('*').eq('league_id', mem.league_id).eq('user_id', profile.id)
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
        setSyncMsg('No IPL matches found right now. IPL starts 22 March 2026 — try again when it begins!')
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
      setSyncMsg(`Done! ${added} new matches added. ${live.length} total IPL matches found.`)
      load()
    } catch (e) { setSyncMsg('Error: ' + e.message) }
    setSyncing(false)
  }

  async function syncMatchPoints(match) {
    if (!match.cricapi_id) { setSyncMsg('This match has no CricAPI ID yet. Sync IPL Matches first.'); return }
    setSyncing(true); setSyncMsg(`Fetching scorecard for ${match.team1} vs ${match.team2}...`)
    try {
      const scorecard = await fetchMatchScore(match.cricapi_id)
      if (!scorecard) { setSyncMsg('Scorecard not available yet. Try after the match ends.'); setSyncing(false); return }
      const perfs = parseScorecardToPerformances(scorecard)
      setSyncMsg(`Found ${perfs.length} performances. Calculating points...`)
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
      setSyncMsg(`Done! ${perfs.length} performances synced. ${pointsAdded} fantasy points added.`)
      load()
    } catch (e) { setSyncMsg('Sync error: ' + e.message) }
    setSyncing(false)
  }

  function shortenTeam(name) {
    const map = { 'mumbai indians':'MI','chennai super kings':'CSK','royal challengers bengaluru':'RCB','royal challengers bangalore':'RCB','kolkata knight riders':'KKR','rajasthan royals':'RR','delhi capitals':'DC','punjab kings':'PBKS','sunrisers hyderabad':'SRH','gujarat titans':'GT','lucknow super giants':'LSG' }
    return map[name?.toLowerCase()] || name
  }

  const totalPts = Object.values(matchPoints).reduce((a, b) => a + b, 0)
  const daysToIPL = Math.max(0, Math.floor((new Date('2026-03-22') - new Date()) / 86400000))

  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300 }}><div style={{ fontFamily:'Rajdhani',fontSize:20,color:'var(--gold)' }}>Loading...</div></div>

  return (
    <div>
      <div className="fade-in" style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:'Rajdhani',fontSize:32,fontWeight:700 }}>IPL 2026 Matches</h1>
          <div style={{ color:'var(--muted)',fontSize:14,marginTop:2 }}>Auto-synced from CricAPI · Points update after each match</div>
        </div>
        <div style={{ display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end' }}>
          <div style={{ padding:'8px 18px',background:'rgba(245,166,35,0.1)',border:'1px solid rgba(245,166,35,0.25)',borderRadius:10 }}>
            <div style={{ fontSize:10,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.8px' }}>Your Total</div>
            <div style={{ fontFamily:'Rajdhani',fontSize:24,fontWeight:700,color:'var(--gold)' }}>{totalPts.toLocaleString()} pts</div>
          </div>
          <button className="btn btn-teal" onClick={syncIPLMatches} disabled={syncing}>{syncing ? '⟳ Syncing...' : '🔄 Sync IPL Matches'}</button>
          <button className="btn btn-secondary" onClick={() => setShowGuide(!showGuide)}>📋 Points Guide</button>
        </div>
      </div>

      {syncMsg && (
        <div style={{ padding:'12px 16px',background:syncMsg.includes('Error')?'rgba(232,69,69,0.1)':'rgba(0,201,167,0.1)',border:`1px solid ${syncMsg.includes('Error')?'rgba(232,69,69,0.3)':'rgba(0,201,167,0.3)'}`,borderRadius:10,marginBottom:16,color:syncMsg.includes('Error')?'var(--red)':'var(--teal)',fontSize:14 }}>
          {syncMsg}
        </div>
      )}

      {liveMatches.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:12,display:'flex',alignItems:'center',gap:8 }}>
            <div className="live-dot" /> Live Now
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12 }}>
            {liveMatches.map(m => (
              <div key={m.id} style={{ background:'linear-gradient(135deg,#0D1A2E,#152035)',border:'1px solid rgba(232,69,69,0.3)',borderRadius:'var(--radius)',padding:16 }}>
                <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:700,marginBottom:4 }}>{m.name}</div>
                <div style={{ fontSize:12,color:'var(--muted)',marginBottom:8 }}>{m.venue}</div>
                {m.score?.map((s,i) => (
                  <div key={i} style={{ fontFamily:'Rajdhani',fontSize:15,color:'var(--text2)',marginBottom:2 }}>
                    {s.inning}: <span style={{ color:'var(--gold)',fontWeight:700 }}>{s.r}/{s.w}</span> ({s.o} ov)
                  </div>
                ))}
                <div style={{ marginTop:8,fontSize:12,color:'var(--teal)' }}>{m.status}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {matches.length === 0 && (
        <div className="fade-in card" style={{ padding:32,textAlign:'center',marginBottom:20 }}>
          <div style={{ fontSize:48,marginBottom:12 }}>🏏</div>
          <div style={{ fontFamily:'Rajdhani',fontSize:26,fontWeight:700,marginBottom:8 }}>IPL 2026 starts 22 March 2026!</div>
          <div style={{ color:'var(--muted)',fontSize:14,marginBottom:24 }}>Click "Sync IPL Matches" once IPL begins to pull all data automatically.</div>
          <div style={{ display:'flex',justifyContent:'center',gap:16 }}>
            {[
              { label:'Days', value:daysToIPL },
              { label:'Hours', value:Math.max(0,Math.floor(((new Date('2026-03-22')-new Date())%86400000)/3600000)) },
              { label:'Minutes', value:Math.max(0,Math.floor(((new Date('2026-03-22')-new Date())%3600000)/60000)) },
            ].map(c => (
              <div key={c.label} style={{ background:'var(--navy3)',borderRadius:12,padding:'16px 28px' }}>
                <div style={{ fontFamily:'Rajdhani',fontSize:40,fontWeight:700,color:'var(--gold)' }}>{c.value}</div>
                <div style={{ fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.8px' }}>{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showGuide && (
        <div className="fade-in card" style={{ padding:20,marginBottom:20 }}>
          <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:600,marginBottom:14,color:'var(--gold)' }}>Fantasy Points System</div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8 }}>
            {POINTS_GUIDE.map((g,i) => (
              <div key={i} style={{ display:'flex',justifyContent:'space-between',padding:'6px 12px',background:'var(--navy3)',borderRadius:8 }}>
                <span style={{ fontSize:12,color:'var(--text2)' }}>{g.action}</span>
                <span style={{ fontSize:13,fontWeight:700,fontFamily:'Rajdhani',color:g.pts.startsWith('+')?'var(--teal)':'var(--red)' }}>{g.pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:14 }}>
          {matches.map(m => {
            const myPts = matchPoints[m.id] || 0
            const matchPerfs = (performances[m.id]||[]).filter(p => mySquadIds.has(p.player_id))
            const statusColor = m.status==='live'?'var(--red)':m.status==='completed'?'var(--teal)':'var(--muted)'
            return (
              <div key={m.id} className="card" style={{ overflow:'hidden' }}>
                <div style={{ background:'#0A1628',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:700 }}>{m.team1} vs {m.team2}</div>
                    <div style={{ fontSize:11,color:'var(--muted)',marginTop:2 }}>
                      {m.match_date ? new Date(m.match_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : 'TBD'}
                      {m.venue && ` · ${m.venue}`}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:'Rajdhani',fontSize:22,fontWeight:700,color:myPts>0?'var(--gold)':'var(--text2)' }}>+{myPts}</div>
                    <div style={{ display:'flex',alignItems:'center',gap:4,justifyContent:'flex-end' }}>
                      {m.status==='live' && <div className="live-dot" style={{ width:6,height:6 }} />}
                      <span style={{ fontSize:10,color:statusColor,fontWeight:600,textTransform:'uppercase' }}>{m.status}</span>
                    </div>
                  </div>
                </div>
                {matchPerfs.length > 0 ? matchPerfs.slice(0,4).map(p => {
                  const { points, breakdown } = calculateFantasyPoints(p)
                  return (
                    <div key={p.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'9px 16px',borderBottom:'1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize:13,fontWeight:500 }}>{players[p.player_id]?.name||'Player'}</div>
                        <div style={{ fontSize:11,color:'var(--muted)',marginTop:1 }}>
                          {p.runs>0&&`${p.runs} runs`}{p.runs>0&&p.wickets>0&&' · '}{p.wickets>0&&`${p.wickets} wkts`}
                        </div>
                        <div style={{ fontSize:10,color:'var(--muted)',marginTop:2 }}>{breakdown.slice(0,2).map(b=>`${b.label}(${b.pts>0?'+':''}${b.pts})`).join(' · ')}</div>
                      </div>
                      <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:700,color:points>=0?'var(--teal)':'var(--red)',flexShrink:0,marginLeft:8 }}>{points>=0?'+':''}{points}</div>
                    </div>
                  )
                }) : (
                  <div style={{ padding:16,color:'var(--muted)',fontSize:13,textAlign:'center' }}>
                    {m.status==='upcoming' ? 'Match not played yet' : (
                      <div>
                        <div style={{ marginBottom:8 }}>Scorecard not synced yet</div>
                        {member?.is_admin && (
                          <button className="btn btn-teal" style={{ fontSize:12,padding:'6px 14px' }} onClick={() => syncMatchPoints(m)} disabled={syncing}>
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