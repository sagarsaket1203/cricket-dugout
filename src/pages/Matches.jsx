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

  // Scorecard AI upload
  const [selectedMatch, setSelectedMatch] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [extractedPerfs, setExtractedPerfs] = useState(null)
  const [savingPerfs, setSavingPerfs] = useState(false)
  const fileRef = useRef(null)

  // Manual scorecard input
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualScorecard, setManualScorecard] = useState({
    match_id: null,
    batting: '',
    bowling: '',
    fielding: ''
  })

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

        // Fetch all users' match points for the league
        const { data: allPts } = await supabase
          .from('match_points').select('*')
          .eq('league_id', mem.league_id)
        const allPtsMap = {}
        allPts?.forEach(p => {
          if (!allPtsMap[p.match_id]) allPtsMap[p.match_id] = []
          allPtsMap[p.match_id].push(p)
        })
        setAllUserMatchPoints(allPtsMap)

        // Fetch league members with profiles
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

  async function addMatch() {
    if (!newMatch.team1 || !newMatch.team2) { showMsg('Select both teams!', 'error'); return }
    const { error } = await supabase.from('matches').insert({
      team1: newMatch.team1, team2: newMatch.team2,
      venue: newMatch.venue,
      match_date: newMatch.match_date || new Date().toISOString(),
      status: newMatch.status
    })
    if (error) { showMsg('Error: ' + error.message, 'error'); return }
    showMsg('Match added! Now upload the scorecard.')
    setShowAddMatch(false)
    setNewMatch({ team1:'', team2:'', venue:'', match_date:'', status:'completed' })
    load()
  }

  async function deleteMatch(matchId) {
    if (!confirm('Delete this match and all its performances?')) return
    await supabase.from('player_match_performances').delete().eq('match_id', matchId)
    await supabase.from('match_points').delete().eq('match_id', matchId)
    await supabase.from('performances').delete().eq('match_id', matchId)
    await supabase.from('matches').delete().eq('id', matchId)
    showMsg('Match deleted.')
    load()
  }

  function findPlayer(name) {
    if (!name) return null
    const lower = name.toLowerCase().trim()
    // Exact match
    let found = allPlayers.find(p => p.name.toLowerCase() === lower)
    if (found) return found
    // Last name match
    const parts = lower.split(' ')
    const lastName = parts[parts.length - 1]
    found = allPlayers.find(p => p.name.toLowerCase().includes(lastName) && lastName.length > 3)
    if (found) return found
    // First name match
    const firstName = parts[0]
    found = allPlayers.find(p => p.name.toLowerCase().startsWith(firstName) && firstName.length > 3)
    return found || null
  }

  // Parse manual scorecard input
  function parseManualScorecard() {
    const { batting, bowling, fielding, match_id } = manualScorecard
    
    if (!match_id) {
      showMsg('Select a match first!', 'error')
      return
    }

    const matched = []

    // Parse batting
    if (batting.trim()) {
      batting.split('\n').forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p)
        if (parts.length >= 2 && parts[0]) {
          const playerName = parts[0]
          const dbPlayer = findPlayer(playerName)
          matched.push({
            playerName,
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
            type: 'batting',
            include: true
          })
        }
      })
    }

    // Parse bowling
    if (bowling.trim()) {
      bowling.split('\n').forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p)
        if (parts.length >= 2 && parts[0]) {
          const playerName = parts[0]
          const dbPlayer = findPlayer(playerName)
          const existing = matched.find(m => m.playerName === playerName || (dbPlayer && m.player_id === dbPlayer.id))
          
          if (existing) {
            existing.overs = parseFloat(parts[1]) || 0
            existing.maidens = parseInt(parts[2]) || 0
            existing.runsConceded = parseInt(parts[3]) || 0
            existing.wickets = parseInt(parts[4]) || 0
          } else {
            matched.push({
              playerName,
              player_id: dbPlayer?.id || null,
              dbName: dbPlayer?.name || null,
              team: dbPlayer?.team || null,
              runs: 0, balls: 0, fours: 0, sixes: 0, dismissalType: '',
              wickets: parseInt(parts[4]) || 0,
              overs: parseFloat(parts[1]) || 0,
              maidens: parseInt(parts[2]) || 0,
              runsConceded: parseInt(parts[3]) || 0,
              catches: 0, stumpings: 0, runOuts: 0,
              type: 'bowling',
              include: true
            })
          }
        }
      })
    }

    // Parse fielding
    if (fielding.trim()) {
      fielding.split('\n').forEach(line => {
        const parts = line.split(',').map(p => p.trim()).filter(p => p)
        if (parts.length >= 1 && parts[0]) {
          const playerName = parts[0]
          const dbPlayer = findPlayer(playerName)
          const existing = matched.find(m => m.playerName === playerName || (dbPlayer && m.player_id === dbPlayer.id))
          
          if (existing) {
            existing.catches = parseInt(parts[1]) || 0
            existing.stumpings = parseInt(parts[2]) || 0
            existing.runOuts = parseInt(parts[3]) || 0
          }
        }
      })
    }

    if (matched.length === 0) {
      showMsg('No valid data found. Check format!', 'error')
      return
    }

    setExtractedPerfs({ performances: matched, matchId: match_id })
    showMsg(`✅ Parsed ${matched.length} players! Review and save.`, 'success')
    setShowManualInput(false)
  }

  async function uploadScorecard(file, matchId) {
    if (!file) return
    setUploading(true)
    setExtractedPerfs(null)
    showMsg('🤖 Claude AI is reading the scorecard...', 'success')

    try {
      // Convert image to base64
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res(reader.result.split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || 'image/jpeg'

      // Call Claude API
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 }
              },
              {
                type: 'text',
                text: `You are analyzing an IPL cricket scorecard image. Extract ALL player performances from this scorecard.

For EVERY batsman shown, extract:
- name (exact as shown)
- runs scored
- balls faced
- fours hit
- sixes hit
- how they got out (bowled/lbw/caught/run out/stumped/not out)

For EVERY bowler shown, extract:
- name (exact as shown)
- overs bowled
- maidens
- runs conceded
- wickets taken

For fielding, if visible extract catches/stumpings/run outs.

Respond ONLY with a valid JSON object, no markdown, no explanation:
{
  "batting": [
    {
      "name": "Virat Kohli",
      "runs": 72,
      "balls": 43,
      "fours": 8,
      "sixes": 2,
      "dismissal": "not out"
    }
  ],
  "bowling": [
    {
      "name": "Jasprit Bumrah",
      "overs": 4.0,
      "maidens": 1,
      "runsConceded": 22,
      "wickets": 3
    }
  ],
  "fielding": [
    {
      "name": "MS Dhoni",
      "catches": 2,
      "stumpings": 1,
      "runOuts": 0
    }
  ]
}`
              }
            ]
          }]
        })
      })

      const data = await response.json()
      const text = data.content?.[0]?.text || ''

      // Parse JSON response
      let parsed
      try {
        const clean = text.replace(/```json|```/g, '').trim()
        parsed = JSON.parse(clean)
      } catch (e) {
        showMsg('Could not parse scorecard. Try a clearer image!', 'error')
        setUploading(false)
        return
      }

      // Match players to database
      const matched = []

      // Process batting
      for (const b of (parsed.batting || [])) {
        const dbPlayer = findPlayer(b.name)
        matched.push({
          playerName: b.name,
          player_id: dbPlayer?.id || null,
          dbName: dbPlayer?.name || null,
          team: dbPlayer?.team || null,
          runs: b.runs || 0,
          balls: b.balls || 0,
          fours: b.fours || 0,
          sixes: b.sixes || 0,
          dismissalType: b.dismissal || '',
          wickets: 0,
          overs: 0,
          maidens: 0,
          runsConceded: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
          type: 'batting',
          include: !!dbPlayer?.id
        })
      }

      // Process bowling - merge with existing if player already in list
      for (const bw of (parsed.bowling || [])) {
        const dbPlayer = findPlayer(bw.name)
        const existing = matched.find(m => m.playerName === bw.name || (dbPlayer && m.player_id === dbPlayer.id))
        if (existing) {
          existing.wickets = bw.wickets || 0
          existing.overs = bw.overs || 0
          existing.maidens = bw.maidens || 0
          existing.runsConceded = bw.runsConceded || 0
        } else {
          matched.push({
            playerName: bw.name,
            player_id: dbPlayer?.id || null,
            dbName: dbPlayer?.name || null,
            team: dbPlayer?.team || null,
            runs: 0, balls: 0, fours: 0, sixes: 0, dismissalType: '',
            wickets: bw.wickets || 0,
            overs: bw.overs || 0,
            maidens: bw.maidens || 0,
            runsConceded: bw.runsConceded || 0,
            catches: 0, stumpings: 0, runOuts: 0,
            type: 'bowling',
            include: !!dbPlayer?.id
          })
        }
      }

      // Process fielding
      for (const f of (parsed.fielding || [])) {
        const dbPlayer = findPlayer(f.name)
        const existing = matched.find(m => m.playerName === f.name || (dbPlayer && m.player_id === dbPlayer.id))
        if (existing) {
          existing.catches = f.catches || 0
          existing.stumpings = f.stumpings || 0
          existing.runOuts = f.runOuts || 0
        }
      }

      setExtractedPerfs({ performances: matched, matchId })
      showMsg(`✅ Found ${matched.length} players! Review and save.`, 'success')
    } catch (e) {
      showMsg('Error reading scorecard: ' + e.message, 'error')
    }
    setUploading(false)
  }

  async function savePerformances() {
    if (!extractedPerfs) return
    setSavingPerfs(true)
    const { performances: perfs, matchId } = extractedPerfs
    let saved = 0

    for (const perf of perfs) {
      if (!perf.player_id || !perf.include) continue
      const { points } = calculateFantasyPoints(perf)

      const balls = perf.balls ?? perf.balls_faced ?? 0
      const runOuts = perf.runOuts ?? perf.run_outs ?? 0
      const dismissalType = perf.dismissalType ?? perf.dismissal_type ?? ''
      const runsConceded = perf.runsConceded ?? perf.runs_conceded ?? 0
      const overs = perf.overs ?? 0
      const isDuck = perf.runs === 0 && balls > 0 && dismissalType && dismissalType.toLowerCase() !== 'not out'
      const isLbw = dismissalType ? dismissalType.toLowerCase().includes('lbw') : false
      const isBowled = dismissalType ? dismissalType.toLowerCase().includes('bowled') : false
      const economy = overs > 0 ? runsConceded / overs : null

      await supabase.from('performances').upsert({
        match_id: matchId,
        player_id: perf.player_id,
        runs: perf.runs, balls_faced: balls,
        fours: perf.fours, sixes: perf.sixes,
        wickets: perf.wickets,
        maidens: perf.maidens,
        catches: perf.catches, stumpings: perf.stumpings,
        run_outs: runOuts,
        fantasy_points: points
      }, { onConflict: 'match_id,player_id' })

      // Find all users who have this player in their squad
      const { data: sq } = await supabase.from('squad').select('user_id, league_id')
        .eq('player_id', perf.player_id)
      for (const s of sq || []) {
        // Insert into player_match_performances for each squad owner
        await supabase.from('player_match_performances').upsert({
          match_id: matchId,
          player_id: perf.player_id,
          user_id: s.user_id,
          league_id: s.league_id,
          runs: perf.runs,
          balls_faced: balls,
          wickets: perf.wickets,
          catches: perf.catches,
          stumpings: perf.stumpings,
          run_outs: runOuts,
          maidens: perf.maidens,
          fours: perf.fours,
          sixes: perf.sixes,
          economy,
          is_duck: isDuck,
          is_lbw: isLbw,
          is_bowled: isBowled,
          fantasy_points: points
        }, { onConflict: 'match_id,player_id,user_id' })

        // Update match_points totals
        const { data: ex } = await supabase.from('match_points').select('*')
          .eq('match_id', matchId).eq('user_id', s.user_id).eq('league_id', s.league_id).maybeSingle()
        if (ex) {
          await supabase.from('match_points').update({ total_points: ex.total_points + points }).eq('id', ex.id)
        } else {
          await supabase.from('match_points').insert({
            match_id: matchId, user_id: s.user_id, league_id: s.league_id, total_points: points
          })
        }
      }
      saved++
    }

    showMsg(`✅ Saved ${saved} performances! Fantasy points updated.`, 'success')
    setExtractedPerfs(null)
    setSelectedMatch(null)
    setManualScorecard({ match_id: null, batting: '', bowling: '', fielding: '' })
    setSavingPerfs(false)
    load()
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
      updated[idx] = { ...updated[idx], player_id: playerId, dbName: player?.name, team: player?.team }
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
            <div style={{ color:'var(--text2)', fontSize:13 }}>📸 Upload scorecard screenshot or 📋 paste data → Fantasy points calculated automatically</div>
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
              📋 Guide
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
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:10, marginBottom:14 }}>
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

      {/* Manual Scorecard Input Form */}
      {showManualInput && member?.is_admin && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:16, padding:20, marginBottom:20 }}>
          <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:16 }}>📋 Paste Scorecard Details</h3>
          
          {/* Match selector */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>Select Match</div>
            <select 
              value={manualScorecard.match_id || ''} 
              onChange={e => setManualScorecard({...manualScorecard, match_id: e.target.value})}
              style={{ width:'100%', padding:'8px 10px', fontSize:13, borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>
              <option value="">-- Select a match --</option>
              {matches.map(m => (
                <option key={m.id} value={m.id}>{m.team1} vs {m.team2}</option>
              ))}
            </select>
          </div>

          {/* Batting input */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>
              ⚾ Batting Data (Name, Runs, Balls, Fours, Sixes, Dismissal)
            </div>
            <textarea
              value={manualScorecard.batting}
              onChange={e => setManualScorecard({...manualScorecard, batting: e.target.value})}
              placeholder="Virat Kohli, 72, 43, 8, 2, not out&#10;Rohit Sharma, 45, 28, 5, 1, caught"
              style={{ width:'100%', height:100, padding:'10px', fontSize:12, borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', fontFamily:'monospace', resize:'vertical' }}
            />
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>One player per line, comma-separated</div>
          </div>

          {/* Bowling input */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>
              🎳 Bowling Data (Name, Overs, Maidens, Runs, Wickets)
            </div>
            <textarea
              value={manualScorecard.bowling}
              onChange={e => setManualScorecard({...manualScorecard, bowling: e.target.value})}
              placeholder="Jasprit Bumrah, 4.0, 1, 22, 3&#10;Yuzvendra Chahal, 4, 0, 35, 2"
              style={{ width:'100%', height:80, padding:'10px', fontSize:12, borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', fontFamily:'monospace', resize:'vertical' }}
            />
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>One player per line, comma-separated</div>
          </div>

          {/* Fielding input */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>
              🎯 Fielding Data (Name, Catches, Stumpings, Runouts)
            </div>
            <textarea
              value={manualScorecard.fielding}
              onChange={e => setManualScorecard({...manualScorecard, fielding: e.target.value})}
              placeholder="MS Dhoni, 2, 1, 0&#10;Hardik Pandya, 1, 0, 0"
              style={{ width:'100%', height:60, padding:'10px', fontSize:12, borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', fontFamily:'monospace', resize:'vertical' }}
            />
            <div style={{ fontSize:10, color:'var(--text3)', marginTop:4 }}>One player per line, comma-separated (optional)</div>
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            <button className="btn btn-primary" onClick={parseManualScorecard} style={{ fontSize:13, padding:'8px 20px' }}>
              ✓ Parse & Review
            </button>
            <button className="btn btn-ghost" onClick={() => setShowManualInput(false)} style={{ fontSize:13, padding:'8px 20px' }}>
              ✕ Cancel
            </button>
          </div>

          <div style={{ padding:'10px 14px', background:'rgba(0,212,170,0.08)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:10, fontSize:12, color:'var(--text2)' }}>
            💡 <strong>Format:</strong> Copy-paste data from GPT/Claude with each line as: name, value1, value2, ...
          </div>
        </div>
      )}

      {/* AI Scorecard Review Panel */}
      {extractedPerfs && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid rgba(0,212,170,0.3)', borderRadius:16, padding:20, marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <div>
              <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--teal)' }}>
                ✅ Extracted {extractedPerfs.performances.length} Players
              </h3>
              <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                Review matches, fix any wrong player, then save
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost" onClick={() => setExtractedPerfs(null)} style={{ fontSize:13 }}>
                ✕ Discard
              </button>
              <button className="btn btn-primary" onClick={savePerformances} disabled={savingPerfs} style={{ fontSize:13, padding:'8px 20px' }}>
                {savingPerfs ? '⟳ Saving...' : `✓ Save ${extractedPerfs.performances.filter(p => p.include && p.player_id).length} Performances`}
              </button>
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'500px', overflowY:'auto' }}>
            {extractedPerfs.performances.map((p, i) => {
              const { points, breakdown } = calculateFantasyPoints(p)
              return (
                <div key={i} style={{ background: p.include ? 'var(--navy3)' : 'rgba(255,71,87,0.05)', border:`1px solid ${p.include?'var(--border)':'rgba(255,71,87,0.2)'}`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>

                  {/* Toggle checkbox */}
                  <input type="checkbox" checked={!!p.include} onChange={() => togglePerf(i)}
                    style={{ width:16, height:16, cursor:'pointer', flexShrink:0 }} />

                  {/* Player name from scorecard */}
                  <div style={{ fontSize:12, color:'var(--text3)', minWidth:120, flexShrink:0 }}>
                    <div style={{ fontSize:10, color:'var(--text3)', marginBottom:1 }}>From scorecard</div>
                    <div style={{ fontWeight:600, color:'var(--text2)' }}>{p.playerName}</div>
                  </div>

                  {/* Arrow */}
                  <div style={{ fontSize:16, color:'var(--text3)', flexShrink:0 }}>→</div>

                  {/* DB player match dropdown */}
                  <div style={{ flex:1, minWidth:160 }}>
                    <div style={{ fontSize:10, color:'var(--text3)', marginBottom:1 }}>Matched to</div>
                    <select value={p.player_id || ''} onChange={e => updatePlayerMapping(i, e.target.value)}
                      style={{ width:'100%', padding:'5px 8px', borderRadius:7, background:'var(--navy4)', border:`1px solid ${p.player_id?'rgba(0,212,170,0.3)':'rgba(255,71,87,0.3)'}`, color:p.player_id?'var(--teal)':'var(--red)', fontSize:12, cursor:'pointer' }}>
                      <option value="">-- Not matched --</option>
                      {allPlayers.map(pl => <option key={pl.id} value={pl.id}>{pl.name} ({pl.team})</option>)}
                    </select>
                  </div>

                  {/* Stats summary */}
                  <div style={{ fontSize:11, color:'var(--text3)', flexShrink:0, textAlign:'center' }}>
                    {p.runs > 0 && <span style={{ color:'var(--gold)', fontWeight:600 }}>{p.runs}r </span>}
                    {p.balls > 0 && <span>({p.balls}b) </span>}
                    {p.fours > 0 && <span>{p.fours}x4 </span>}
                    {p.sixes > 0 && <span>{p.sixes}x6 </span>}
                    {p.wickets > 0 && <span style={{ color:'var(--teal)', fontWeight:600 }}>{p.wickets}w </span>}
                    {p.overs > 0 && <span>{p.overs}ov </span>}
                    {p.catches > 0 && <span>{p.catches}c </span>}
                  </div>

                  {/* Breakdown tooltip - Shows points breakdown on hover */}
                  <div style={{ position:'relative', group:'hover' }}>
                    <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:points>0?'var(--gold)':points<0?'var(--red)':'var(--text3)', flexShrink:0, minWidth:60, textAlign:'right', cursor:'pointer', title:breakdown.map(b => `${b.label}: ${b.pts}`).join(' | ') }}>
                      {points > 0 ? `+${points}` : points}
                    </div>
                    {breakdown.length > 0 && (
                      <div style={{ position:'absolute', right:0, bottom:'100%', background:'var(--navy4)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', fontSize:10, color:'var(--text2)', minWidth:'200px', marginBottom:8, zIndex:10, display:'none', whiteSpace:'pre-wrap' }}>
                        {breakdown.map((b, j) => (
                          <div key={j} style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                            <span>{b.label}</span>
                            <span style={{ fontWeight:700, color:b.pts > 0 ? 'var(--teal)' : 'var(--red)' }}>{b.pts > 0 ? `+${b.pts}` : b.pts}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:10, fontSize:13, color:'var(--text2)' }}>
            💡 <strong>Tip:</strong> Uncheck players not in any squad to skip them. Fix wrong matches using the dropdown.
            Total fantasy points to be awarded: <span style={{ color:'var(--gold)', fontWeight:700 }}>
              {extractedPerfs.performances.filter(p => p.include && p.player_id).reduce((a, p) => a + calculateFantasyPoints(p).points, 0)} pts
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
            RCB beat SRH in the opener on 28 March.<br />
            {member?.is_admin ? 'Add the match and upload the scorecard screenshot!' : 'Admin will add matches soon.'}
          </div>
          {member?.is_admin && (
            <button className="btn btn-primary" onClick={() => setShowAddMatch(true)} style={{ padding:'12px 28px', fontSize:15, marginTop:8 }}>
              + Add First Match
            </button>
          )}
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
            const isSelected = selectedMatch === m.id

            return (
              <div key={m.id} style={{ background:'var(--navy2)', border:`1px solid ${isSelected?'rgba(0,212,170,0.3)':'var(--border)'}`, borderRadius:14, overflow:'hidden', transition:'all 0.2s' }}>

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
                    {(expandedMatch === m.id ? matchPerfs : matchPerfs.slice(0, 3)).map(p => {
                      const { points, breakdown } = calculateFantasyPoints(p)
                      return (
                        <div key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 14px' }}>
                            <div style={{ minWidth:0, flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
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
                      <div
                        onClick={() => setExpandedMatch(expandedMatch === m.id ? null : m.id)}
                        style={{ padding:'8px 14px', fontSize:11, color:'var(--gold)', textAlign:'center', borderBottom:'1px solid var(--border)', cursor:'pointer', fontWeight:600, background:'rgba(240,165,0,0.03)' }}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(240,165,0,0.06)'}
                        onMouseLeave={e => e.currentTarget.style.background='rgba(240,165,0,0.03)'}
                      >
                        {expandedMatch === m.id
                          ? '▲ Show less'
                          : `▼ View all ${matchPerfs.length} players`
                        }
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ padding:14, color:'var(--text3)', fontSize:13, textAlign:'center' }}>
                    {m.status === 'upcoming' ? '📅 Upcoming match' : allPerfs.length > 0 ? `${allPerfs.length} performances recorded (none from your squad)` : 'No performances yet'}
                  </div>
                )}

                {myPts > 0 && (
                  <div style={{ padding:'8px 14px', background:'rgba(240,165,0,0.04)', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid rgba(240,165,0,0.1)' }}>
                    <span style={{ fontSize:11, color:'var(--text3)' }}>Your total</span>
                    <span style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>+{myPts} pts</span>
                  </div>
                )}

                {/* League user points for this match */}
                {(() => {
                  const userPts = (allUserMatchPoints[m.id] || [])
                    .map(p => {
                      const mem2 = leagueMembers.find(lm => lm.user_id === p.user_id)
                      return { ...p, member: mem2 }
                    })
                    .filter(p => p.member)
                    .sort((a, b) => b.total_points - a.total_points)
                  if (userPts.length === 0) return null
                  return (
                    <div style={{ borderTop:'1px solid var(--border)', background:'rgba(0,212,170,0.02)' }}>
                      <div style={{ padding:'6px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600 }}>League Points</span>
                        <span style={{ fontSize:10, color:'var(--text3)' }}>{userPts.length} user{userPts.length !== 1 ? 's' : ''}</span>
                      </div>
                      {userPts.map(up => {
                        const isMe2 = up.user_id === profile?.id
                        return (
                          <div key={up.user_id} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 14px', background: isMe2 ? 'rgba(240,165,0,0.04)' : 'transparent' }}>
                            <div style={{ width:18, height:18, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:7, fontWeight:700, color:'var(--text2)', flexShrink:0, overflow:'hidden' }}>
                              {up.member?.profiles?.avatar_url
                                ? <img src={up.member.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                                : up.member?.profiles?.name?.slice(0,2).toUpperCase()}
                            </div>
                            <div style={{ flex:1, fontSize:11, color: isMe2 ? 'var(--gold)' : 'var(--text2)', fontWeight: isMe2 ? 600 : 400, minWidth:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {up.member?.profiles?.name?.split(' ')[0]}
                              {isMe2 && <span style={{ fontSize:8, marginLeft:3, color:'var(--gold)', fontWeight:700 }}>YOU</span>}
                            </div>
                            <div style={{ fontFamily:'Rajdhani', fontSize:14, fontWeight:700, color: up.total_points > 0 ? 'var(--teal)' : up.total_points < 0 ? 'var(--red)' : 'var(--text3)', flexShrink:0 }}>
                              {up.total_points > 0 ? `+${up.total_points}` : up.total_points}
                            </div>
                          </div>
                        )
                      })}
                      <div style={{ height:4 }} />
                    </div>
                  )
                })()}

                {/* Admin upload section */}
                {member?.is_admin && (
                  <div style={{ borderTop:'1px solid var(--border)', background:'var(--navy3)' }}>

                    {/* Upload scorecard button */}
                    <div style={{ padding:'10px 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                      <input ref={isSelected ? fileRef : null} type="file" accept="image/*"
                        style={{ display:'none' }}
                        onChange={e => {
                          if (e.target.files[0]) {
                            uploadScorecard(e.target.files[0], m.id)
                            if (fileRef.current) fileRef.current.value = ''
                          }
                        }} />

                      <button
                        className="btn btn-teal"
                        style={{ fontSize:12, padding:'5px 14px', borderRadius:8 }}
                        onClick={() => {
                          setSelectedMatch(m.id)
                          setTimeout(() => fileRef.current?.click(), 50)
                        }}
                        disabled={uploading && selectedMatch === m.id}>
                        {uploading && selectedMatch === m.id ? '🤖 AI Reading...' : '📸 Upload Scorecard'}
                      </button>

                      <button
                        className="btn btn-teal"
                        style={{ fontSize:12, padding:'5px 14px', borderRadius:8 }}
                        onClick={() => {
                          setSelectedMatch(m.id)
                          setManualScorecard({ match_id: m.id, batting: '', bowling: '', fielding: '' })
                          setShowManualInput(true)
                        }}>
                        📋 Paste Data
                      </button>

                      <select value={m.status}
                        onChange={e => supabase.from('matches').update({ status: e.target.value }).eq('id', m.id).then(() => load())}
                        style={{ fontSize:11, padding:'4px 8px', borderRadius:8, background:'var(--navy4)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer' }}>
                        <option value="upcoming">Upcoming</option>
                        <option value="live">Live</option>
                        <option value="completed">Completed</option>
                      </select>

                      <button onClick={() => deleteMatch(m.id)}
                        style={{ fontSize:11, padding:'4px 8px', borderRadius:8, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer' }}>
                        🗑
                      </button>
                    </div>

                    {allPerfs.length > 0 && (
                      <div style={{ padding:'0 14px 8px', fontSize:11, color:'var(--text3)' }}>
                        ✅ {allPerfs.length} performances saved
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