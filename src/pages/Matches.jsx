import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { calculateFantasyPoints, POINTS_GUIDE } from '../lib/fantasyPoints'
import { getSelectedLeagueId } from '../lib/selectedLeague'

export default function Matches() {
  const { profile } = useAuth()
  const [matches, setMatches] = useState([])
  const [matchPoints, setMatchPoints] = useState({})
  const [performances, setPerformances] = useState({})
  const [mySquadIds, setMySquadIds] = useState(new Set())
  const [league, setLeague] = useState(null)
  const [players, setPlayers] = useState({})
  const [loading, setLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(false)
  const [member, setMember] = useState(null)
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [showAddPerf, setShowAddPerf] = useState(null)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [allPlayers, setAllPlayers] = useState([])

  // Add match form
  const [newMatch, setNewMatch] = useState({ team1:'', team2:'', venue:'', match_date:'', status:'completed' })
  // Add performance form
  const [perfForm, setPerfForm] = useState({ player_id:'', runs:0, balls:0, fours:0, sixes:0, wickets:0, overs:0, maidens:0, runsConceded:0, catches:0, stumpings:0, runOuts:0, dismissalType:'' })

  const TEAMS = ['MI','CSK','RCB','KKR','RR','DC','PBKS','SRH','GT','LSG']

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
    try {
      const { data: mems } = await supabase
        .from('league_members').select('*, leagues(*)')
        .eq('user_id', profile.id)
      const savedId = getSelectedLeagueId()
      const mem = (savedId && mems?.find(m => m.league_id === savedId)) || mems?.[0]
      if (mem) { setLeague(mem.leagues); setMember(mem) }

      const { data: matchData } = await supabase
        .from('matches').select('*')
        .order('match_date', { ascending: false })
      setMatches(matchData || [])

      if (mem) {
        const { data: squadData } = await supabase
          .from('squad').select('player_id')
          .eq('league_id', mem.league_id).eq('user_id', profile.id)
        setMySquadIds(new Set(squadData?.map(s => s.player_id) || []))

        const { data: pts } = await supabase
          .from('match_points').select('*')
          .eq('league_id', mem.league_id).eq('user_id', profile.id)
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

      const { data: playerData } = await supabase.from('players').select('*').order('name')
      const pm = {}
      playerData?.forEach(p => { pm[p.id] = p })
      setPlayers(pm)
      setAllPlayers(playerData || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function showMsg(text, type = 'success') {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  async function addMatch() {
    if (!newMatch.team1 || !newMatch.team2) { showMsg('Select both teams!', 'error'); return }
    const { error } = await supabase.from('matches').insert({
      team1: newMatch.team1, team2: newMatch.team2,
      venue: newMatch.venue, match_date: newMatch.match_date || new Date().toISOString(),
      status: newMatch.status
    })
    if (error) { showMsg('Error: ' + error.message, 'error'); return }
    showMsg('Match added!')
    setShowAddMatch(false)
    setNewMatch({ team1:'', team2:'', venue:'', match_date:'', status:'completed' })
    load()
  }

  async function deleteMatch(matchId) {
    if (!confirm('Delete this match and all its performances?')) return
    await supabase.from('match_points').delete().eq('match_id', matchId)
    await supabase.from('performances').delete().eq('match_id', matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    showMsg('Match deleted.')
    load()
  }

  async function addPerformance() {
    if (!perfForm.player_id) { showMsg('Select a player!', 'error'); return }
    if (!showAddPerf) return

    const perf = {
      runs: parseInt(perfForm.runs) || 0,
      balls: parseInt(perfForm.balls) || 0,
      fours: parseInt(perfForm.fours) || 0,
      sixes: parseInt(perfForm.sixes) || 0,
      wickets: parseInt(perfForm.wickets) || 0,
      overs: parseFloat(perfForm.overs) || 0,
      maidens: parseInt(perfForm.maidens) || 0,
      runsConceded: parseInt(perfForm.runsConceded) || 0,
      catches: parseInt(perfForm.catches) || 0,
      stumpings: parseInt(perfForm.stumpings) || 0,
      runOuts: parseInt(perfForm.runOuts) || 0,
      dismissalType: perfForm.dismissalType || '',
    }

    const { points } = calculateFantasyPoints(perf)

    await supabase.from('performances').upsert({
      match_id: showAddPerf, player_id: perfForm.player_id, ...perf, fantasy_points: points
    }, { onConflict: 'match_id,player_id' })

    // Update match points for all leagues
    if (league) {
      const { data: sq } = await supabase.from('squad').select('user_id, league_id')
        .eq('player_id', perfForm.player_id)
      for (const s of sq || []) {
        const { data: ex } = await supabase.from('match_points').select('*')
          .eq('match_id', showAddPerf).eq('user_id', s.user_id).eq('league_id', s.league_id).maybeSingle()
        if (ex) {
          await supabase.from('match_points').update({ total_points: ex.total_points + points }).eq('id', ex.id)
        } else {
          await supabase.from('match_points').insert({
            match_id: showAddPerf, user_id: s.user_id, league_id: s.league_id, total_points: points
          })
        }
      }
    }

    showMsg(`${players[perfForm.player_id]?.name} — +${points} pts added!`)
    setPerfForm({ player_id:'', runs:0, balls:0, fours:0, sixes:0, wickets:0, overs:0, maidens:0, runsConceded:0, catches:0, stumpings:0, runOuts:0, dismissalType:'' })
    load()
  }

  async function updateMatchStatus(matchId, status) {
    await supabase.from('matches').update({ status }).eq('id', matchId)
    load()
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
            <div style={{ color:'var(--text2)', fontSize:13 }}>Add matches manually · Points auto-calculated</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ padding:'8px 14px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10 }}>
              <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px' }}>Your Total</div>
              <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--gold)', lineHeight:1.1 }}>{totalPts.toLocaleString()} pts</div>
            </div>
            {member?.is_admin && (
              <button className="btn btn-primary" onClick={() => setShowAddMatch(!showAddMatch)} style={{ fontSize:13 }}>
                {showAddMatch ? '✕ Cancel' : '+ Add Match'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setShowGuide(!showGuide)} style={{ fontSize:13 }}>
              📋 Points Guide
            </button>
          </div>
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{ padding:'10px 14px', background:msgType==='error'?'var(--red2)':'var(--teal2)', border:`1px solid ${msgType==='error'?'rgba(255,71,87,0.3)':'rgba(0,212,170,0.3)'}`, borderRadius:10, marginBottom:14, color:msgType==='error'?'var(--red)':'var(--teal)', fontSize:13, fontWeight:500 }}>
          {msg}
        </div>
      )}

      {/* Add Match Form */}
      {showAddMatch && member?.is_admin && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:16, padding:20, marginBottom:20 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:16 }}>Add IPL Match</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:10, marginBottom:14 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Team 1</div>
              <select className="input" value={newMatch.team1} onChange={e => setNewMatch({...newMatch, team1:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                <option value="">Select team</option>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Team 2</div>
              <select className="input" value={newMatch.team2} onChange={e => setNewMatch({...newMatch, team2:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                <option value="">Select team</option>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Venue</div>
              <input className="input" placeholder="Stadium" value={newMatch.venue} onChange={e => setNewMatch({...newMatch, venue:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Date</div>
              <input className="input" type="date" value={newMatch.match_date} onChange={e => setNewMatch({...newMatch, match_date:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Status</div>
              <select className="input" value={newMatch.status} onChange={e => setNewMatch({...newMatch, status:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                <option value="completed">Completed</option>
                <option value="live">Live</option>
                <option value="upcoming">Upcoming</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary" onClick={addMatch} style={{ fontSize:13, padding:'8px 20px' }}>
            Add Match
          </button>
        </div>
      )}

      {/* Points guide */}
      {showGuide && (
        <div className="fade-in card" style={{ padding:20, marginBottom:20 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:14, color:'var(--gold)' }}>Fantasy Points System</h3>
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

      {/* No matches */}
      {matches.length === 0 && (
        <div style={{ padding:36, textAlign:'center', marginBottom:20, background:'linear-gradient(135deg, rgba(240,165,0,0.05), var(--navy2))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:18 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏏</div>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, marginBottom:8 }}>IPL 2026 has started!</h2>
          <div style={{ color:'var(--text2)', fontSize:14, marginBottom:20, lineHeight:1.7 }}>
            RCB beat SRH by 6 wickets in the opener.<br />
            Admin can add matches manually using the <strong style={{ color:'var(--gold)' }}>+ Add Match</strong> button above.
          </div>
          {member?.is_admin && (
            <button className="btn btn-primary" onClick={() => setShowAddMatch(true)} style={{ padding:'12px 28px', fontSize:15 }}>
              + Add First Match
            </button>
          )}
        </div>
      )}

      {/* Add Performance Panel */}
      {showAddPerf && member?.is_admin && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--teal)' }}>
              Add Player Performance
            </h3>
            <button onClick={() => setShowAddPerf(null)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:18 }}>✕</button>
          </div>

          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Select Player</div>
            <select className="input" value={perfForm.player_id} onChange={e => setPerfForm({...perfForm, player_id:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
              <option value="">-- Select Player --</option>
              {allPlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.team})</option>)}
            </select>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px,1fr))', gap:8, marginBottom:14 }}>
            {[
              { key:'runs', label:'Runs' },
              { key:'balls', label:'Balls' },
              { key:'fours', label:'4s' },
              { key:'sixes', label:'6s' },
              { key:'wickets', label:'Wickets' },
              { key:'overs', label:'Overs' },
              { key:'runsConceded', label:'Runs Given' },
              { key:'maidens', label:'Maidens' },
              { key:'catches', label:'Catches' },
              { key:'stumpings', label:'Stumpings' },
              { key:'runOuts', label:'Run Outs' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize:10, color:'var(--text3)', marginBottom:3 }}>{f.label}</div>
                <input className="input" type="number" min={0} value={perfForm[f.key]}
                  onChange={e => setPerfForm({...perfForm, [f.key]: e.target.value})}
                  style={{ padding:'6px 8px', fontSize:13, textAlign:'center' }} />
              </div>
            ))}
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Dismissal Type (optional)</div>
            <select className="input" value={perfForm.dismissalType} onChange={e => setPerfForm({...perfForm, dismissalType:e.target.value})} style={{ padding:'8px 10px', fontSize:13, width:'auto' }}>
              <option value="">Not out / N/A</option>
              <option value="bowled">Bowled</option>
              <option value="lbw">LBW</option>
              <option value="caught">Caught</option>
              <option value="run out">Run Out</option>
              <option value="stumped">Stumped</option>
            </select>
          </div>

          {/* Points preview */}
          {perfForm.player_id && (
            <div style={{ padding:'10px 14px', background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, marginBottom:14, fontSize:13 }}>
              <span style={{ color:'var(--text2)' }}>Fantasy Points: </span>
              <span style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--gold)' }}>
                +{calculateFantasyPoints({
                  runs: parseInt(perfForm.runs)||0, balls: parseInt(perfForm.balls)||0,
                  fours: parseInt(perfForm.fours)||0, sixes: parseInt(perfForm.sixes)||0,
                  wickets: parseInt(perfForm.wickets)||0, overs: parseFloat(perfForm.overs)||0,
                  runsConceded: parseInt(perfForm.runsConceded)||0, maidens: parseInt(perfForm.maidens)||0,
                  catches: parseInt(perfForm.catches)||0, stumpings: parseInt(perfForm.stumpings)||0,
                  runOuts: parseInt(perfForm.runOuts)||0, dismissalType: perfForm.dismissalType
                }).points} pts
              </span>
            </div>
          )}

          <button className="btn btn-teal" onClick={addPerformance} style={{ fontSize:13, padding:'10px 24px' }}>
            ✓ Save Performance
          </button>
        </div>
      )}

      {/* Match cards */}
      {matches.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:12 }}>
          {matches.map(m => {
            const myPts = matchPoints[m.id] || 0
            const matchPerfs = (performances[m.id] || []).filter(p => mySquadIds.has(p.player_id))
            const allPerfs = performances[m.id] || []
            const isLive = m.status === 'live'
            const isDone = m.status === 'completed'
            const statusColor = isLive?'var(--red)':isDone?'var(--teal)':'var(--text3)'
            const statusBg = isLive?'var(--red2)':isDone?'var(--teal2)':'var(--navy4)'

            return (
              <div key={m.id} style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', transition:'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor='var(--border2)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}>

                {/* Header */}
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
                      <span style={{ fontSize:9, color:statusColor, fontWeight:700, textTransform:'uppercase' }}>{m.status}</span>
                    </div>
                  </div>
                </div>

                {/* My squad performances */}
                {matchPerfs.length > 0 ? (
                  <>
                    {matchPerfs.slice(0, 3).map(p => {
                      const { points } = calculateFantasyPoints(p)
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
                  <div style={{ padding:14, color:'var(--text3)', fontSize:13, textAlign:'center' }}>
                    {m.status === 'upcoming' ? '📅 Upcoming match' : 'No performances from your squad'}
                  </div>
                )}

                {/* Total */}
                {myPts > 0 && (
                  <div style={{ padding:'8px 14px', background:'rgba(240,165,0,0.04)', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid rgba(240,165,0,0.1)' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>Your total this match</span>
                    <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>+{myPts} pts</span>
                  </div>
                )}

                {/* All performances count */}
                {allPerfs.length > 0 && (
                  <div style={{ padding:'6px 14px', background:'var(--navy3)', borderTop:'1px solid var(--border)', fontSize:11, color:'var(--text3)' }}>
                    {allPerfs.length} player performances recorded
                  </div>
                )}

                {/* Admin controls */}
                {member?.is_admin && (
                  <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:6, flexWrap:'wrap' }}>
                    <button className="btn btn-teal" style={{ fontSize:11, padding:'4px 12px', borderRadius:8 }}
                      onClick={() => setShowAddPerf(showAddPerf === m.id ? null : m.id)}>
                      + Add Performance
                    </button>
                    <select value={m.status} onChange={e => updateMatchStatus(m.id, e.target.value)}
                      style={{ fontSize:11, padding:'4px 8px', borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button onClick={() => deleteMatch(m.id)}
                      style={{ fontSize:11, padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer' }}>
                      Delete
                    </button>
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