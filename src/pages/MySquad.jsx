import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getSelectedLeagueId } from '../lib/selectedLeague'

const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.12)','Bowler':'rgba(0,212,170,0.12)','All-Rounder':'rgba(255,71,87,0.12)','WK-Batsman':'rgba(75,159,255,0.12)' }
const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }
const ROLE_BORDER = { 'Batsman':'rgba(240,165,0,0.25)','Bowler':'rgba(0,212,170,0.25)','All-Rounder':'rgba(255,71,87,0.25)','WK-Batsman':'rgba(75,159,255,0.25)' }

export default function MySquad() {
  const { profile } = useAuth()
  const [league, setLeague] = useState(null)
  const [squad, setSquad] = useState([])
  const [perfMap, setPerfMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])

  async function loadSquad(lg) {
    const { data } = await supabase.from('squad').select('*, players(*)')
      .eq('league_id', lg.id).eq('user_id', profile.id)
      .order('bought_price', { ascending: false })
    setSquad(data || [])

    const { data: reqs } = await supabase.from('release_requests').select('player_id,status')
      .eq('league_id', lg.id).eq('user_id', profile.id).eq('status', 'pending')
    setRequests(reqs || [])

    // Load detailed performance stats
    const { data: perfData } = await supabase
      .from('player_match_performances')
      .select('player_id, match_id, runs, wickets, catches, fantasy_points')
      .eq('user_id', profile.id).eq('league_id', lg.id)

    const map = {}
    if (perfData) {
      for (const p of perfData) {
        if (!map[p.player_id]) {
          map[p.player_id] = { totalRuns: 0, totalWickets: 0, totalCatches: 0, totalPoints: 0, matchCount: 0 }
        }
        map[p.player_id].totalRuns += p.runs || 0
        map[p.player_id].totalWickets += p.wickets || 0
        map[p.player_id].totalCatches += p.catches || 0
        map[p.player_id].totalPoints += p.fantasy_points || 0
        map[p.player_id].matchCount += 1
      }
      for (const id of Object.keys(map)) {
        map[id].avgPoints = map[id].matchCount > 0 ? Math.round(map[id].totalPoints / map[id].matchCount) : 0
      }
    }
    setPerfMap(map)
  }

  async function loadLeague() {
    setLoading(true)
    const { data: mems } = await supabase
      .from('league_members').select('*, leagues(*)')
      .eq('user_id', profile.id)
    if (!mems || mems.length === 0) { setLoading(false); return }
    const savedId = getSelectedLeagueId()
    const mem = (savedId && mems.find(m => m.league_id === savedId)) || mems[0]
    if (mem?.leagues) {
      setLeague(mem.leagues)
      await loadSquad(mem.leagues)
    }
    setLoading(false)
  }

  useEffect(() => { if (profile) loadLeague() }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  async function requestRelease(playerId, playerName, boughtPrice) {
    if (!confirm(`Request release of ${playerName}?\nAdmin must approve. You'll get ₹${boughtPrice}Cr back.`)) return
    const { data: existing } = await supabase.from('release_requests').select('id')
      .eq('player_id', playerId).eq('league_id', league.id).eq('status', 'pending').maybeSingle()
    if (existing) { alert('Already requested! Waiting for admin.'); return }
    const { error } = await supabase.from('release_requests').insert({
      league_id: league.id, user_id: profile.id, player_id: playerId, status: 'pending'
    })
    if (error) alert('Error: ' + error.message)
    else { alert('Request sent!'); await loadSquad(league) }
  }

  const totalSpent = squad.reduce((a, s) => a + (s.bought_price || 0), 0)
  const pendingIds = new Set(requests.map(r => r.player_id))
  const totalPoints = Object.values(perfMap).reduce((a, p) => a + p.totalPoints, 0)
  const totalMatches = Object.values(perfMap).length > 0 ? Math.max(...Object.values(perfMap).map(p => p.matchCount)) : 0

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid rgba(240,165,0,0.2)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text3)', fontSize:14 }}>Loading squad...</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:'Rajdhani', fontSize:28, fontWeight:700, marginBottom:4 }}>
          🏏 My Squad
        </h1>
        <div style={{ fontSize:13, color:'var(--text3)' }}>
          {league ? league.name : 'No league found'}
        </div>
      </div>

      {/* Stats Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:10, marginBottom:24 }}>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600, marginBottom:4 }}>Players</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:'var(--text)' }}>{squad.length}<span style={{ fontSize:14, color:'var(--text3)', fontWeight:400 }}>/15</span></div>
        </div>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600, marginBottom:4 }}>Spent</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:'var(--red)' }}>₹{totalSpent}<span style={{ fontSize:14, fontWeight:400 }}>Cr</span></div>
        </div>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600, marginBottom:4 }}>Total Points</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:'var(--gold)' }}>⭐ {totalPoints}</div>
        </div>
        <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', fontWeight:600, marginBottom:4 }}>Matches</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:'var(--teal)' }}>{totalMatches}</div>
        </div>
      </div>

      {/* Squad Grid */}
      {squad.length === 0 ? (
        <div style={{ padding:48, textAlign:'center', background:'var(--navy2)', border:'2px dashed var(--border)', borderRadius:14, color:'var(--text3)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🏏</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:600, marginBottom:6 }}>No players in your squad</div>
          <div style={{ fontSize:14 }}>Go to Auction to start bidding!</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))', gap:14 }}>
          {squad.map(s => {
            const player = s.players
            const isPending = pendingIds.has(s.player_id)
            const perf = perfMap[s.player_id]
            const role = player?.role
            return (
              <div key={s.id} style={{
                background:'var(--navy2)',
                border:`1px solid ${ROLE_BORDER[role] || 'var(--border)'}`,
                borderRadius:14, overflow:'hidden', transition:'all 0.2s'
              }}
                onMouseEnter={e => { e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow='0 8px 28px rgba(0,0,0,0.25)' }}
                onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>

                {/* Player Header */}
                <div style={{ padding:'14px 16px 10px', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{
                    width:46, height:46, borderRadius:12, flexShrink:0,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontFamily:'Rajdhani', fontSize:15, fontWeight:700,
                    background:ROLE_BG[role], color:ROLE_TEXT[role]
                  }}>
                    {player?.image_initials || player?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {player?.name}
                    </div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, display:'flex', alignItems:'center', gap:6 }}>
                      <span>{player?.team}</span>
                      <span style={{ width:3, height:3, borderRadius:'50%', background:'var(--text3)', display:'inline-block' }} />
                      <span style={{ color:ROLE_TEXT[role], fontWeight:600 }}>{role}</span>
                    </div>
                    {s.is_traded && <div style={{ fontSize:10, color:'var(--teal)', fontWeight:700, marginTop:2 }}>🔄 Traded</div>}
                  </div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)', flexShrink:0 }}>
                    ₹{s.bought_price}Cr
                  </div>
                </div>

                {/* Performance Stats */}
                <div style={{ padding:'8px 16px 10px', borderTop:'1px solid var(--border)', background:'rgba(0,0,0,0.15)' }}>
                  {perf ? (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:6 }}>
                      <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--navy3)', borderRadius:8 }}>
                        <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>🏃 Runs</div>
                        <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--text)' }}>{perf.totalRuns}</div>
                      </div>
                      <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--navy3)', borderRadius:8 }}>
                        <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>🎳 Wickets</div>
                        <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--teal)' }}>{perf.totalWickets}</div>
                      </div>
                      <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--navy3)', borderRadius:8 }}>
                        <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>🤚 Catches</div>
                        <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--blue)' }}>{perf.totalCatches}</div>
                      </div>
                      <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--navy3)', borderRadius:8 }}>
                        <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>⭐ Points</div>
                        <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--gold)' }}>{perf.totalPoints}</div>
                      </div>
                      <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--navy3)', borderRadius:8 }}>
                        <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>📊 Matches</div>
                        <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--text)' }}>{perf.matchCount}</div>
                      </div>
                      <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--navy3)', borderRadius:8 }}>
                        <div style={{ fontSize:10, color:'var(--text3)', marginBottom:2 }}>📈 Avg</div>
                        <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--teal)' }}>{perf.avgPoints}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign:'center', padding:'8px 0', fontSize:12, color:'var(--text3)' }}>
                      No match data yet
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ background:'var(--navy3)', padding:'8px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--border)' }}>
                  {isPending ? (
                    <span style={{ fontSize:11, padding:'3px 8px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--gold)', fontWeight:700 }}>⏳ Release Pending</span>
                  ) : (
                    <button onClick={() => requestRelease(s.player_id, player?.name, s.bought_price)}
                      style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer', fontWeight:600 }}>
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
