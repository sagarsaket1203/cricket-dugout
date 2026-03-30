import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [allPlayers, setAllPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(false)
  const [member, setMember] = useState(null)
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [newMatch, setNewMatch] = useState({ team1:'', team2:'', venue:'', match_date:'', status:'completed' })
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [extractedPerfs, setExtractedPerfs] = useState(null)
  const [savingPerfs, setSavingPerfs] = useState(false)
  const fileRef = useRef(null)
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
    setTimeout(() => setMsg(''), 5000)
  }

  function findPlayer(name) {
    if (!name) return null
    const lower = name.toLowerCase().trim()
    let found = allPlayers.find(p => p.name.toLowerCase() === lower)
    if (found) return found
    const parts = lower.split(' ')
    const lastName = parts[parts.length - 1]
    if (lastName.length > 3) {
      found = allPlayers.find(p => p.name.toLowerCase().includes(lastName))
      if (found) return found
    }
    const firstName = parts[0]
    if (firstName.length > 3) {
      found = allPlayers.find(p => p.name.toLowerCase().startsWith(firstName))
      if (found) return found
    }
    return null
  }

  async function addMatch() {
    if (!newMatch.team1 || !newMatch.team2) { showMsg('Select both teams!', 'error'); return }
    const { error } = await supabase.from('matches').insert({
      team1: newMatch.team1, team2: newMatch.team2,
      venue: newMatch.venue,
      match_date: newMatch.match_date || new Date().toISOString(),
      status: newMatch.status
    })
    if (error) { showMsg('Error: ' + error.message, 'error'); return }
    showMsg('✅ Match added! Now upload the scorecard screenshot.')
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

  async function uploadScorecard(file, matchId) {
    if (!file) return
    // Clear file input to allow re-upload
    if (fileRef.current) fileRef.current.value = ''
    setUploading(true)
    setExtractedPerfs(null)
    showMsg('🤖 AI is reading the scorecard... please wait', 'success')

    try {
      // Convert to base64
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = () => rej(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || 'image/jpeg'

      // Retry logic - try up to 3 times
      let response = null
      let lastError = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2000,
              messages: [{
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: { type: 'base64', media_type: mediaType, data: base64 }
                  },
                  {
                    type: 'text',
                    text: `Extract ALL cricket scorecard data from this image. Return ONLY valid JSON, no markdown, no explanation.

Format:
{
  "batting": [{"name":"Player Name","runs":50,"balls":30,"fours":4,"sixes":2,"dismissal":"not out"}],
  "bowling": [{"name":"Player Name","overs":4.0,"maidens":1,"runsConceded":28,"wickets":2}],
  "fielding": [{"name":"Player Name","catches":1,"stumpings":0,"runOuts":0}]
}

Rules:
- Extract every batsman and bowler shown
- Use exact player names as shown in scorecard
- dismissal values: "bowled","lbw","caught","run out","stumped","not out","retired hurt"
- If fielding not shown, return empty array
- Numbers only, no strings for numeric fields`
                  }
                ]
              }]
            })
          })

          if (response.status === 429) {
            showMsg(`Rate limited, retrying (${attempt}/3)...`, 'success')
            await new Promise(r => setTimeout(r, 2000 * attempt))
            continue
          }
          if (!response.ok) throw new Error(`API error: ${response.status}`)
          break
        } catch (e) {
          lastError = e
          if (attempt === 3) throw lastError
          await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error.message || 'API error')
      }

      const text = data.content?.[0]?.text || ''
      if (!text) throw new Error('Empty response from AI')

      // Parse JSON - handle various formats
      let parsed
      try {
        // Remove any markdown code blocks
        const clean = text
          .replace(/```json\s*/gi, '')
          .replace(/```\s*/g, '')
          .trim()
        parsed = JSON.parse(clean)
      } catch {
        // Try to extract JSON from text
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[0]) }
          catch { throw new Error('Could not parse AI response. Try a clearer screenshot.') }
        } else {
          throw new Error('AI could not read the scorecard. Make sure it is a clear cricket scorecard image.')
        }
      }

      if (!parsed.batting && !parsed.bowling) {
        throw new Error('No cricket data found in image. Please upload a scorecard screenshot.')
      }

      // Build performances list
      const matched = []

      // Batting
      for (const b of (parsed.batting || [])) {
        if (!b.name) continue
        const dbPlayer = findPlayer(b.name)
        matched.push({
          playerName: b.name,
          player_id: dbPlayer?.id || null,
          dbName: dbPlayer?.name || null,
          team: dbPlayer?.team || null,
          include: !!dbPlayer?.id,
          runs: parseInt(b.runs) || 0,
          balls: parseInt(b.balls) || 0,
          fours: parseInt(b.fours) || 0,
          sixes: parseInt(b.sixes) || 0,
          dismissalType: b.dismissal || '',
          wickets: 0, overs: 0, maidens: 0, runsConceded: 0,
          catches: 0, stumpings: 0, runOuts: 0,
          type: 'batting'
        })
      }

      // Bowling - merge with batting if same player
      for (const bw of (parsed.bowling || [])) {
        if (!bw.name) continue
        const dbPlayer = findPlayer(bw.name)
        const existingIdx = matched.findIndex(m =>
          m.playerName === bw.name || (dbPlayer && m.player_id === dbPlayer.id)
        )
        if (existingIdx >= 0) {
          matched[existingIdx].wickets = parseInt(bw.wickets) || 0
          matched[existingIdx].overs = parseFloat(bw.overs) || 0
          matched[existingIdx].maidens = parseInt(bw.maidens) || 0
          matched[existingIdx].runsConceded = parseInt(bw.runsConceded) || 0
        } else {
          matched.push({
            playerName: bw.name,
            player_id: dbPlayer?.id || null,
            dbName: dbPlayer?.name || null,
            team: dbPlayer?.team || null,
            include: !!dbPlayer?.id,
            runs: 0, balls: 0, fours: 0, sixes: 0, dismissalType: '',
            wickets: parseInt(bw.wickets) || 0,
            overs: parseFloat(bw.overs) || 0,
            maidens: parseInt(bw.maidens) || 0,
            runsConceded: parseInt(bw.runsConceded) || 0,
            catches: 0, stumpings: 0, runOuts: 0,
            type: 'bowling'
          })
        }
      }

      // Fielding
      for (const f of (parsed.fielding || [])) {
        if (!f.name) continue
        const dbPlayer = findPlayer(f.name)
        const existingIdx = matched.findIndex(m =>
          m.playerName === f.name || (dbPlayer && m.player_id === dbPlayer.id)
        )
        if (existingIdx >= 0) {
          matched[existingIdx].catches = parseInt(f.catches) || 0
          matched[existingIdx].stumpings = parseInt(f.stumpings) || 0
          matched[existingIdx].runOuts = parseInt(f.runOuts) || 0
        }
      }

      if (matched.length === 0) {
        throw new Error('No players found in scorecard. Try a clearer image.')
      }

      setExtractedPerfs({ performances: matched, matchId })
      const matchedCount = matched.filter(p => p.player_id).length
      showMsg(`✅ AI found ${matched.length} players! ${matchedCount} matched to your squad database.`, 'success')

    } catch (e) {
      console.error('Scorecard upload error:', e)
      showMsg(`❌ ${e.message || 'Failed to read scorecard. Try again.'}`, 'error')
    }
    setUploading(false)
  }

  async function savePerformances() {
    if (!extractedPerfs) return
    setSavingPerfs(true)
    showMsg('Saving performances...', 'success')

    const toSave = extractedPerfs.performances.filter(p => p.include && p.player_id)
    if (toSave.length === 0) {
      showMsg('No performances selected to save!', 'error')
      setSavingPerfs(false)
      return
    }

    try {
      // Save all performances first
      for (const perf of toSave) {
        const { points } = calculateFantasyPoints(perf)
        await supabase.from('performances').upsert({
          match_id: extractedPerfs.matchId,
          player_id: perf.player_id,
          runs: perf.runs || 0,
          balls: perf.balls || 0,
          fours: perf.fours || 0,
          sixes: perf.sixes || 0,
          wickets: perf.wickets || 0,
          overs: perf.overs || 0,
          maidens: perf.maidens || 0,
          runsConceded: perf.runsConceded || 0,
          catches: perf.catches || 0,
          stumpings: perf.stumpings || 0,
          runOuts: perf.runOuts || 0,
          dismissalType: perf.dismissalType || '',
          fantasy_points: points
        }, { onConflict: 'match_id,player_id' })
      }

      // Now recalculate match points fresh (avoid race conditions)
      // Delete existing match points for this match
      await supabase.from('match_points')
        .delete().eq('match_id', extractedPerfs.matchId)

      // Get all performances for this match
      const { data: allPerfs } = await supabase
        .from('performances').select('player_id, fantasy_points')
        .eq('match_id', extractedPerfs.matchId)

      // Get all squads
      const { data: allSquads } = await supabase
        .from('squad').select('player_id, user_id, league_id')

      // Calculate points per user per league
      const pointsMap = {}
      for (const perf of allPerfs || []) {
        const squadEntries = allSquads?.filter(s => s.player_id === perf.player_id) || []
        for (const sq of squadEntries) {
          const key = `${sq.user_id}-${sq.league_id}`
          pointsMap[key] = (pointsMap[key] || 0) + (perf.fantasy_points || 0)
          if (!pointsMap[`${key}-uid`]) pointsMap[`${key}-uid`] = sq.user_id
          if (!pointsMap[`${key}-lid`]) pointsMap[`${key}-lid`] = sq.league_id
        }
      }

      // Insert fresh match points
      const inserts = Object.entries(pointsMap)
        .filter(([key]) => !key.endsWith('-uid') && !key.endsWith('-lid'))
        .map(([key, points]) => ({
          match_id: extractedPerfs.matchId,
          user_id: pointsMap[`${key}-uid`],
          league_id: pointsMap[`${key}-lid`],
          total_points: points
        }))

      if (inserts.length > 0) {
        await supabase.from('match_points').insert(inserts)
      }

      showMsg(`✅ Saved ${toSave.length} performances! Fantasy points updated for all leagues.`, 'success')
      setExtractedPerfs(null)
      setSelectedMatch(null)
      load()
    } catch (e) {
      showMsg('Error saving: ' + e.message, 'error')
    }
    setSavingPerfs(false)
  }

  function togglePerf(idx) {
    setExtractedPerfs(prev => {
      const updated = [...prev.performances]
      updated[idx] = { ...updated[idx], include: !updated[idx].include }
      return { ...prev, performances: updated }
    })
  }

  function updatePlayerMapping(idx, playerId) {
    setExtractedPerfs(prev => {
      const updated = [...prev.performances]
      const player = allPlayers.find(p => p.id === playerId)
      updated[idx] = {
        ...updated[idx],
        player_id: playerId || null,
        dbName: player?.name || null,
        team: player?.team || null,
        include: !!playerId
      }
      return { ...prev, performances: updated }
    })
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
            <div style={{ color:'var(--text2)', fontSize:13 }}>📸 Upload scorecard screenshot → AI reads it automatically</div>
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
            <button className="btn btn-ghost" onClick={() => setShowGuide(!showGuide)} style={{ fontSize:13 }}>📋 Guide</button>
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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:10, marginBottom:14 }}>
            {[
              { label:'Team 1', key:'team1', type:'select' },
              { label:'Team 2', key:'team2', type:'select' },
              { label:'Venue', key:'venue', type:'text', placeholder:'Stadium' },
              { label:'Date', key:'match_date', type:'date' },
              { label:'Status', key:'status', type:'status' },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>{f.label}</div>
                {f.type === 'select' ? (
                  <select className="input" value={newMatch[f.key]} onChange={e => setNewMatch({...newMatch, [f.key]:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                    <option value="">Select</option>
                    {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : f.type === 'status' ? (
                  <select className="input" value={newMatch.status} onChange={e => setNewMatch({...newMatch, status:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                    <option value="completed">Completed</option>
                    <option value="live">Live</option>
                    <option value="upcoming">Upcoming</option>
                  </select>
                ) : (
                  <input className="input" type={f.type} placeholder={f.placeholder} value={newMatch[f.key]}
                    onChange={e => setNewMatch({...newMatch, [f.key]:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }} />
                )}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={addMatch} style={{ fontSize:13, padding:'8px 20px' }}>Add Match</button>
        </div>
      )}

      {/* Points Guide */}
      {showGuide && (
        <div className="fade-in card" style={{ padding:20, marginBottom:20 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:14, color:'var(--gold)' }}>Fantasy Points System</h3>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:6 }}>
            {POINTS_GUIDE.map((g, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'7px 10px', background:'var(--navy3)', borderRadius:8, border:'1px solid var(--border)' }}>
                <span style={{ fontSize:11, color:'var(--text2)' }}>{g.action}</span>
                <span style={{ fontSize:13, fontWeight:700, fontFamily:'Rajdhani', color:g.pts.startsWith('+')?'var(--teal)':'var(--red)' }}>{g.pts}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Review Panel */}
      {extractedPerfs && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid rgba(0,212,170,0.3)', borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <div>
              <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--teal)' }}>
                🤖 AI Found {extractedPerfs.performances.length} Players
              </h3>
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                {extractedPerfs.performances.filter(p => p.player_id).length} matched · Fix wrong ones using dropdown · Uncheck to skip
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost" onClick={() => setExtractedPerfs(null)} style={{ fontSize:13 }}>✕ Discard</button>
              <button className="btn btn-primary" onClick={savePerformances} disabled={savingPerfs} style={{ fontSize:13, padding:'8px 20px' }}>
                {savingPerfs ? '⟳ Saving...' : `✓ Save ${extractedPerfs.performances.filter(p => p.include && p.player_id).length} Performances`}
              </button>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:500, overflowY:'auto' }} className="no-scroll">
            {extractedPerfs.performances.map((p, i) => {
              const { points } = calculateFantasyPoints(p)
              return (
                <div key={i} style={{ background:p.include?'var(--navy3)':'rgba(255,71,87,0.04)', border:`1px solid ${p.include?'var(--border)':'rgba(255,71,87,0.15)'}`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <input type="checkbox" checked={!!p.include} onChange={() => togglePerf(i)} style={{ width:16, height:16, cursor:'pointer', flexShrink:0 }} />

                  <div style={{ minWidth:100, flexShrink:0 }}>
                    <div style={{ fontSize:10, color:'var(--text3)' }}>Scorecard</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>{p.playerName}</div>
                  </div>

                  <div style={{ fontSize:14, color:'var(--text3)', flexShrink:0 }}>→</div>

                  <select value={p.player_id || ''} onChange={e => updatePlayerMapping(i, e.target.value)}
                    style={{ flex:1, minWidth:150, padding:'5px 8px', borderRadius:7, background:'var(--navy4)', border:`1px solid ${p.player_id?'rgba(0,212,170,0.3)':'rgba(255,71,87,0.3)'}`, color:p.player_id?'var(--teal)':'var(--red)', fontSize:12, cursor:'pointer' }}>
                    <option value="">-- Not matched --</option>
                    {allPlayers.map(pl => <option key={pl.id} value={pl.id}>{pl.name} ({pl.team})</option>)}
                  </select>

                  <div style={{ fontSize:11, color:'var(--text3)', flexShrink:0, minWidth:120 }}>
                    {p.runs > 0 && <span style={{ color:'var(--gold)', fontWeight:600 }}>{p.runs}r </span>}
                    {p.balls > 0 && <span>({p.balls}b) </span>}
                    {p.fours > 0 && <span>{p.fours}×4 </span>}
                    {p.sixes > 0 && <span>{p.sixes}×6 </span>}
                    {p.wickets > 0 && <span style={{ color:'var(--teal)', fontWeight:600 }}>{p.wickets}w </span>}
                    {p.overs > 0 && <span>{p.overs}ov </span>}
                    {p.catches > 0 && <span>{p.catches}c </span>}
                  </div>

                  <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:points>0?'var(--gold)':points<0?'var(--red)':'var(--text3)', flexShrink:0, minWidth:55, textAlign:'right' }}>
                    {points > 0 ? `+${points}` : points}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:10, fontSize:12, color:'var(--text2)' }}>
            Total pts to be awarded: <span style={{ color:'var(--gold)', fontWeight:700, fontFamily:'Rajdhani', fontSize:16 }}>
              {extractedPerfs.performances.filter(p => p.include && p.player_id).reduce((a, p) => a + calculateFantasyPoints(p).points, 0)}
            </span>
          </div>
        </div>
      )}

      {/* No matches */}
      {matches.length === 0 && !showAddMatch && (
        <div style={{ padding:36, textAlign:'center', marginBottom:20, background:'linear-gradient(135deg, rgba(240,165,0,0.05), var(--navy2))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:18 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏏</div>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, marginBottom:8 }}>IPL 2026 has started!</h2>
          <div style={{ color:'var(--text2)', fontSize:14, marginBottom:8, lineHeight:1.7 }}>
            {member?.is_admin
              ? 'Add a match, then upload the scorecard screenshot from Cricbuzz or ESPNcricinfo!'
              : 'Admin will add matches soon.'}
          </div>
          {member?.is_admin && (
            <button className="btn btn-primary" onClick={() => setShowAddMatch(true)} style={{ padding:'12px 28px', fontSize:15, marginTop:8 }}>
              + Add First Match
            </button>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display:'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file && selectedMatch) uploadScorecard(file, selectedMatch)
        }}
      />

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
              <div key={m.id} style={{ background:'var(--navy2)', border:`1px solid ${selectedMatch===m.id?'rgba(0,212,170,0.3)':'var(--border)'}`, borderRadius:14, overflow:'hidden' }}>
                {/* Match header */}
                <div style={{ background:'var(--navy3)', padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700 }}>{m.team1} vs {m.team2}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {m.match_date ? new Date(m.match_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'TBD'}
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

                {/* Performances */}
                {matchPerfs.length > 0 ? (
                  <>
                    {matchPerfs.slice(0, 3).map(p => {
                      const { points } = calculateFantasyPoints(p)
                      return (
                        <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ minWidth:0, flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {players[p.player_id]?.name || 'Player'}
                            </div>
                            <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                              {p.runs > 0 && `${p.runs}r`}
                              {p.runs > 0 && (p.wickets > 0 || p.catches > 0) && ' · '}
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
                      <div style={{ padding:'7px 14px', fontSize:11, color:'var(--text3)', textAlign:'center', borderBottom:'1px solid var(--border)' }}>
                        +{matchPerfs.length - 3} more from your squad
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding:14, color:'var(--text3)', fontSize:13, textAlign:'center' }}>
                    {m.status === 'upcoming' ? '📅 Match not played yet' : allPerfs.length > 0 ? `${allPerfs.length} performances recorded` : 'No performances yet — upload scorecard!'}
                  </div>
                )}

                {myPts > 0 && (
                  <div style={{ padding:'7px 14px', background:'rgba(240,165,0,0.04)', display:'flex', justifyContent:'space-between', borderTop:'1px solid rgba(240,165,0,0.1)' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>Your total</span>
                    <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>+{myPts} pts</span>
                  </div>
                )}

                {/* Admin controls */}
                {member?.is_admin && (
                  <div style={{ borderTop:'1px solid var(--border)', background:'var(--navy3)', padding:'10px 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <button
                      className="btn btn-teal"
                      style={{ fontSize:12, padding:'5px 14px', borderRadius:8 }}
                      disabled={uploading}
                      onClick={() => {
                        setSelectedMatch(m.id)
                        setExtractedPerfs(null)
                        setTimeout(() => fileRef.current?.click(), 100)
                      }}>
                      {uploading && selectedMatch === m.id ? (
                        <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:12, height:12, border:'2px solid var(--teal)', borderTop:'2px solid transparent', borderRadius:'50%', animation:'spin 1s linear infinite', display:'inline-block' }} />
                          AI Reading...
                        </span>
                      ) : '📸 Upload Scorecard'}
                    </button>

                    <select value={m.status}
                      onChange={async e => { await supabase.from('matches').update({ status: e.target.value }).eq('id', m.id); load() }}
                      style={{ fontSize:11, padding:'4px 8px', borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                    </select>

                    <button onClick={() => deleteMatch(m.id)}
                      style={{ fontSize:11, padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer' }}>
                      🗑 Delete
                    </button>

                    {allPerfs.length > 0 && (
                      <span style={{ fontSize:11, color:'var(--teal)', marginLeft:'auto' }}>✅ {allPerfs.length} saved</span>
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