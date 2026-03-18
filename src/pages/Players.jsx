import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { TEAM_COLORS } from '../lib/players'

const ROLES = ['All', 'Batsman', 'Bowler', 'All-Rounder', 'WK-Batsman']
const TEAMS = ['All', 'MI', 'CSK', 'RCB', 'KKR', 'RR', 'DC', 'PBKS', 'SRH', 'GT', 'LSG']
const ROLE_CLASS = { 'Batsman': 'bat', 'Bowler': 'bowl', 'All-Rounder': 'ar', 'WK-Batsman': 'wk' }

export default function Players() {
  const { profile } = useAuth()
  const [players, setPlayers] = useState([])
  const [squad, setSquad] = useState({}) // player_id -> {user, price}
  const [roleFilter, setRoleFilter] = useState('All')
  const [teamFilter, setTeamFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [view, setView] = useState('all') // all | mine
  const [league, setLeague] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pointsMap, setPointsMap] = useState({})

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    setLoading(true)
    const { data: mem } = await supabase.from('league_members').select('*, leagues(*)').eq('user_id', profile.id).single()
    if (mem) setLeague(mem.leagues)

    const { data: allPlayers } = await supabase.from('players').select('*').order('name')
    setPlayers(allPlayers || [])

    if (mem) {
      const { data: squadData } = await supabase
        .from('squad')
        .select('*, profiles(name, avatar_url)')
        .eq('league_id', mem.league_id)

      const squadMap = {}
      squadData?.forEach(s => { squadMap[s.player_id] = s })
      setSquad(squadMap)

      // Get fantasy points per player
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
    if (view === 'mine' && !squad[p.id]?.user_id === profile?.id) return false
    return true
  })

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}><div style={{ fontFamily: 'Rajdhani', fontSize: 20, color: 'var(--gold)' }}>Loading players...</div></div>

  return (
    <div>
      <div className="fade-in" style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Rajdhani', fontSize: 32, fontWeight: 700 }}>Player Database</h1>
        <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 2 }}>{players.length} IPL 2026 players · {Object.keys(squad).length} sold in auction</div>
      </div>

      {/* Filters */}
      <div className="fade-in-1" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="🔍 Search by name or team..." value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {ROLES.map(r => (
            <button key={r} onClick={() => setRoleFilter(r)} style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
              background: roleFilter === r ? 'var(--gold)' : 'var(--navy2)',
              color: roleFilter === r ? 'var(--navy)' : 'var(--text2)',
            }}>{r}</button>
          ))}
          <div style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
          <button onClick={() => setView(view === 'all' ? 'mine' : 'all')} style={{
            padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            border: `1px solid ${view === 'mine' ? 'rgba(0,201,167,0.4)' : 'var(--border)'}`,
            cursor: 'pointer', transition: 'all 0.15s',
            background: view === 'mine' ? 'rgba(0,201,167,0.1)' : 'var(--navy2)',
            color: view === 'mine' ? 'var(--teal)' : 'var(--text2)',
          }}>🏏 My Squad</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TEAMS.map(t => (
            <button key={t} onClick={() => setTeamFilter(t)} style={{
              padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.15s',
              background: teamFilter === t ? (TEAM_COLORS[t]?.bg || 'var(--navy3)') : 'var(--navy2)',
              color: teamFilter === t ? (TEAM_COLORS[t]?.text || 'var(--text)') : 'var(--muted)',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="fade-in-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map(p => {
          const squadEntry = squad[p.id]
          const isOwned = !!squadEntry
          const isMine = squadEntry?.user_id === profile?.id
          const pts = pointsMap[p.id] || 0
          const roleClass = ROLE_CLASS[p.role]

          return (
            <div key={p.id} style={{
              background: 'var(--navy2)', border: `1px solid ${isMine ? 'rgba(245,166,35,0.4)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', overflow: 'hidden', transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = isMine ? 'rgba(245,166,35,0.6)' : 'rgba(255,255,255,0.15)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = isMine ? 'rgba(245,166,35,0.4)' : 'var(--border)' }}>

              {/* Top */}
              <div style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 10, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700,
                  background: roleClass === 'bat' ? 'rgba(245,166,35,0.15)' : roleClass === 'bowl' ? 'rgba(0,201,167,0.15)' : roleClass === 'ar' ? 'rgba(232,69,69,0.15)' : 'rgba(59,130,246,0.15)',
                  color: roleClass === 'bat' ? 'var(--gold)' : roleClass === 'bowl' ? 'var(--teal)' : roleClass === 'ar' ? 'var(--red)' : 'var(--blue)',
                }}>
                  {p.image_initials || p.name.slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <span className={`badge badge-${roleClass}`} style={{ fontSize: 10, padding: '2px 7px' }}>{p.role}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.team}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, marginTop: 3 }}>
                    {isOwned ? `Sold: ₹${squadEntry.bought_price}Cr` : `Base: ₹${p.base_price}Cr`}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '1px solid var(--border)' }}>
                {p.runs > 0 && <div style={{ padding: '8px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}><div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700 }}>{p.runs}</div><div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runs</div></div>}
                {p.wickets > 0 && <div style={{ padding: '8px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}><div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700 }}>{p.wickets}</div><div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Wickets</div></div>}
                {p.strike_rate && <div style={{ padding: '8px 12px', textAlign: 'center', borderRight: '1px solid var(--border)' }}><div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700 }}>{p.strike_rate}</div><div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SR</div></div>}
                {p.economy && <div style={{ padding: '8px 12px', textAlign: 'center' }}><div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700 }}>{p.economy}</div><div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Econ</div></div>}
                {!p.strike_rate && !p.economy && <div style={{ padding: '8px 12px', textAlign: 'center' }}><div style={{ fontFamily: 'Rajdhani', fontSize: 18, fontWeight: 700 }}>{p.matches}</div><div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Matches</div></div>}
              </div>

              {/* Footer */}
              <div style={{ background: '#0A1220', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fantasy Pts</div>
                  <div style={{ fontFamily: 'Rajdhani', fontSize: 16, fontWeight: 700, color: 'var(--gold)' }}>{pts} pts</div>
                </div>
                {isOwned && (
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                    background: isMine ? 'rgba(0,201,167,0.15)' : 'rgba(255,255,255,0.07)',
                    color: isMine ? 'var(--teal)' : 'var(--muted)' }}>
                    {isMine ? 'Your squad' : squadEntry.profiles?.name?.split(' ')[0] + "'s"}
                  </div>
                )}
                {!isOwned && <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>Unsold</div>}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏏</div>
          <div>No players found matching your filters</div>
        </div>
      )}
    </div>
  )
}
