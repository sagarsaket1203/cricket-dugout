import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IPL_PLAYERS } from '../lib/players'
import { backfillFantasyPoints } from '../lib/backfillFantasyPoints'

const ADMIN_EMAIL = 'sagarsaket120305@gmail.com'

export default function Admin() {
  const { profile } = useAuth()
  const [leagues, setLeagues] = useState([])
  const [selectedLeague, setSelectedLeague] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('league')
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('leagues').select('*')
      .eq('created_by', profile.id)
      .order('created_at', { ascending: false })
    setLeagues(data || [])
    if (data?.length > 0) setSelectedLeague(data[0])
    setLoading(false)
  }

  function showMsg(text, type = 'success') {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  if (profile?.email !== ADMIN_EMAIL) return (
    <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🔒</div>
      <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700 }}>Admin Only</div>
    </div>
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading admin panel...</div>
    </div>
  )

  const tabs = [
    { key:'league', label:'🏆 League' },
    { key:'players', label:'🏏 Players' },
    { key:'members', label:'👥 Members' },
    { key:'releases', label:'🔓 Releases' },
    { key:'trades', label:'🔄 Trades' },
    { key:'utilities', label:'🔧 Utilities' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Admin Panel</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px,5vw,36px)', fontWeight:700, marginBottom:4 }}>League Management</h1>
          <div style={{ color:'var(--text2)', fontSize:13 }}>Create and manage multiple IPL Fantasy leagues</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setSelectedLeague(null); setActiveTab('league') }} style={{ padding:'10px 20px' }}>
          + New League
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div style={{ padding:'10px 14px', background:msgType==='error'?'var(--red2)':'var(--teal2)', border:`1px solid ${msgType==='error'?'rgba(255,71,87,0.3)':'rgba(0,212,170,0.3)'}`, borderRadius:10, marginBottom:14, color:msgType==='error'?'var(--red)':'var(--teal)', fontSize:13, fontWeight:500 }}>
          {msg}
        </div>
      )}

      {/* League selector */}
      {leagues.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:10 }}>Your Leagues</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {leagues.map(lg => (
              <div key={lg.id} onClick={() => { setSelectedLeague(lg); setActiveTab('league') }}
                style={{ padding:'10px 16px', borderRadius:12, cursor:'pointer', border:`1px solid ${selectedLeague?.id===lg.id?'rgba(240,165,0,0.4)':'var(--border)'}`, background:selectedLeague?.id===lg.id?'rgba(240,165,0,0.1)':'var(--navy2)', transition:'all 0.15s' }}>
                <div style={{ fontSize:13, fontWeight:600, color:selectedLeague?.id===lg.id?'var(--gold)':'var(--text)' }}>{lg.name}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                  Code: <span style={{ color:'var(--gold)', fontFamily:'Rajdhani', fontWeight:700, letterSpacing:1 }}>{lg.invite_code?.toUpperCase()}</span>
                </div>
              </div>
            ))}
            <div onClick={() => { setSelectedLeague(null); setActiveTab('league') }}
              style={{ padding:'10px 16px', borderRadius:12, cursor:'pointer', border:`2px dashed ${!selectedLeague?'rgba(240,165,0,0.4)':'var(--border)'}`, background:!selectedLeague?'rgba(240,165,0,0.05)':'transparent', display:'flex', alignItems:'center', gap:6, color:'var(--text3)', fontSize:13 }}>
              + Create New
            </div>
          </div>
        </div>
      )}

      {/* Tabs - only show if league selected */}
      {selectedLeague && (
        <div style={{ display:'flex', gap:6, marginBottom:20, flexWrap:'wrap' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
              padding:'8px 16px', borderRadius:10, fontSize:13, fontWeight:600,
              border:`1px solid ${activeTab===t.key?'rgba(240,165,0,0.4)':'var(--border)'}`,
              cursor:'pointer', transition:'all 0.15s',
              background:activeTab===t.key?'rgba(240,165,0,0.1)':'var(--navy2)',
              color:activeTab===t.key?'var(--gold)':'var(--text2)',
            }}>{t.label}</button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, padding:20 }}>
        {(!selectedLeague || activeTab === 'league') && (
          <LeagueTab
            profile={profile}
            league={selectedLeague}
            setLeague={(lg) => { setSelectedLeague(lg); setLeagues(prev => [lg, ...prev.filter(l => l.id !== lg.id)]) }}
            showMsg={showMsg}
          />
        )}
        {selectedLeague && activeTab === 'players' && <PlayersTab league={selectedLeague} showMsg={showMsg} />}
        {selectedLeague && activeTab === 'members' && <MembersTab league={selectedLeague} showMsg={showMsg} />}
        {selectedLeague && activeTab === 'releases' && <ReleasesTab league={selectedLeague} showMsg={showMsg} />}
        {selectedLeague && activeTab === 'trades' && <AdminTrades league={selectedLeague} showMsg={showMsg} />}
        {selectedLeague && activeTab === 'utilities' && <UtilitiesTab league={selectedLeague} showMsg={showMsg} />}
      </div>
    </div>
  )
}

