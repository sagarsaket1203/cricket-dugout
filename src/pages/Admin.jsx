import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { IPL_PLAYERS } from '../lib/players'
import { calculateFantasyPoints } from '../lib/fantasyPoints'

export default function Admin() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('league')
  const [league, setLeague] = useState(null)
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [leagueName, setLeagueName] = useState('Cricket Dugout')
  const [auctionDate, setAuctionDate] = useState('')
  const [team1, setTeam1] = useState('')
  const [team2, setTeam2] = useState('')
  const [matchDate, setMatchDate] = useState('')
  const [venue, setVenue] = useState('')
  const [matchNumber, setMatchNumber] = useState('')
  const [matches, setMatches] = useState([])
  const [players, setPlayers] = useState([])
  const [selectedMatch, setSelectedMatch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [releaseRequests, setReleaseRequests] = useState([])
  const [perf, setPerf] = useState({
    runs:0, balls_faced:0, fours:0, sixes:0, wickets:0,
    catches:0, stumpings:0, run_outs:0, maidens:0,
    economy:0, overs:0, is_duck:false, is_lbw:false, is_bowled:false
  })

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    const { data: mem } = await supabase
      .from('league_members').select('*, leagues(*)')
      .eq('user_id', profile.id).single()
    if (mem) { setLeague(mem.leagues); setMember(mem) }

    const { data: ms } = await supabase
      .from('matches').select('*')
      .order('match_date', { ascending: false })
    setMatches(ms || [])

    const { data: ps } = await supabase
      .from('players').select('id, name, team, role')
      .order('name')
    setPlayers(ps || [])

    const { data: releases } = await supabase
      .from('release_requests')
      .select('*, players(name, team, base_price), profiles(name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
    setReleaseRequests(releases || [])

    setLoading(false)
  }

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 5000) }

  async function createLeague() {
    const { data, error } = await supabase.from('leagues').insert({
      name: leagueName, created_by: profile.id,
      purse_limit: 120, auction_date: auctionDate || null
    }).select().single()
    if (error) { flash('Error: ' + error.message); return }
    await supabase.from('league_members').insert({
      league_id: data.id, user_id: profile.id,
      purse_remaining: 120, is_admin: true
    })
    flash('League created! Code: ' + data.invite_code)
    load()
  }

  async function updateAuctionDate() {
    await supabase.from('leagues')
      .update({ auction_date: auctionDate })
      .eq('id', league.id)
    flash('Auction date updated!')
    load()
  }

  async function seedPlayers() {
    const { error } = await supabase.from('players').insert(IPL_PLAYERS)
    if (error) flash('Error: ' + error.message)
    else { flash(`Seeded ${IPL_PLAYERS.length} IPL players!`); load() }
  }

  async function addMatch() {
    if (!team1 || !team2) { flash('Enter both teams!'); return }
    await supabase.from('matches').insert({
      team1, team2, match_date: matchDate || null,
      venue, match_number: matchNumber || null, status: 'upcoming'
    })
    flash('Match added!')
    setTeam1(''); setTeam2(''); setMatchDate(''); setVenue(''); setMatchNumber('')
    load()
  }

  async function updateMatchStatus(id, status) {
    await supabase.from('matches').update({ status }).eq('id', id)
    flash('Match status updated!')
    load()
  }

  async function submitPerformance() {
    if (!selectedMatch || !selectedPlayer) { flash('Select match and player!'); return }
    const { points, breakdown } = calculateFantasyPoints({ ...perf })
    const { error } = await supabase.from('performances').upsert({
      match_id: selectedMatch, player_id: selectedPlayer,
      ...perf, fantasy_points: points
    }, { onConflict: 'match_id,player_id' })
    if (error) { flash('Error: ' + error.message); return }
    if (league) {
      const { data: sq } = await supabase.from('squad').select('user_id')
        .eq('player_id', selectedPlayer).eq('league_id', league.id).maybeSingle()
      if (sq) {
        const { data: ex } = await supabase.from('match_points').select('*')
          .eq('match_id', selectedMatch).eq('user_id', sq.user_id)
          .eq('league_id', league.id).maybeSingle()
        if (ex) await supabase.from('match_points')
          .update({ total_points: ex.total_points + points }).eq('id', ex.id)
        else await supabase.from('match_points').insert({
          match_id: selectedMatch, user_id: sq.user_id,
          league_id: league.id, total_points: points
        })
      }
    }
    flash(`Saved! ${points} pts — ${breakdown.map(b => `${b.label}: ${b.pts > 0 ? '+' : ''}${b.pts}`).join(', ')}`)
    setPerf({ runs:0, balls_faced:0, fours:0, sixes:0, wickets:0, catches:0, stumpings:0, run_outs:0, maidens:0, economy:0, overs:0, is_duck:false, is_lbw:false, is_bowled:false })
  }

  async function handleRelease(request, decision) {
    if (decision === 'approved') {
      // Step 1: Get bought price
      const { data: squadEntry } = await supabase
        .from('squad').select('bought_price')
        .eq('player_id', request.player_id)
        .eq('league_id', request.league_id)
        .single()

      if (!squadEntry) { flash('Error: Squad entry not found!'); return }

      // Step 2: Delete player from squad
      const { error: deleteError } = await supabase
        .from('squad').delete()
        .eq('player_id', request.player_id)
        .eq('league_id', request.league_id)
        .eq('user_id', request.user_id)

      if (deleteError) { flash('Delete failed: ' + deleteError.message); return }

      // Step 3: Get current purse
      const { data: memData } = await supabase
        .from('league_members').select('purse_remaining')
        .eq('league_id', request.league_id)
        .eq('user_id', request.user_id)
        .single()

      if (memData) {
        // Step 4: Refund — never exceed 120
        const newPurse = Math.min(120, memData.purse_remaining + squadEntry.bought_price)
        const { error: purseError } = await supabase
          .from('league_members')
          .update({ purse_remaining: newPurse })
          .eq('league_id', request.league_id)
          .eq('user_id', request.user_id)
        if (purseError) { flash('Purse update failed: ' + purseError.message); return }
      }

      flash(`✅ ${request.players?.name} released! ₹${squadEntry.bought_price} Cr refunded to ${request.profiles?.name}.`)
    } else {
      flash(`❌ Rejected — ${request.players?.name} stays in squad.`)
    }

    // Step 5: Mark request resolved
    await supabase.from('release_requests')
      .update({ status: decision, resolved_at: new Date().toISOString() })
      .eq('id', request.id)

    load()
  }

  const TABS = ['league', 'players', 'matches', 'performances', 'releases']

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300 }}>
      <div style={{ fontFamily:'Rajdhani',fontSize:20,color:'var(--gold)' }}>Loading...</div>
    </div>
  )

  return (
    <div>
      <div className="fade-in" style={{ marginBottom:24 }}>
        <h1 style={{ fontFamily:'Rajdhani',fontSize:32,fontWeight:700 }}>Admin Panel</h1>
        <div style={{ color:'var(--muted)',fontSize:14,marginTop:2 }}>Manage league, players, matches, performances and releases</div>
      </div>

      {msg && (
        <div className="fade-in" style={{ padding:'12px 16px',marginBottom:16,borderRadius:10,fontWeight:500,
          background:msg.startsWith('Error')||msg.startsWith('Delete')||msg.startsWith('Purse')?'rgba(232,69,69,0.1)':'rgba(0,201,167,0.1)',
          border:`1px solid ${msg.startsWith('Error')||msg.startsWith('Delete')||msg.startsWith('Purse')?'rgba(232,69,69,0.3)':'rgba(0,201,167,0.3)'}`,
          color:msg.startsWith('Error')||msg.startsWith('Delete')||msg.startsWith('Purse')?'var(--red)':'var(--teal)' }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex',gap:4,background:'var(--navy2)',borderRadius:12,padding:4,marginBottom:24,width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'8px 18px',borderRadius:9,fontSize:13,fontWeight:500,
            border:'none',cursor:'pointer',transition:'all 0.15s',
            textTransform:'capitalize',position:'relative',
            background:tab===t?'var(--gold)':'transparent',
            color:tab===t?'var(--navy)':'var(--text2)'
          }}>
            {t}
            {t==='releases' && releaseRequests.length > 0 && (
              <span style={{ position:'absolute',top:-4,right:-4,background:'var(--red)',color:'#fff',fontSize:10,fontWeight:700,width:16,height:16,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center' }}>
                {releaseRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* LEAGUE TAB */}
      {tab === 'league' && (
        <div className="fade-in" style={{ maxWidth:520 }}>
          {!league ? (
            <div className="card" style={{ padding:24 }}>
              <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:16 }}>Create Your League</div>
              <input className="input" placeholder="League name" value={leagueName} onChange={e => setLeagueName(e.target.value)} style={{ marginBottom:10 }} />
              <input className="input" type="datetime-local" value={auctionDate} onChange={e => setAuctionDate(e.target.value)} style={{ marginBottom:16 }} />
              <button className="btn btn-primary" style={{ width:'100%' }} onClick={createLeague}>Create League</button>
            </div>
          ) : (
            <div>
              <div className="card" style={{ padding:24,marginBottom:16 }}>
                <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:16 }}>League Settings</div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>League Name</div>
                  <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:700,color:'var(--gold)' }}>{league.name}</div>
                </div>
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>Invite Code (share with friends)</div>
                  <div style={{ fontFamily:'Rajdhani',fontSize:26,fontWeight:700,letterSpacing:2,color:'var(--text)' }}>{league.invite_code?.toUpperCase()}</div>
                </div>
                <div>
                  <div style={{ fontSize:12,color:'var(--muted)',marginBottom:6 }}>Auction Date & Time</div>
                  <div style={{ display:'flex',gap:10 }}>
                    <input className="input" type="datetime-local" value={auctionDate} onChange={e => setAuctionDate(e.target.value)} />
                    <button className="btn btn-primary" onClick={updateAuctionDate}>Save</button>
                  </div>
                </div>
              </div>
              <div className="card" style={{ padding:24 }}>
                <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:600,marginBottom:4 }}>Purse Per Friend</div>
                <div style={{ fontFamily:'Rajdhani',fontSize:32,fontWeight:700,color:'var(--gold)' }}>₹120 Crore</div>
                <div style={{ fontSize:12,color:'var(--muted)',marginTop:4 }}>Same as IPL 2025 official auction limit</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PLAYERS TAB */}
      {tab === 'players' && (
        <div className="fade-in" style={{ maxWidth:520 }}>
          <div className="card" style={{ padding:24 }}>
            <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:8 }}>Seed IPL Players</div>
            <div style={{ fontSize:14,color:'var(--text2)',marginBottom:16 }}>
              Load all {IPL_PLAYERS.length} IPL players into the database. Only needed once!
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={seedPlayers}>
              🏏 Load All IPL Players ({IPL_PLAYERS.length})
            </button>
            <div style={{ marginTop:12,fontSize:12,color:'var(--muted)' }}>
              Includes: MI, CSK, RCB, KKR, RR, DC, PBKS, SRH, GT, LSG
            </div>
          </div>
        </div>
      )}

      {/* MATCHES TAB */}
      {tab === 'matches' && (
        <div className="fade-in">
          <div className="card" style={{ padding:24,maxWidth:520,marginBottom:20 }}>
            <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:16 }}>Add New Match</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
              <input className="input" placeholder="Team 1 (e.g. MI)" value={team1} onChange={e => setTeam1(e.target.value.toUpperCase())} />
              <input className="input" placeholder="Team 2 (e.g. CSK)" value={team2} onChange={e => setTeam2(e.target.value.toUpperCase())} />
            </div>
            <input className="input" type="datetime-local" value={matchDate} onChange={e => setMatchDate(e.target.value)} style={{ marginBottom:10 }} />
            <input className="input" placeholder="Venue (optional)" value={venue} onChange={e => setVenue(e.target.value)} style={{ marginBottom:10 }} />
            <input className="input" placeholder="Match number (optional)" type="number" value={matchNumber} onChange={e => setMatchNumber(e.target.value)} style={{ marginBottom:16 }} />
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={addMatch}>Add Match</button>
          </div>

          <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:600,marginBottom:12 }}>All Matches ({matches.length})</div>
          <div style={{ display:'flex',flexDirection:'column',gap:8,maxWidth:600 }}>
            {matches.map(m => (
              <div key={m.id} className="card" style={{ padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:700 }}>{m.team1} vs {m.team2}</div>
                  <div style={{ fontSize:12,color:'var(--muted)' }}>
                    {m.match_date ? new Date(m.match_date).toLocaleString('en-IN') : 'Date TBD'}
                  </div>
                </div>
                <div style={{ display:'flex',gap:6 }}>
                  {['upcoming','live','completed'].map(s => (
                    <button key={s} onClick={() => updateMatchStatus(m.id, s)} style={{
                      padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,
                      border:'none',cursor:'pointer',
                      background:m.status===s?(s==='live'?'var(--red)':s==='completed'?'var(--teal)':'var(--navy4)'):'var(--navy3)',
                      color:m.status===s?(s==='live'?'#fff':s==='completed'?'var(--navy)':'var(--text)'):'var(--muted)'
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            ))}
            {matches.length === 0 && <div style={{ color:'var(--muted)',fontSize:14 }}>No matches yet.</div>}
          </div>
        </div>
      )}

      {/* PERFORMANCES TAB */}
      {tab === 'performances' && (
        <div className="fade-in" style={{ maxWidth:600 }}>
          <div className="card" style={{ padding:24 }}>
            <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:16 }}>Enter Player Performance</div>
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14 }}>
              <div>
                <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>Match</div>
                <select className="input" value={selectedMatch} onChange={e => setSelectedMatch(e.target.value)}>
                  <option value="">Select match...</option>
                  {matches.map(m => (
                    <option key={m.id} value={m.id}>{m.team1} vs {m.team2} · {m.match_date ? new Date(m.match_date).toLocaleDateString() : 'TBD'}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>Player</div>
                <select className="input" value={selectedPlayer} onChange={e => setSelectedPlayer(e.target.value)}>
                  <option value="">Select player...</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.team})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:600,color:'var(--gold)',marginBottom:10 }}>Batting</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10 }}>
              {[['runs','Runs'],['balls_faced','Balls'],['fours','4s'],['sixes','6s']].map(([k,l]) => (
                <div key={k}>
                  <div style={{ fontSize:11,color:'var(--muted)',marginBottom:3 }}>{l}</div>
                  <input className="input" type="number" min="0" value={perf[k]} onChange={e => setPerf(p => ({ ...p,[k]:+e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex',gap:16,marginBottom:14 }}>
              <label style={{ display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer' }}>
                <input type="checkbox" checked={perf.is_duck} onChange={e => setPerf(p => ({ ...p,is_duck:e.target.checked }))} />
                <span style={{ color:'var(--text2)' }}>Duck (out for 0)</span>
              </label>
            </div>

            <div style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:600,color:'var(--teal)',marginBottom:10 }}>Bowling</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10 }}>
              {[['wickets','Wickets'],['overs','Overs'],['maidens','Maidens'],['economy','Economy']].map(([k,l]) => (
                <div key={k}>
                  <div style={{ fontSize:11,color:'var(--muted)',marginBottom:3 }}>{l}</div>
                  <input className="input" type="number" step="0.1" min="0" value={perf[k]} onChange={e => setPerf(p => ({ ...p,[k]:+e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex',gap:16,marginBottom:14 }}>
              {[['is_lbw','LBW'],['is_bowled','Bowled']].map(([k,l]) => (
                <label key={k} style={{ display:'flex',alignItems:'center',gap:6,fontSize:13,cursor:'pointer' }}>
                  <input type="checkbox" checked={perf[k]} onChange={e => setPerf(p => ({ ...p,[k]:e.target.checked }))} />
                  <span style={{ color:'var(--text2)' }}>{l}</span>
                </label>
              ))}
            </div>

            <div style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:600,color:'var(--blue)',marginBottom:10 }}>Fielding</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:20 }}>
              {[['catches','Catches'],['stumpings','Stumpings'],['run_outs','Run Outs']].map(([k,l]) => (
                <div key={k}>
                  <div style={{ fontSize:11,color:'var(--muted)',marginBottom:3 }}>{l}</div>
                  <input className="input" type="number" min="0" value={perf[k]} onChange={e => setPerf(p => ({ ...p,[k]:+e.target.value }))} />
                </div>
              ))}
            </div>

            <div style={{ padding:'12px 16px',background:'rgba(245,166,35,0.08)',border:'1px solid rgba(245,166,35,0.2)',borderRadius:10,marginBottom:16 }}>
              <div style={{ fontSize:12,color:'var(--muted)',marginBottom:4 }}>Fantasy Points Preview</div>
              <div style={{ fontFamily:'Rajdhani',fontSize:28,fontWeight:700,color:'var(--gold)' }}>
                {calculateFantasyPoints(perf).points} pts
              </div>
              <div style={{ fontSize:11,color:'var(--text2)',marginTop:4 }}>
                {calculateFantasyPoints(perf).breakdown.map(b => `${b.label}: ${b.pts>0?'+':''}${b.pts}`).join(' · ')}
              </div>
            </div>
            <button className="btn btn-primary" style={{ width:'100%',padding:14 }} onClick={submitPerformance}>
              Save Performance & Calculate Points
            </button>
          </div>
        </div>
      )}

      {/* RELEASES TAB */}
      {tab === 'releases' && (
        <div className="fade-in" style={{ maxWidth:600 }}>
          <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,marginBottom:16,display:'flex',alignItems:'center',gap:10 }}>
            Pending Release Requests
            {releaseRequests.length > 0 && (
              <span style={{ background:'var(--red)',color:'#fff',fontSize:12,padding:'2px 10px',borderRadius:20,fontWeight:700 }}>
                {releaseRequests.length}
              </span>
            )}
          </div>

          {releaseRequests.length === 0 ? (
            <div style={{ padding:40,textAlign:'center',background:'var(--navy2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',color:'var(--muted)' }}>
              <div style={{ fontSize:36,marginBottom:12 }}>✅</div>
              <div>No pending release requests</div>
            </div>
          ) : (
            <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
              {releaseRequests.map(r => (
                <div key={r.id} className="card" style={{ padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:700 }}>{r.players?.name}</div>
                    <div style={{ fontSize:12,color:'var(--muted)',marginTop:2 }}>
                      {r.players?.team} · Requested by <span style={{ color:'var(--text2)',fontWeight:500 }}>{r.profiles?.name}</span>
                    </div>
                    <div style={{ fontSize:11,color:'var(--muted)',marginTop:2 }}>
                      {new Date(r.requested_at).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{ display:'flex',gap:8,flexShrink:0,marginLeft:12 }}>
                    <button className="btn btn-teal" style={{ fontSize:12,padding:'8px 16px' }}
                      onClick={() => handleRelease(r, 'approved')}>
                      ✓ Approve
                    </button>
                    <button className="btn btn-danger" style={{ fontSize:12,padding:'8px 16px' }}
                      onClick={() => handleRelease(r, 'rejected')}>
                      ✗ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}