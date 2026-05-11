import { useState, useEffect, useRef } from 'react'
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
  const [allUserMatchPoints, setAllUserMatchPoints] = useState({})
  const [leagueMembers, setLeagueMembers] = useState([])
  const [allPlayers, setAllPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showGuide, setShowGuide] = useState(false)
  const [member, setMember] = useState(null)
  const [expandedMatch, setExpandedMatch] = useState(null)
  const [showAddMatch, setShowAddMatch] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')
  const [newMatch, setNewMatch] = useState({ team1:'', team2:'', venue:'', match_date:'', status:'completed' })
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [extractedPerfs, setExtractedPerfs] = useState(null)
  const [savingPerfs, setSavingPerfs] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualScorecard, setManualScorecard] = useState({ match_id: null, batting: '', bowling: '', fielding: '' })
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

        // Load performances
        const { data: perfs } = await supabase
          .from('performances').select('*, players(name,role)')
        const perfMap = {}
        perfs?.forEach(p => {
          if (!perfMap[p.match_id]) perfMap[p.match_id] = []
          perfMap[p.match_id].push(p)
        })
        setPerformances(perfMap)

        const { data: allPts } = await supabase
          .from('match_points').select('*')
          .eq('league_id', mem.league_id)
        const allPtsMap = {}
        allPts?.forEach(p => {
          if (!allPtsMap[p.match_id]) allPtsMap[p.match_id] = []
          allPtsMap[p.match_id].push(p)
        })
        setAllUserMatchPoints(allPtsMap)

        const { data: membersData } = await supabase
          .from('league_members').select('*, profiles(*)')
          .eq('league_id', mem.league_id)
        setLeagueMembers(membersData || [])
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
    showMsg('✅ Match added! Now upload the scorecard.')
    setShowAddMatch(false)
    setNewMatch({ team1:'', team2:'', venue:'', match_date:'', status:'completed' })
    load()
  }

  async function deleteMatch(matchId) {
    if (!confirm('Delete this match and all its performances?')) return
    await supabase.from('performances').delete().eq('match_id', matchId)
    await supabase.from('match_points').delete().eq('match_id', matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    showMsg('Match deleted.')
    load()
  }

  function parseManualScorecard() {
    const { batting, bowling, fielding, match_id } = manualScorecard
    if (!match_id) { showMsg('Select a match first!', 'error'); return }
    const matched = []

    if (batting.trim()) {
      batting.split('\n').forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p)
        if (parts.length >= 2) {
          const dbPlayer = findPlayer(parts[0])
          matched.push({
            playerName: parts[0],
            player_id: dbPlayer?.id || null,
            dbName: dbPlayer?.name || null,
            team: dbPlayer?.team || null,
            runs: parseInt(parts[1]) || 0,
            balls: parseInt(parts[2]) || 0,
            fours: parseInt(parts[3]) || 0,
            sixes: parseInt(parts[4]) || 0,
            dismissalType: parts[5] || '',
            wickets: 0, overs: 0, maidens: 0, runsConceded: 0,
            catches: 0, stumpings: 0, runOuts: 0,
            include: !!dbPlayer?.id
          })
        }
      })
    }

    if (bowling.trim()) {
      bowling.split('\n').forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p)
        if (parts.length >= 2) {
          const dbPlayer = findPlayer(parts[0])
          const existing = matched.find(m => dbPlayer && m.player_id === dbPlayer.id)
          if (existing) {
            existing.overs = parseFloat(parts[1]) || 0
            existing.maidens = parseInt(parts[2]) || 0
            existing.runsConceded = parseInt(parts[3]) || 0
            existing.wickets = parseInt(parts[4]) || 0
          } else {
            matched.push({
              playerName: parts[0],
              player_id: dbPlayer?.id || null,
              dbName: dbPlayer?.name || null,
              team: dbPlayer?.team || null,
              runs: 0, balls: 0, fours: 0, sixes: 0, dismissalType: '',
              overs: parseFloat(parts[1]) || 0,
              maidens: parseInt(parts[2]) || 0,
              runsConceded: parseInt(parts[3]) || 0,
              wickets: parseInt(parts[4]) || 0,
              catches: 0, stumpings: 0, runOuts: 0,
              include: !!dbPlayer?.id
            })
          }
        }
      })
    }

    if (fielding.trim()) {
      fielding.split('\n').forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p)
        if (parts.length >= 1) {
          const dbPlayer = findPlayer(parts[0])
          const existing = matched.find(m => dbPlayer && m.player_id === dbPlayer.id)
          if (existing) {
            existing.catches = parseInt(parts[1]) || 0
            existing.stumpings = parseInt(parts[2]) || 0
            existing.runOuts = parseInt(parts[3]) || 0
          }
        }
      })
    }

    if (matched.length === 0) { showMsg('No valid data found!', 'error'); return }
    setExtractedPerfs({ performances: matched, matchId: match_id })
    showMsg(`✅ Parsed ${matched.length} players! Review and save.`, 'success')
    setShowManualInput(false)
  }

  async function uploadScorecard(file, matchId) {
    if (!file) return
    if (fileRef.current) fileRef.current.value = ''
    setUploading(true)
    setExtractedPerfs(null)
    showMsg('🤖 AI is reading the scorecard...', 'success')

    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = () => rej(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || 'image/jpeg'
      let response = null

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
                  { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
                  { type: 'text', text: `Extract ALL cricket scorecard data. Return ONLY valid JSON, no markdown:
{"batting":[{"name":"Player","runs":50,"balls":30,"fours":4,"sixes":2,"dismissal":"not out"}],"bowling":[{"name":"Player","overs":4.0,"maidens":1,"runsConceded":28,"wickets":2}],"fielding":[{"name":"Player","catches":1,"stumpings":0,"runOuts":0}]}
Extract every batsman and bowler. Use exact names from scorecard.` }
                ]
              }]
            })
          })
          if (response.status === 429) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue }
          if (!response.ok) throw new Error(`API error: ${response.status}`)
          break
        } catch (e) {
          if (attempt === 3) throw e
          await new Promise(r => setTimeout(r, 1000 * attempt))
        }
      }

      const data = await response.json()
      if (data.error) throw new Error(data.error.message || 'API error')
      const text = data.content?.[0]?.text || ''
      if (!text) throw new Error('Empty response')

      let parsed
      try {
        const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        parsed = JSON.parse(clean)
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0])
        else throw new Error('Could not parse AI response. Try a clearer screenshot.')
      }

      if (!parsed.batting && !parsed.bowling) throw new Error('No cricket data found in image.')

      const matched = []

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
          catches: 0, stumpings: 0, runOuts: 0
        })
      }

      for (const bw of (parsed.bowling || [])) {
        if (!bw.name) continue
        const dbPlayer = findPlayer(bw.name)
        const existingIdx = matched.findIndex(m => dbPlayer && m.player_id === dbPlayer.id)
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
            catches: 0, stumpings: 0, runOuts: 0
          })
        }
      }

      for (const f of (parsed.fielding || [])) {
        if (!f.name) continue
        const dbPlayer = findPlayer(f.name)
        const existingIdx = matched.findIndex(m => dbPlayer && m.player_id === dbPlayer.id)
        if (existingIdx >= 0) {
          matched[existingIdx].catches = parseInt(f.catches) || 0
          matched[existingIdx].stumpings = parseInt(f.stumpings) || 0
          matched[existingIdx].runOuts = parseInt(f.runOuts) || 0
        }
      }

      if (matched.length === 0) throw new Error('No players found. Try a clearer image.')
      setExtractedPerfs({ performances: matched, matchId })
      showMsg(`✅ AI found ${matched.length} players! ${matched.filter(p => p.player_id).length} matched.`, 'success')
    } catch (e) {
      console.error('Scorecard error:', e)
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
      showMsg('No performances selected!', 'error')
      setSavingPerfs(false)
      return
    }

    try {
      const matchId = extractedPerfs.matchId

      // Save each performance individually using insert or update
      for (const perf of toSave) {
        const { points } = calculateFantasyPoints(perf)

        // Check if exists
        const { data: existing } = await supabase
          .from('performances')
          .select('id')
          .eq('match_id', matchId)
          .eq('player_id', perf.player_id)
          .maybeSingle()

        const perfData = {
          match_id: matchId,
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
        }

        if (existing) {
          await supabase.from('performances').update(perfData).eq('id', existing.id)
        } else {
          await supabase.from('performances').insert(perfData)
        }
      }

      // Recalculate match points fresh — delete and reinsert
      await supabase.from('match_points').delete().eq('match_id', matchId)

      // Get all saved performances for this match
      const { data: allPerfs } = await supabase
        .from('performances').select('player_id, fantasy_points')
        .eq('match_id', matchId)

      // Get all squad entries
      const { data: allSquads } = await supabase
        .from('squad').select('player_id, user_id, league_id')

      // Calculate points per user per league
      const userLeaguePoints = {}
      for (const perf of allPerfs || []) {
        const squadEntries = allSquads?.filter(s => s.player_id === perf.player_id) || []
        for (const sq of squadEntries) {
          const key = `${sq.user_id}__${sq.league_id}`
          if (!userLeaguePoints[key]) {
            userLeaguePoints[key] = { user_id: sq.user_id, league_id: sq.league_id, points: 0 }
          }
          userLeaguePoints[key].points += (perf.fantasy_points || 0)
        }
      }

      // Insert fresh match points
      for (const entry of Object.values(userLeaguePoints)) {
        if (entry.points !== 0) {
          await supabase.from('match_points').insert({
            match_id: matchId,
            user_id: entry.user_id,
            league_id: entry.league_id,
            total_points: entry.points
          })
        }
      }

      showMsg(`✅ Saved ${toSave.length} performances! Fantasy points updated.`, 'success')
      setExtractedPerfs(null)
      setSelectedMatch(null)
      load()
    } catch (e) {
      console.error('Save error:', e)
      showMsg('Failed to save performances: ' + e.message, 'error')
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
      updated[idx] = { ...updated[idx], player_id: playerId || null, dbName: player?.name || null, team: player?.team || null, include: !!playerId }
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
            <div style={{ color:'var(--text2)', fontSize:13 }}>📸 Upload scorecard → AI reads it · 📋 Or paste data manually</div>
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
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Team 1</div>
              <select className="input" value={newMatch.team1} onChange={e => setNewMatch({...newMatch, team1:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                <option value="">Select</option>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Team 2</div>
              <select className="input" value={newMatch.team2} onChange={e => setNewMatch({...newMatch, team2:e.target.value})} style={{ padding:'8px 10px', fontSize:13 }}>
                <option value="">Select</option>
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

      {/* Manual Scorecard Input */}
      {showManualInput && member?.is_admin && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:16, padding:20, marginBottom:20 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:16 }}>📋 Paste Scorecard Data</h3>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>Select Match</div>
            <select value={manualScorecard.match_id || ''} onChange={e => setManualScorecard({...manualScorecard, match_id:e.target.value})}
              style={{ width:'100%', padding:'8px 10px', fontSize:13, borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>
              <option value="">-- Select match --</option>
              {matches.map(m => <option key={m.id} value={m.id}>{m.team1} vs {m.team2}</option>)}
            </select>
          </div>
          {[
            { key:'batting', label:'⚾ Batting (Name, Runs, Balls, Fours, Sixes, Dismissal)', placeholder:'Virat Kohli, 72, 43, 8, 2, not out\nRohit Sharma, 45, 28, 5, 1, caught', rows:5 },
            { key:'bowling', label:'🎳 Bowling (Name, Overs, Maidens, Runs, Wickets)', placeholder:'Jasprit Bumrah, 4.0, 1, 22, 3\nYuzvendra Chahal, 4, 0, 35, 2', rows:4 },
            { key:'fielding', label:'🎯 Fielding (Name, Catches, Stumpings, RunOuts)', placeholder:'MS Dhoni, 2, 1, 0', rows:2 },
          ].map(f => (
            <div key={f.key} style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>{f.label}</div>
              <textarea value={manualScorecard[f.key]}
                onChange={e => setManualScorecard({...manualScorecard, [f.key]:e.target.value})}
                placeholder={f.placeholder} rows={f.rows}
                style={{ width:'100%', padding:'10px', fontSize:12, borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', fontFamily:'monospace', resize:'vertical', boxSizing:'border-box' }} />
            </div>
          ))}
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" onClick={parseManualScorecard} style={{ fontSize:13, padding:'8px 20px' }}>✓ Parse & Review</button>
            <button className="btn btn-ghost" onClick={() => setShowManualInput(false)} style={{ fontSize:13 }}>✕ Cancel</button>
          </div>
        </div>
      )}

      {/* AI Review Panel */}
      {extractedPerfs && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid rgba(0,212,170,0.3)', borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <div>
              <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--teal)' }}>
                ✅ {extractedPerfs.performances.length} Players Found
              </h3>
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                {extractedPerfs.performances.filter(p => p.player_id).length} matched · Fix wrong ones · Uncheck to skip
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost" onClick={() => setExtractedPerfs(null)} style={{ fontSize:13 }}>✕ Discard</button>
              <button className="btn btn-primary" onClick={savePerformances} disabled={savingPerfs} style={{ fontSize:13, padding:'8px 20px' }}>
                {savingPerfs ? '⟳ Saving...' : `✓ Save ${extractedPerfs.performances.filter(p => p.include && p.player_id).length}`}
              </button>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:480, overflowY:'auto' }} className="no-scroll">
            {extractedPerfs.performances.map((p, i) => {
              const { points } = calculateFantasyPoints(p)
              return (
                <div key={i} style={{ background:p.include?'var(--navy3)':'rgba(255,71,87,0.04)', border:`1px solid ${p.include?'var(--border)':'rgba(255,71,87,0.15)'}`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <input type="checkbox" checked={!!p.include} onChange={() => togglePerf(i)} style={{ width:16, height:16, cursor:'pointer', flexShrink:0 }} />
                  <div style={{ minWidth:100, flexShrink:0 }}>
                    <div style={{ fontSize:10, color:'var(--text3)' }}>Scorecard name</div>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)' }}>{p.playerName}</div>
                  </div>
                  <div style={{ fontSize:14, color:'var(--text3)', flexShrink:0 }}>→</div>
                  <select value={p.player_id || ''} onChange={e => updatePlayerMapping(i, e.target.value)}
                    style={{ flex:1, minWidth:150, padding:'5px 8px', borderRadius:7, background:'var(--navy4)', border:`1px solid ${p.player_id?'rgba(0,212,170,0.3)':'rgba(255,71,87,0.3)'}`, color:p.player_id?'var(--teal)':'var(--red)', fontSize:12, cursor:'pointer' }}>
                    <option value="">-- Not matched --</option>
                    {allPlayers.map(pl => <option key={pl.id} value={pl.id}>{pl.name} ({pl.team})</option>)}
                  </select>
                  <div style={{ fontSize:11, color:'var(--text3)', flexShrink:0, minWidth:110 }}>
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
            Total pts: <span style={{ color:'var(--gold)', fontWeight:700, fontFamily:'Rajdhani', fontSize:16 }}>
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
            {member?.is_admin ? 'Add a match then upload the scorecard screenshot!' : 'Admin will add matches soon.'}
          </div>
          {member?.is_admin && (
            <button className="btn btn-primary" onClick={() => setShowAddMatch(true)} style={{ padding:'12px 28px', fontSize:15, marginTop:8 }}>
              + Add First Match
            </button>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file && selectedMatch) uploadScorecard(file, selectedMatch)
          if (fileRef.current) fileRef.current.value = ''
        }} />

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
                {/* Header */}
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
                    {(expandedMatch === m.id ? matchPerfs : matchPerfs.slice(0,3)).map(p => {
                      const { points, breakdown } = calculateFantasyPoints(p)
                      return (
                        <div key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px' }}>
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
                          {expandedMatch === m.id && breakdown.length > 0 && (
                            <div style={{ padding:'0 14px 8px', display:'flex', flexWrap:'wrap', gap:4 }}>
                              {breakdown.map((b, j) => (
                                <span key={j} style={{ fontSize:10, padding:'2px 6px', borderRadius:5, background:b.pts>0?'rgba(0,212,170,0.08)':'rgba(255,71,87,0.08)', color:b.pts>0?'var(--teal)':'var(--red)', border:`1px solid ${b.pts>0?'rgba(0,212,170,0.15)':'rgba(255,71,87,0.15)'}` }}>
                                  {b.label}: {b.pts>0?`+${b.pts}`:b.pts}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {matchPerfs.length > 3 && (
                      <div onClick={() => setExpandedMatch(expandedMatch===m.id?null:m.id)}
                        style={{ padding:'8px 14px', fontSize:11, color:'var(--gold)', textAlign:'center', borderBottom:'1px solid var(--border)', cursor:'pointer', fontWeight:600, background:'rgba(240,165,0,0.03)' }}>
                        {expandedMatch===m.id ? '▲ Show less' : `▼ View all ${matchPerfs.length} players`}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding:14, color:'var(--text3)', fontSize:13, textAlign:'center' }}>
                    {m.status==='upcoming' ? '📅 Upcoming match' : allPerfs.length>0 ? `${allPerfs.length} performances recorded` : 'No performances yet — upload scorecard!'}
                  </div>
                )}

                {myPts > 0 && (
                  <div style={{ padding:'7px 14px', background:'rgba(240,165,0,0.04)', display:'flex', justifyContent:'space-between', borderTop:'1px solid rgba(240,165,0,0.1)' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>Your total</span>
                    <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>+{myPts} pts</span>
                  </div>
                )}

                {/* League points per user */}
                {(() => {
                  const userPts = (allUserMatchPoints[m.id] || [])
                    .map(p => ({ ...p, member: leagueMembers.find(lm => lm.user_id === p.user_id) }))
                    .filter(p => p.member)
                    .sort((a,b) => b.total_points - a.total_points)
                  if (!userPts.length) return null
                  return (
                    <div style={{ borderTop:'1px solid var(--border)' }}>
                      <div style={{ padding:'6px 14px', fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600 }}>League Points</div>
                      {userPts.map(up => {
                        const isMe = up.user_id === profile?.id
                        return (
                          <div key={up.user_id} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 14px', background:isMe?'rgba(240,165,0,0.04)':'transparent' }}>
                            <div style={{ width:18, height:18, borderRadius:'50%', background:'var(--navy4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:700, overflow:'hidden', flexShrink:0 }}>
                              {up.member?.profiles?.avatar_url ? <img src={up.member.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : up.member?.profiles?.name?.slice(0,2).toUpperCase()}
                            </div>
                            <div style={{ flex:1, fontSize:11, color:isMe?'var(--gold)':'var(--text2)', fontWeight:isMe?600:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {up.member?.profiles?.name?.split(' ')[0]}
                              {isMe && <span style={{ fontSize:8, marginLeft:3, color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                            </div>
                            <div style={{ fontFamily:'Rajdhani', fontSize:14, fontWeight:700, color:up.total_points>0?'var(--teal)':up.total_points<0?'var(--red)':'var(--text3)', flexShrink:0 }}>
                              {up.total_points>0?`+${up.total_points}`:up.total_points}
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ height:4 }} />
                    </div>
                  )
                })()}

                {/* Admin controls */}
                {member?.is_admin && (
                  <div style={{ borderTop:'1px solid var(--border)', background:'var(--navy3)', padding:'10px 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <button className="btn btn-teal" style={{ fontSize:12, padding:'5px 12px', borderRadius:8 }} disabled={uploading}
                      onClick={() => { setSelectedMatch(m.id); setExtractedPerfs(null); setTimeout(() => fileRef.current?.click(), 100) }}>
                      {uploading && selectedMatch===m.id ? '🤖 Reading...' : '📸 Upload Scorecard'}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize:12, padding:'5px 12px', borderRadius:8 }}
                      onClick={() => { setSelectedMatch(m.id); setManualScorecard({ match_id:m.id, batting:'', bowling:'', fielding:'' }); setShowManualInput(true) }}>
                      📋 Paste Data
                    </button>
                    <select value={m.status}
                      onChange={async e => { await supabase.from('matches').update({ status:e.target.value }).eq('id', m.id); load() }}
                      style={{ fontSize:11, padding:'4px 8px', borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>
                      <option value="upcoming">Upcoming</option>
                      <option value="live">Live</option>
                      <option value="completed">Completed</option>
                    </select>
                    <button onClick={() => deleteMatch(m.id)}
                      style={{ fontSize:11, padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer' }}>
                      🗑
                    </button>
                    {allPerfs.length > 0 && <span style={{ fontSize:11, color:'var(--teal)', marginLeft:'auto' }}>✅ {allPerfs.length} saved</span>}
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