// ==================== LEAGUE TAB ====================
function LeagueTab({ profile, league, setLeague, showMsg }) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  async function createLeague() {
    if (!name.trim()) { showMsg('Enter a league name!', 'error'); return }
    setCreating(true)
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase()
    const { data: lg, error } = await supabase.from('leagues').insert({
      name: name.trim(),
      invite_code: invite_code.toLowerCase(),
      purse_limit: 120,
      created_by: profile.id
    }).select().single()
    if (error) { showMsg('Error: ' + error.message, 'error'); setCreating(false); return }
    await supabase.from('league_members').insert({
      league_id: lg.id, user_id: profile.id, purse_remaining: 120, is_admin: true
    })
    setLeague(lg)
    showMsg(`✅ League "${lg.name}" created! Share the invite code.`)
    setName('')
    setCreating(false)
  }

  async function resetPurses() {
    if (!league) return
    if (!confirm('Recalculate ALL purses based on current squads?')) return
    const { data: members } = await supabase.from('league_members').select('user_id')
      .eq('league_id', league.id)
    for (const m of members || []) {
      const { data: sq } = await supabase.from('squad').select('bought_price')
        .eq('league_id', league.id).eq('user_id', m.user_id)
      const spent = sq?.reduce((a, s) => a + s.bought_price, 0) || 0
      await supabase.from('league_members').update({ purse_remaining: 120 - spent })
        .eq('league_id', league.id).eq('user_id', m.user_id)
    }
    showMsg('All purses recalculated!')
  }

  async function deleteLeague() {
    if (!league) return
    if (!confirm(`DELETE league "${league.name}"? This will remove ALL squads, bids, and members. This cannot be undone!`)) return
    if (!confirm('Are you absolutely sure? Type OK to confirm.')) return
    await supabase.from('match_points').delete().eq('league_id', league.id)
    await supabase.from('performances').delete().eq('match_id', league.id)
    await supabase.from('squad').delete().eq('league_id', league.id)
    await supabase.from('release_requests').delete().eq('league_id', league.id)
    await supabase.from('trade_requests').delete().eq('league_id', league.id)
    await supabase.from('auction_bids').delete().eq('league_id', league.id)
    await supabase.from('league_members').delete().eq('league_id', league.id)
    await supabase.from('leagues').delete().eq('id', league.id)
    setLeague(null)
    showMsg('League deleted.')
    window.location.reload()
  }

  if (!league) return (
    <div>
      <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:6 }}>Create New League</h3>
      <div style={{ fontSize:13, color:'var(--text2)', marginBottom:16 }}>
        Each league is separate — different friends, different auction, different leaderboard.
      </div>
      <input className="input" placeholder="League name e.g. Office IPL Fantasy 2026" value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && createLeague()}
        style={{ marginBottom:12 }} />
      <button className="btn btn-primary" onClick={createLeague} disabled={creating} style={{ width:'100%', padding:14, fontSize:15 }}>
        {creating ? '⟳ Creating...' : '🏆 Create League'}
      </button>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:8 }}>
        <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>League Info</h3>
        <button className="btn btn-danger" onClick={deleteLeague} style={{ fontSize:12, padding:'6px 14px' }}>
          🗑 Delete League
        </button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'League Name', value:league.name },
          { label:'Invite Code', value:league.invite_code?.toUpperCase(), color:'var(--gold)', big:true },
          { label:'Purse Per Team', value:'₹120 Cr' },
          { label:'Created', value:new Date(league.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) },
        ].map((item, i) => (
          <div key={i} style={{ padding:'12px 16px', background:'var(--navy3)', borderRadius:10, border:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:4 }}>{item.label}</div>
            <div style={{ fontFamily:item.big?'Rajdhani':'inherit', fontSize:item.big?22:15, fontWeight:700, color:item.color||'var(--text)', letterSpacing:item.big?2:0 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(league.invite_code); showMsg('Invite code copied!') }}>
          📋 Copy Invite Code
        </button>
        <button className="btn btn-ghost" onClick={resetPurses}>
          🔄 Recalculate All Purses
        </button>
      </div>
    </div>
  )
}

