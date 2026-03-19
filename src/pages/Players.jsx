import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { getSelectedLeagueId } from '../lib/selectedLeague'

const ROLES = ['All', 'Batsman', 'Bowler', 'All-Rounder', 'WK-Batsman']
const TEAMS = ['All', 'MI', 'CSK', 'RCB', 'KKR', 'RR', 'DC', 'PBKS', 'SRH', 'GT', 'LSG']
const ROLE_CLASS = { 'Batsman':'bat','Bowler':'bowl','All-Rounder':'ar','WK-Batsman':'wk' }
const ROLE_BG = { 'bat':'rgba(240,165,0,0.1)','bowl':'rgba(0,212,170,0.1)','ar':'rgba(255,71,87,0.1)','wk':'rgba(75,159,255,0.1)' }
const ROLE_TEXT = { 'bat':'var(--gold)','bowl':'var(--teal)','ar':'var(--red)','wk':'var(--blue)' }
const TEAM_COLORS = {
  MI:'#004BA0',CSK:'#F5A623',RCB:'#C8102E',KKR:'#3A225D',
  RR:'#EA1A85',DC:'#0078BC',PBKS:'#ED1B24',SRH:'#FF822A',
  GT:'#1C1C5E',LSG:'#A72056'
}

export default function Players() {
  const { profile } = useAuth()
  const [players, setPlayers] = useState([])
  const [squad, setSquad] = useState({})
  const [roleFilter, setRoleFilter] = useState('All')
  const [teamFilter, setTeamFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('all')
  const [loading, setLoading] = useState(true)
  const [pointsMap, setPointsMap] = useState({})
  const [sortBy, setSortBy] = useState('name')
  const [league, setLeague] = useState(null)

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
const { data: mems } = await supabase.from('league_members').select('*, leagues(*)')
  .eq('user_id', profile.id)
const savedId = getSelectedLeagueId()
const mem = (savedId && mems?.find(m => m.league_id === savedId)) || mems?.[0]
    if (mem) setLeague(mem.leagues)
    const { data: allPlayers } = await supabase.from('players').select('*').order('name')
    setPlayers(allPlayers || [])
    if (mem) {
      const { data: squadData } = await supabase.from('squad').select('*, profiles(name)')
        .eq('league_id', mem.league_id)
      const squadMap = {}
      squadData?.forEach(s => { squadMap[s.player_id] = s })
      setSquad(squadMap)
      const { data: perfs } = await supabase.from('performances').select('player_id, fantasy_points')
      const pm = {}
      perfs?.forEach(p => { pm[p.player_id] = (pm[p.player_id] || 0) + p.fantasy_points })
      setPointsMap(pm)
    }
    setLoading(false)
  }

  const filtered = players.filter(p => {
    if (roleFilter !== 'All' && p.role !== roleFilter) return false
    if (teamFilter !== 'All' && p.team !== teamFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.team.toLowerCase().includes(search.toLowerCase())) return false
    if (view === 'mine' && !squad[p.id]) return false
    if (view === 'available' && squad[p.id]) return false
    return true
  }).sort((a, b) => {
    if (sortBy === 'points') return (pointsMap[b.id]||0) - (pointsMap[a.id]||0)
    if (sortBy === 'price') return (squad[b.id]?.bought_price||0) - (squad[a.id]?.bought_price||0)
    return a.name.localeCompare(b.name)
  })

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading players...</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>IPL 2026</div>
        <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px,5vw,36px)', fontWeight:700, marginBottom:4 }}>Player Database</h1>
        <div style={{ color:'var(--text2)', fontSize:13 }}>
          {players.length} players · {Object.keys(squad).length} sold · {players.length - Object.keys(squad).length} available
        </div>
      </div>

      {/* Search */}
      <div className="fade-up-1" style={{ marginBottom:14 }}>
        <div style={{ position:'relative', marginBottom:12 }}>
          <div style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', fontSize:15 }}>🔍</div>
          <input className="input" placeholder="Search player or team..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft:38 }} />
        </div>

        {/* View + Sort */}
        <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
          {[{ key:'all',label:'All' },{ key:'mine',label:'My Squad' },{ key:'available',label:'Available' }].map(v => (
            <button key={v.key} onClick={() => setView(v.key)} style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, border:`1px solid ${view===v.key?'rgba(240,165,0,0.4)':'var(--border)'}`, cursor:'pointer', background:view===v.key?'rgba(240,165,0,0.1)':'var(--navy2)', color:view===v.key?'var(--gold)':'var(--text2)' }}>{v.label}</button>
          ))}
          <div style={{ width:1, background:'var(--border)', margin:'0 2px' }} />
          {[{ key:'name',label:'A-Z' },{ key:'points',label:'Top Pts' },{ key:'price',label:'Price' }].map(s => (
            <button key={s.key} onClick={() => setSortBy(s.key)} style={{ padding:'5px 12px', borderRadius:20, fontSize:12, fontWeight:600, border:`1px solid ${sortBy===s.key?'rgba(0,212,170,0.4)':'var(--border)'}`, cursor:'pointer', background:sortBy===s.key?'var(--teal2)':'var(--navy2)', color:sortBy===s.key?'var(--teal)':'var(--text2)' }}>{s.label}</button>
          ))}
        </div>

        {/* Role filters */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
          {ROLES.map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:600, border:`1px solid ${roleFilter===r?'rgba(240,165,0,0.4)':'var(--border)'}`, cursor:'pointer', background:roleFilter===r?'var(--gold)':'var(--navy2)', color:roleFilter===r?'var(--navy)':'var(--text2)' }}>{r}</button>
          ))}
        </div>

        {/* Team filters */}
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {TEAMS.map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, border:`1px solid ${teamFilter===t?TEAM_COLORS[t]||'var(--gold)':'var(--border)'}`, cursor:'pointer', background:teamFilter===t?`${TEAM_COLORS[t]}22`:'var(--navy2)', color:teamFilter===t?TEAM_COLORS[t]||'var(--gold)':'var(--text3)' }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>
        <span style={{ color:'var(--text2)', fontWeight:600 }}>{filtered.length}</span> players
      </div>

      {/* Grid — responsive */}
      <div className="fade-up-2" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
        {filtered.map(p => {
          const sq = squad[p.id]
          const isOwned = !!sq
          const isMine = sq?.user_id === profile?.id
          const pts = pointsMap[p.id] || 0
          const rc = ROLE_CLASS[p.role]
          return (
            <div key={p.id} style={{ background:'var(--navy2)', border:`1px solid ${isMine?'rgba(240,165,0,0.25)':isOwned?'var(--border2)':'var(--border)'}`, borderRadius:14, overflow:'hidden', transition:'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>
              <div style={{ padding:'14px 14px 10px', display:'flex', gap:10, alignItems:'flex-start' }}>
                <div style={{ width:44, height:44, borderRadius:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:15, fontWeight:700, background:ROLE_BG[rc], color:ROLE_TEXT[rc] }}>
                  {p.image_initials||p.name.slice(0,2)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:4 }}>{p.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <span className={`badge badge-${rc}`} style={{ fontSize:10 }}>{p.role}</span>
                    <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>{p.team}</span>
                  </div>
                  <div style={{ fontSize:11, marginTop:4, color:isOwned?'var(--gold)':'var(--text3)' }}>
                    {isOwned ? `₹${sq.bought_price}Cr · ${isMine?'Your squad':`${sq.profiles?.name?.split(' ')[0]}'s`}` : `Base ₹${p.base_price}Cr`}
                  </div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderTop:'1px solid var(--border)' }}>
                {p.runs > 0 && <div style={{ padding:'7px 10px', textAlign:'center', borderRight:'1px solid var(--border)' }}><div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700 }}>{p.runs}</div><div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>Runs</div></div>}
                {p.wickets > 0 && <div style={{ padding:'7px 10px', textAlign:'center', borderRight:'1px solid var(--border)' }}><div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700 }}>{p.wickets}</div><div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>Wkts</div></div>}
                {p.strike_rate && <div style={{ padding:'7px 10px', textAlign:'center', borderRight:'1px solid var(--border)' }}><div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700 }}>{p.strike_rate}</div><div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>SR</div></div>}
                {p.economy && <div style={{ padding:'7px 10px', textAlign:'center' }}><div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700 }}>{p.economy}</div><div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>Econ</div></div>}
                {!p.strike_rate && !p.economy && <div style={{ padding:'7px 10px', textAlign:'center' }}><div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700 }}>{p.matches}</div><div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>M</div></div>}
              </div>

              <div style={{ background:'var(--navy3)', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Fantasy Pts</div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--gold)' }}>{pts} pts</div>
                </div>
                <div style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:isMine?'var(--teal2)':isOwned?'var(--navy4)':'var(--navy4)', color:isMine?'var(--teal)':isOwned?'var(--text3)':'var(--text3)', border:`1px solid ${isMine?'rgba(0,212,170,0.2)':'var(--border)'}` }}>
                  {isMine?'✓ Yours':isOwned?`${sq.profiles?.name?.split(' ')[0]}'s`:'Available'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign:'center', padding:48, color:'var(--text3)' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>🏏</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:600 }}>No players found</div>
        </div>
      )}
    </div>
  )
}