// ==================== PLAYERS TAB ====================
function PlayersTab({ league, showMsg }) {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newPlayer, setNewPlayer] = useState({ name:'', team:'MI', role:'Batsman', base_price:2 })
  const TEAMS = ['MI','CSK','RCB','KKR','RR','DC','PBKS','SRH','GT','LSG']
  const ROLES = ['Batsman','Bowler','All-Rounder','WK-Batsman']

  useEffect(() => { loadPlayers() }, [])

  async function loadPlayers() {
    const { data } = await supabase.from('players').select('*').order('team')
    setPlayers(data || [])
    setLoading(false)
  }

  async function seedPlayers() {
  if (!confirm(`Load all ${IPL_PLAYERS.length} IPL 2026 players? This will clear old players first!`)) return
  setSeeding(true)

  // Check if any squad exists - don't delete if auction already started
  const { data: existingSquad } = await supabase.from('squad').select('id').limit(1)
  if (existingSquad?.length > 0) {
    showMsg('⚠️ Auction already started — cannot reload players. Clear squads first.', 'error')
    setSeeding(false); return
  }

  // Safe to clear and reload
  await supabase.from('auction_bids').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('league_unsold_players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  let added = 0
  for (const p of IPL_PLAYERS) {
    const { error } = await supabase.from('players').insert({
      name: p.name, team: p.team, role: p.role, base_price: p.base_price,
      batting_avg: p.batting_avg, strike_rate: p.strike_rate, economy: p.economy,
      matches: p.matches, runs: p.runs, wickets: p.wickets, image_initials: p.image_initials
    })
    if (!error) added++
  }
  showMsg(`✅ Done! ${added} players loaded fresh.`)
  loadPlayers()
  setSeeding(false)
}
  async function deletePlayer(id) {
    if (!confirm('Delete this player?')) return
    const { error } = await supabase.from('players').delete().eq('id', id)
    if (error) showMsg('Cannot delete — player may be in a squad.', 'error')
    else { showMsg('Player deleted.'); loadPlayers() }
  }

  async function addPlayer() {
    if (!newPlayer.name.trim()) { showMsg('Enter player name', 'error'); return }
    const { error } = await supabase.from('players').insert({
      name: newPlayer.name.trim(), team: newPlayer.team,
      role: newPlayer.role, base_price: parseInt(newPlayer.base_price) || 2,
      image_initials: newPlayer.name.trim().split(' ').map(w => w[0]).join('').slice(0,3).toUpperCase(),
      runs: 0, wickets: 0, matches: 0
    })
    if (error) showMsg('Error: ' + error.message, 'error')
    else {
      showMsg('Player added!')
      setShowAdd(false)
      setNewPlayer({ name:'', team:'MI', role:'Batsman', base_price:2 })
      loadPlayers()
    }
  }

  const filtered = players.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.team.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>
          Players <span style={{ color:'var(--text3)', fontWeight:400, fontSize:15 }}>({players.length})</span>
        </h3>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button className="btn btn-ghost" onClick={() => setShowAdd(!showAdd)} style={{ fontSize:13 }}>
            {showAdd ? '✕ Cancel' : '+ Add Player'}
          </button>
          <button className="btn btn-primary" onClick={seedPlayers} disabled={seeding} style={{ fontSize:13 }}>
            {seeding ? '⟳ Loading...' : '🏏 Load All IPL Players'}
          </button>
        </div>
      </div>

      {/* Add player form */}
      {showAdd && (
        <div style={{ background:'var(--navy3)', borderRadius:12, padding:16, marginBottom:16, border:'1px solid var(--border)' }}>
          <h4 style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, marginBottom:12 }}>Add New Player</h4>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:10, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Name *</div>
              <input className="input" placeholder="Player name" value={newPlayer.name}
                onChange={e => setNewPlayer({...newPlayer, name:e.target.value})}
                style={{ padding:'7px 10px', fontSize:13 }} />
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Team</div>
              <select className="input" value={newPlayer.team}
                onChange={e => setNewPlayer({...newPlayer, team:e.target.value})}
                style={{ padding:'7px 10px', fontSize:13 }}>
                {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Role</div>
              <select className="input" value={newPlayer.role}
                onChange={e => setNewPlayer({...newPlayer, role:e.target.value})}
                style={{ padding:'7px 10px', fontSize:13 }}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>Base Price (Cr)</div>
              <input className="input" type="number" min={1} max={20} value={newPlayer.base_price}
                onChange={e => setNewPlayer({...newPlayer, base_price:e.target.value})}
                style={{ padding:'7px 10px', fontSize:13 }} />
            </div>
          </div>
          <button className="btn btn-primary" onClick={addPlayer} style={{ fontSize:13, padding:'8px 20px' }}>
            Add Player
          </button>
        </div>
      )}

      <input className="input" placeholder="Search players..." value={search}
        onChange={e => setSearch(e.target.value)} style={{ marginBottom:14 }} />

      {loading ? (
        <div style={{ padding:20, textAlign:'center', color:'var(--text3)' }}>Loading...</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:8, maxHeight:500, overflowY:'auto' }} className="no-scroll">
          {filtered.map(p => (
            <div key={p.id} style={{ background:'var(--navy3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>
                  {p.team} · {p.role?.replace('All-Rounder','AR').replace('WK-Batsman','WK')} · ₹{p.base_price}Cr
                </div>
              </div>
              <button onClick={() => deletePlayer(p.id)}
                style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer', flexShrink:0 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ==================== MEMBERS TAB ====================
function MembersTab({ league, showMsg }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (league) loadMembers() }, [league])

  async function loadMembers() {
    const { data } = await supabase.from('league_members').select('*, profiles(*)')
      .eq('league_id', league.id)
    setMembers(data || [])
    setLoading(false)
  }

  async function removeMember(userId, name) {
    if (!confirm(`Remove ${name} from the league? Their squad will also be deleted.`)) return
    await supabase.from('squad').delete().eq('league_id', league.id).eq('user_id', userId)
    await supabase.from('auction_bids').delete().eq('league_id', league.id).eq('bidder_id', userId)
    await supabase.from('match_points').delete().eq('league_id', league.id).eq('user_id', userId)
    await supabase.from('league_members').delete().eq('league_id', league.id).eq('user_id', userId)
    showMsg(`${name} removed from league.`)
    loadMembers()
  }

  async function resetMemberPurse(userId, name) {
    if (!confirm(`Reset ${name}'s purse based on their current squad?`)) return
    const { data: sq } = await supabase.from('squad').select('bought_price')
      .eq('league_id', league.id).eq('user_id', userId)
    const spent = sq?.reduce((a, s) => a + s.bought_price, 0) || 0
    await supabase.from('league_members').update({ purse_remaining: 120 - spent })
      .eq('league_id', league.id).eq('user_id', userId)
    showMsg(`${name}'s purse reset to ₹${120 - spent}Cr!`)
    loadMembers()
  }

  if (loading) return <div style={{ padding:20, color:'var(--text3)' }}>Loading...</div>

  return (
    <div>
      <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:16 }}>
        Members <span style={{ color:'var(--text3)', fontWeight:400, fontSize:15 }}>({members.length})</span>
      </h3>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {members.map(m => (
          <div key={m.id} style={{ background:'var(--navy3)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg, var(--teal), var(--gold))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--navy)', overflow:'hidden', flexShrink:0 }}>
              {m.profiles?.avatar_url
                ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : m.profiles?.name?.slice(0,2).toUpperCase()}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                {m.profiles?.name}
                {m.is_admin && <span style={{ fontSize:9, background:'rgba(240,165,0,0.2)', color:'var(--gold)', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>ADMIN</span>}
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{m.profiles?.email}</div>
            </div>
            <div style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:m.purse_remaining < 20 ? 'var(--red)' : m.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)' }}>
              ₹{m.purse_remaining}Cr
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={() => resetMemberPurse(m.user_id, m.profiles?.name)}
                style={{ fontSize:11, padding:'4px 10px', borderRadius:7, border:'1px solid rgba(0,212,170,0.25)', background:'var(--teal2)', color:'var(--teal)', cursor:'pointer', fontWeight:600 }}>
                Reset Purse
              </button>
              {!m.is_admin && (
                <button onClick={() => removeMember(m.user_id, m.profiles?.name)}
                  style={{ fontSize:11, padding:'4px 10px', borderRadius:7, border:'1px solid rgba(255,71,87,0.25)', background:'var(--red2)', color:'var(--red)', cursor:'pointer', fontWeight:600 }}>
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ==================== RELEASES TAB ====================
function ReleasesTab({ league, showMsg }) {
  const [releases, setReleases] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (league) loadReleases() }, [league])

  async function loadReleases() {
    const { data } = await supabase.from('release_requests')
      .select('*, players(*), profiles(*)')
      .eq('league_id', league.id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
    setReleases(data || [])
    setLoading(false)
  }

  async function approveRelease(r) {
    if (!confirm(`Approve release of ${r.players?.name}?`)) return
    const { data: sq } = await supabase.from('squad').select('bought_price')
      .eq('player_id', r.player_id).eq('league_id', league.id).eq('user_id', r.user_id).single()
    const price = sq?.bought_price || 0
    await supabase.from('squad').delete()
      .eq('player_id', r.player_id).eq('league_id', league.id).eq('user_id', r.user_id)
    const { data: mem } = await supabase.from('league_members').select('purse_remaining')
      .eq('league_id', league.id).eq('user_id', r.user_id).single()
    if (mem) {
      await supabase.from('league_members').update({ purse_remaining: mem.purse_remaining + price })
        .eq('league_id', league.id).eq('user_id', r.user_id)
    }
    await supabase.from('release_requests').update({ status: 'approved', resolved_at: new Date() }).eq('id', r.id)
    showMsg(`✅ ${r.players?.name} released! ₹${price}Cr refunded.`)
    loadReleases()
  }

  async function rejectRelease(r) {
    if (!confirm(`Reject release of ${r.players?.name}?`)) return
    await supabase.from('release_requests').update({ status: 'rejected', resolved_at: new Date() }).eq('id', r.id)
    showMsg('Release rejected.')
    loadReleases()
  }

  if (loading) return <div style={{ padding:20, color:'var(--text3)' }}>Loading...</div>

  return (
    <div>
      <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:16 }}>
        Release Requests <span style={{ color:'var(--text3)', fontWeight:400, fontSize:15 }}>({releases.length})</span>
      </h3>
      {releases.length === 0 ? (
        <div style={{ padding:32, textAlign:'center', color:'var(--text3)', background:'var(--navy3)', borderRadius:12, fontSize:13 }}>
          No pending release requests
        </div>
      ) : releases.map(r => (
        <div key={r.id} style={{ background:'var(--navy3)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:10 }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:14, fontWeight:600 }}>{r.players?.name}</div>
            <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
              {r.players?.team} · {r.players?.role} · Requested by {r.profiles?.name?.split(' ')[0]}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button className="btn btn-teal" style={{ padding:10, borderRadius:10 }} onClick={() => approveRelease(r)}>
              ✓ Approve
            </button>
            <button className="btn btn-danger" style={{ padding:10, borderRadius:10 }} onClick={() => rejectRelease(r)}>
              ✕ Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ==================== TRADES TAB ====================
function AdminTrades({ league, showMsg }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (league) loadTrades() }, [league])

  async function loadTrades() {
    setLoading(true)
    const { data } = await supabase
      .from('trade_requests').select('*')
      .eq('league_id', league.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })

    const enriched = await Promise.all((data || []).map(async t => {
      const [{ data: fp }, { data: tp }, { data: fu }, { data: tu }] = await Promise.all([
        t.from_player_id ? supabase.from('players').select('*').eq('id', t.from_player_id).single() : { data: null },
        t.to_player_id ? supabase.from('players').select('*').eq('id', t.to_player_id).single() : { data: null },
        supabase.from('profiles').select('*').eq('id', t.from_user_id).single(),
        supabase.from('profiles').select('*').eq('id', t.to_user_id).single(),
      ])
      return { ...t, from_player: fp, to_player: tp, from_user: fu, to_user: tu }
    }))
    setTrades(enriched)
    setLoading(false)
  }

  async function approveTrade(trade) {
    if (!confirm('Approve this trade? Players and cash will be swapped immediately.')) return
    try {
      if (trade.from_player_id) {
        await supabase.from('squad')
          .update({ user_id: trade.to_user_id, is_traded: true, traded_from: trade.from_user?.name })
          .eq('player_id', trade.from_player_id).eq('league_id', league.id)
      }
      if (trade.to_player_id) {
        await supabase.from('squad')
          .update({ user_id: trade.from_user_id, is_traded: true, traded_from: trade.to_user?.name })
          .eq('player_id', trade.to_player_id).eq('league_id', league.id)
      }
      if (trade.cash_from > 0) {
        const { data: fm } = await supabase.from('league_members').select('purse_remaining')
          .eq('user_id', trade.from_user_id).eq('league_id', league.id).single()
        const { data: tm } = await supabase.from('league_members').select('purse_remaining')
          .eq('user_id', trade.to_user_id).eq('league_id', league.id).single()
        await supabase.from('league_members').update({ purse_remaining: fm.purse_remaining - trade.cash_from })
          .eq('user_id', trade.from_user_id).eq('league_id', league.id)
        await supabase.from('league_members').update({ purse_remaining: tm.purse_remaining + trade.cash_from })
          .eq('user_id', trade.to_user_id).eq('league_id', league.id)
      }
      if (trade.cash_to > 0) {
        const { data: fm } = await supabase.from('league_members').select('purse_remaining')
          .eq('user_id', trade.from_user_id).eq('league_id', league.id).single()
        const { data: tm } = await supabase.from('league_members').select('purse_remaining')
          .eq('user_id', trade.to_user_id).eq('league_id', league.id).single()
        await supabase.from('league_members').update({ purse_remaining: tm.purse_remaining - trade.cash_to })
          .eq('user_id', trade.to_user_id).eq('league_id', league.id)
        await supabase.from('league_members').update({ purse_remaining: fm.purse_remaining + trade.cash_to })
          .eq('user_id', trade.from_user_id).eq('league_id', league.id)
      }
      await supabase.from('trade_requests').update({
        status: 'admin_approved', resolved_at: new Date()
      }).eq('id', trade.id)
      showMsg('✅ Trade approved! Players and cash swapped.')
      loadTrades()
    } catch (e) {
      showMsg('Error: ' + e.message, 'error')
    }
  }

  async function rejectTrade(trade) {
    if (!confirm('Reject this trade?')) return
    await supabase.from('trade_requests').update({
      status: 'admin_rejected', resolved_at: new Date()
    }).eq('id', trade.id)
    showMsg('Trade rejected.')
    loadTrades()
  }

  if (loading) return <div style={{ padding:20, color:'var(--text3)' }}>Loading...</div>

  return (
    <div>
      <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:16 }}>
        Trades Awaiting Approval
        <span style={{ color:'var(--text3)', fontWeight:400, fontSize:15, marginLeft:8 }}>({trades.length})</span>
      </h3>
      {trades.length === 0 ? (
        <div style={{ padding:32, textAlign:'center', color:'var(--text3)', background:'var(--navy3)', borderRadius:12, fontSize:13 }}>
          No trades awaiting approval
        </div>
      ) : trades.map(t => (
        <div key={t.id} style={{ background:'var(--navy3)', border:'1px solid var(--border2)', borderRadius:14, padding:18, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700 }}>
              <span style={{ color:'var(--gold)' }}>{t.from_user?.name?.split(' ')[0]}</span>
              <span style={{ color:'var(--text3)', margin:'0 8px' }}>⇄</span>
              <span style={{ color:'var(--teal)' }}>{t.to_user?.name?.split(' ')[0]}</span>
            </div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>
              {new Date(t.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center', marginBottom:14 }}>
            <div style={{ background:'var(--navy2)', borderRadius:10, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:6 }}>{t.from_user?.name?.split(' ')[0]} gives</div>
              {t.from_player && <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>🏏 {t.from_player.name} <span style={{ fontSize:10, color:'var(--text3)' }}>({t.from_player.team})</span></div>}
              {t.cash_from > 0 && <div style={{ fontSize:14, fontWeight:700, color:'var(--gold)', fontFamily:'Rajdhani' }}>+ ₹{t.cash_from}Cr</div>}
              {!t.from_player && t.cash_from === 0 && <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>Nothing</div>}
            </div>
            <div style={{ fontSize:20, color:'var(--text3)' }}>⇄</div>
            <div style={{ background:'var(--navy2)', borderRadius:10, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', marginBottom:6 }}>{t.to_user?.name?.split(' ')[0]} gives</div>
              {t.to_player && <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>🏏 {t.to_player.name} <span style={{ fontSize:10, color:'var(--text3)' }}>({t.to_player.team})</span></div>}
              {t.cash_to > 0 && <div style={{ fontSize:14, fontWeight:700, color:'var(--teal)', fontFamily:'Rajdhani' }}>+ ₹{t.cash_to}Cr</div>}
              {!t.to_player && t.cash_to === 0 && <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>Nothing</div>}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            <button className="btn btn-teal" style={{ padding:12, borderRadius:10, fontWeight:600 }} onClick={() => approveTrade(t)}>
              ✓ Approve Trade
            </button>
            <button className="btn btn-danger" style={{ padding:12, borderRadius:10 }} onClick={() => rejectTrade(t)}>
              ✕ Reject Trade
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ==================== UTILITIES TAB ====================
function UtilitiesTab({ league, showMsg }) {
  const [backfilling, setBackfilling] = useState(false)
  const [progress, setProgress] = useState(null)

  async function runBackfill() {
    if (!confirm('Recalculate fantasy points for ALL performances? This may take a moment.')) return
    setBackfilling(true)
    setProgress({ message: 'Starting backfill...' })
    try {
      const result = await backfillFantasyPoints((p) => setProgress(p))
      showMsg(`✅ Backfill complete! Updated ${result.updated} performances, recalculated ${result.matchPointsRecalculated} match point entries.`)
      setProgress(null)
    } catch (e) {
      showMsg('Error: ' + e.message, 'error')
      setProgress(null)
    }
    setBackfilling(false)
  }

  return (
    <div>
      <h2 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, marginBottom:16, color:'var(--gold)' }}>🔧 Utilities</h2>

      {/* Backfill Fantasy Points */}
      <div style={{ background:'var(--navy3)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>🔄 Backfill Fantasy Points</div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.5 }}>
              Recalculate fantasy points for all performances where points are 0 or incorrect.<br />
              Also updates match_points for all users in all leagues.
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={runBackfill}
            disabled={backfilling}
            style={{ padding:'10px 20px', fontSize:13, opacity: backfilling ? 0.6 : 1 }}
          >
            {backfilling ? '⏳ Running...' : '🔄 Backfill Points'}
          </button>
        </div>
        {progress && (
          <div style={{ padding:'8px 12px', background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:8, fontSize:12, color:'var(--gold)' }}>
            {progress.message}
            {progress.total > 0 && (
              <div style={{ marginTop:4, height:4, background:'var(--navy2)', borderRadius:2, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'var(--gold)', borderRadius:2, transition:'width 0.3s', width: `${Math.round((progress.current / progress.total) * 100)}%` }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}