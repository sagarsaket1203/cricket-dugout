import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLE_COLOR = { 'Batsman':'bat', 'Bowler':'bowl', 'All-Rounder':'ar', 'WK-Batsman':'wk' }

export default function Auction() {
  const { profile } = useAuth()
  const [league, setLeague] = useState(null)
  const [member, setMember] = useState(null)
  const [players, setPlayers] = useState([])
  const [unsoldPlayers, setUnsoldPlayers] = useState([])
  const [currentPlayer, setCurrentPlayer] = useState(null)
  const [currentBid, setCurrentBid] = useState(0)
  const [currentBidder, setCurrentBidder] = useState(null)
  const [bidHistory, setBidHistory] = useState([])
  const [members, setMembers] = useState([])
  const [timer, setTimer] = useState(30)
  const [loading, setLoading] = useState(true)
  const [bidding, setBidding] = useState(false)
  const [soldMsg, setSoldMsg] = useState('')
  const [showUnsold, setShowUnsold] = useState(false)
  const timerRef = useRef(null)
  const channelRef = useRef(null)

  useEffect(() => {
    if (profile) init()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [profile])

  async function init() {
    setLoading(true)
    const { data: mem } = await supabase
      .from('league_members').select('*, leagues(*)')
      .eq('user_id', profile.id).single()
    if (!mem) { setLoading(false); return }
    setLeague(mem.leagues)
    setMember(mem)
    await refreshData(mem)

    const channel = supabase.channel(`auction-${mem.league_id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'auction_bids',
        filter: `league_id=eq.${mem.league_id}`
      }, async (payload) => {
        const bid = payload.new
        const { data: bidderProfile } = await supabase.from('profiles').select('*').eq('id', bid.bidder_id).single()
        const { data: playerData } = await supabase.from('players').select('*').eq('id', bid.player_id).single()
        setCurrentBid(bid.amount)
        setCurrentBidder(bidderProfile)
        setCurrentPlayer(playerData)
        setBidHistory(prev => [{ ...bid, profiles: bidderProfile, players: playerData }, ...prev.slice(0, 7)])
        setTimer(30)
        const { data: updatedMem } = await supabase.from('league_members').select('*, profiles(*)').eq('league_id', mem.league_id)
        setMembers(updatedMem || [])
        const myMem = updatedMem?.find(m => m.user_id === profile.id)
        if (myMem) setMember(myMem)
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'squad',
        filter: `league_id=eq.${mem.league_id}`
      }, async () => { await refreshData(mem) })
      .subscribe()

    channelRef.current = channel
    setLoading(false)
  }

  async function refreshData(mem) {
    const { data: allMem } = await supabase
      .from('league_members').select('*, profiles(*)')
      .eq('league_id', mem.league_id)
    setMembers(allMem || [])
    const myMem = allMem?.find(m => m.user_id === profile.id)
    if (myMem) setMember(myMem)

    const { data: allPlayers } = await supabase
      .from('players').select('*').order('name')
    const { data: squadData } = await supabase
      .from('squad').select('player_id').eq('league_id', mem.league_id)

    const soldIds = new Set(squadData?.map(s => s.player_id) || [])

    // Available = not sold and not unsold
    const available = (allPlayers || []).filter(p => !soldIds.has(p.id) && !p.is_unsold)
    // Unsold = marked as unsold
    const unsold = (allPlayers || []).filter(p => p.is_unsold)

    setPlayers(available)
    setUnsoldPlayers(unsold)

    // Restore current bid state
    const { data: latestBids } = await supabase
      .from('auction_bids').select('*, players(*), profiles(*)')
      .eq('league_id', mem.league_id)
      .order('created_at', { ascending: false }).limit(20)

    if (latestBids?.length > 0) {
      const latest = latestBids[0]
      if (!soldIds.has(latest.player_id) && !latest.players?.is_unsold) {
        setCurrentPlayer(latest.players)
        setCurrentBid(latest.amount)
        setCurrentBidder(latest.profiles)
        setBidHistory(latestBids.slice(0, 8))
        startTimer()
      }
    }
  }

  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimer(30)
    timerRef.current = setInterval(() => {
      setTimer(t => { if (t <= 1) { clearInterval(timerRef.current); return 0 } return t - 1 })
    }, 1000)
  }

  async function placeBid(amount) {
    if (!currentPlayer || !member || bidding) return
    if (member.purse_remaining < amount) { alert(`Not enough purse! You have ₹${member.purse_remaining} Cr left.`); return }
    if (amount <= currentBid) { alert(`Bid must be more than ₹${currentBid} Cr`); return }
    const { data: alreadySold } = await supabase.from('squad').select('id').eq('player_id', currentPlayer.id).eq('league_id', league.id).maybeSingle()
    if (alreadySold) { alert('This player was already sold!'); await refreshData(member); return }
    setBidding(true)
    await supabase.from('auction_bids').insert({
      league_id: league.id, player_id: currentPlayer.id,
      bidder_id: profile.id, amount
    })
    setBidding(false)
    startTimer()
  }

  async function sellPlayer() {
    if (!currentPlayer || !currentBidder || !member?.is_admin) return
    const { data: alreadySold } = await supabase.from('squad').select('id').eq('player_id', currentPlayer.id).eq('league_id', league.id).maybeSingle()
    if (alreadySold) {
      setSoldMsg('Player already sold!')
      setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); setBidHistory([])
      return
    }
    const { error } = await supabase.from('squad').insert({
      league_id: league.id, user_id: currentBidder.id,
      player_id: currentPlayer.id, bought_price: currentBid
    })
    if (error) { setSoldMsg('Error: ' + error.message); return }

    // Deduct purse from winner
    const { data: winnerMem } = await supabase.from('league_members').select('purse_remaining')
      .eq('league_id', league.id).eq('user_id', currentBidder.id).single()
    if (winnerMem) {
      await supabase.from('league_members').update({
        purse_remaining: winnerMem.purse_remaining - currentBid
      }).eq('league_id', league.id).eq('user_id', currentBidder.id)
    }

    setSoldMsg(`🔨 ${currentPlayer.name} SOLD to ${currentBidder.name} for ₹${currentBid} Cr!`)
    setTimeout(() => setSoldMsg(''), 4000)
    setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); setBidHistory([])
    if (timerRef.current) clearInterval(timerRef.current)
    await refreshData(member)
  }

  async function markUnsold() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Mark ${currentPlayer.name} as UNSOLD? They go back to the unsold pool and can be re-auctioned later.`)) return
    await supabase.from('players').update({ is_unsold: true }).eq('id', currentPlayer.id)
    setSoldMsg(`${currentPlayer.name} marked as unsold.`)
    setTimeout(() => setSoldMsg(''), 3000)
    setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); setBidHistory([])
    if (timerRef.current) clearInterval(timerRef.current)
    await refreshData(member)
  }

  async function removeFromAuction() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Remove ${currentPlayer.name} from auction? No bids placed — player goes back to available list.`)) return
    setSoldMsg(`${currentPlayer.name} removed from auction.`)
    setTimeout(() => setSoldMsg(''), 3000)
    setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); setBidHistory([])
    if (timerRef.current) clearInterval(timerRef.current)
  }

  async function reAuctionPlayer(player) {
    if (!member?.is_admin) return
    // Remove unsold mark
    await supabase.from('players').update({ is_unsold: false }).eq('id', player.id)
    setSoldMsg(`${player.name} moved back to available players!`)
    setTimeout(() => setSoldMsg(''), 3000)
    await refreshData(member)
  }

  async function startBiddingOnPlayer(player) {
    if (!member?.is_admin) return
    const { data: alreadySold } = await supabase.from('squad').select('id').eq('player_id', player.id).eq('league_id', league.id).maybeSingle()
    if (alreadySold) { alert('This player is already sold!'); return }
    setCurrentPlayer(player)
    setCurrentBid(player.base_price)
    setCurrentBidder(null)
    setBidHistory([])
    await supabase.from('auction_bids').insert({
      league_id: league.id, player_id: player.id,
      bidder_id: profile.id, amount: player.base_price
    })
    startTimer()
  }

  const timerPct = (timer / 30) * 100
  const timerColor = timer < 8 ? 'var(--red)' : timer < 15 ? 'var(--gold)' : 'var(--teal)'

  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:300 }}>
      <div style={{ fontFamily:'Rajdhani',fontSize:20,color:'var(--gold)' }}>Loading auction...</div>
    </div>
  )
  if (!league) return (
    <div style={{ padding:40,textAlign:'center',color:'var(--muted)' }}>Join a league first from the Dashboard.</div>
  )

  return (
    <div>
      <div className="fade-in" style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24 }}>
        <div>
          <h1 style={{ fontFamily:'Rajdhani',fontSize:32,fontWeight:700 }}>Live Auction Room</h1>
          <div style={{ color:'var(--muted)',fontSize:14,marginTop:2 }}>
            {players.length} available · {unsoldPlayers.length} unsold · ₹120 Cr purse each
          </div>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:8 }}>
          <div style={{ display:'flex',alignItems:'center',gap:6,background:'rgba(232,69,69,0.1)',border:'1px solid rgba(232,69,69,0.25)',borderRadius:20,padding:'6px 14px' }}>
            <div className="live-dot" />
            <span style={{ fontSize:12,fontWeight:700,color:'var(--red)',letterSpacing:0.5 }}>LIVE</span>
          </div>
          <div style={{ padding:'6px 16px',background:'rgba(245,166,35,0.1)',border:'1px solid rgba(245,166,35,0.25)',borderRadius:20,fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--gold)' }}>
            ₹{member?.purse_remaining} Cr left
          </div>
        </div>
      </div>

      {/* Sold / action message */}
      {soldMsg && (
        <div className="fade-in" style={{ padding:'14px 20px',background:'rgba(0,201,167,0.1)',border:'1px solid rgba(0,201,167,0.3)',borderRadius:12,marginBottom:16,color:'var(--teal)',fontFamily:'Rajdhani',fontSize:18,fontWeight:600 }}>
          {soldMsg}
        </div>
      )}

      <div style={{ display:'grid',gridTemplateColumns:'1fr 300px',gap:16 }}>
        {/* Main */}
        <div>
          {/* Current player card */}
          {currentPlayer ? (
            <div className="fade-in" style={{ background:'linear-gradient(135deg,#0D1A2E,#152035)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:24,marginBottom:14 }}>
              <div style={{ display:'flex',gap:20,alignItems:'center' }}>
                <div style={{ width:80,height:80,borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Rajdhani',fontSize:26,fontWeight:700,flexShrink:0,
                  background:ROLE_COLOR[currentPlayer.role]==='bat'?'rgba(245,166,35,0.2)':ROLE_COLOR[currentPlayer.role]==='bowl'?'rgba(0,201,167,0.2)':ROLE_COLOR[currentPlayer.role]==='ar'?'rgba(232,69,69,0.2)':'rgba(59,130,246,0.2)',
                  color:ROLE_COLOR[currentPlayer.role]==='bat'?'var(--gold)':ROLE_COLOR[currentPlayer.role]==='bowl'?'var(--teal)':ROLE_COLOR[currentPlayer.role]==='ar'?'var(--red)':'var(--blue)' }}>
                  {currentPlayer.image_initials || currentPlayer.name.slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Rajdhani',fontSize:28,fontWeight:700,color:'#fff' }}>{currentPlayer.name}</div>
                  <div style={{ display:'flex',alignItems:'center',gap:8,marginTop:4 }}>
                    <span className={`badge badge-${ROLE_COLOR[currentPlayer.role]}`}>{currentPlayer.role}</span>
                    <span style={{ fontSize:13,color:'var(--text2)' }}>{currentPlayer.team}</span>
                    <span style={{ fontSize:12,color:'var(--muted)' }}>Base: ₹{currentPlayer.base_price} Cr</span>
                  </div>
                  <div style={{ display:'flex',gap:20,marginTop:12 }}>
                    {currentPlayer.runs > 0 && <div><div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:700,color:'#fff' }}>{currentPlayer.runs}</div><div style={{ fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase' }}>Runs</div></div>}
                    {currentPlayer.wickets > 0 && <div><div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:700,color:'#fff' }}>{currentPlayer.wickets}</div><div style={{ fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase' }}>Wickets</div></div>}
                    {currentPlayer.strike_rate && <div><div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:700,color:'#fff' }}>{currentPlayer.strike_rate}</div><div style={{ fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase' }}>SR</div></div>}
                    {currentPlayer.economy && <div><div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:700,color:'#fff' }}>{currentPlayer.economy}</div><div style={{ fontSize:10,color:'rgba(255,255,255,0.4)',textTransform:'uppercase' }}>Econ</div></div>}
                  </div>
                </div>
                <div style={{ textAlign:'right',flexShrink:0 }}>
                  <div style={{ fontSize:11,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.8px' }}>Current Bid</div>
                  <div style={{ fontFamily:'Rajdhani',fontSize:40,fontWeight:700,color:'var(--gold)',lineHeight:1.1 }}>₹{currentBid} Cr</div>
                  <div style={{ fontSize:12,color:'rgba(255,255,255,0.5)',marginTop:2 }}>
                    {currentBidder ? `by ${currentBidder.name?.split(' ')[0]}` : 'Opening bid'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background:'var(--navy2)',border:'2px dashed var(--border)',borderRadius:'var(--radius)',padding:40,textAlign:'center',marginBottom:14 }}>
              <div style={{ fontSize:40,marginBottom:12 }}>🔨</div>
              <div style={{ fontFamily:'Rajdhani',fontSize:20,fontWeight:600,color:'var(--text2)' }}>
                {member?.is_admin ? 'Click a player below to start bidding' : 'Waiting for admin to start the next bid...'}
              </div>
            </div>
          )}

          {/* Timer */}
          {currentPlayer && (
            <div style={{ background:'var(--navy2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'14px 20px',marginBottom:14 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10 }}>
                <span style={{ fontSize:13,color:'var(--muted)' }}>Time to bid</span>
                <span style={{ fontFamily:'Rajdhani',fontSize:24,fontWeight:700,color:timerColor }}>{timer}s</span>
              </div>
              <div style={{ background:'var(--navy4)',borderRadius:20,height:8,overflow:'hidden' }}>
                <div style={{ height:'100%',borderRadius:20,background:timerColor,width:`${timerPct}%`,transition:'width 1s linear,background 0.3s' }} />
              </div>
            </div>
          )}

          {/* Bid buttons */}
          {currentPlayer && (
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10 }}>
              {[currentBid+1, currentBid+2, currentBid+5].map(amt => (
                <button key={amt} className="btn btn-secondary"
                  disabled={bidding || member?.purse_remaining < amt || currentBidder?.id === profile?.id}
                  onClick={() => placeBid(amt)}
                  style={{ padding:'14px 10px',fontSize:13,fontWeight:600,opacity:member?.purse_remaining < amt ? 0.4 : 1 }}>
                  +₹{amt - currentBid} Cr → ₹{amt} Cr
                </button>
              ))}
            </div>
          )}

          {/* SOLD button - when timer hits 0 */}
          {currentPlayer && member?.is_admin && currentBidder && timer === 0 && (
            <button className="btn btn-primary" style={{ width:'100%',marginBottom:10,padding:16,fontSize:16,fontFamily:'Rajdhani',fontWeight:700 }} onClick={sellPlayer}>
              🔨 SOLD! {currentPlayer.name} → {currentBidder.name?.split(' ')[0]} for ₹{currentBid} Cr
            </button>
          )}

          {/* Confirm sale anytime */}
          {currentPlayer && member?.is_admin && currentBidder && timer > 0 && (
            <button className="btn btn-teal" style={{ width:'100%',marginBottom:10,padding:12,fontSize:14 }} onClick={sellPlayer}>
              ✓ Confirm Sale — ₹{currentBid} Cr to {currentBidder.name?.split(' ')[0]}
            </button>
          )}

          {/* Admin controls */}
          {currentPlayer && member?.is_admin && (
            <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10 }}>
              <button className="btn btn-danger" onClick={markUnsold}>
                🔴 Mark as Unsold
              </button>
              <button className="btn" style={{ background:'var(--navy3)',color:'var(--muted)',border:'1px solid var(--border)' }}
                onClick={removeFromAuction}>
                ✕ Remove from Auction
              </button>
            </div>
          )}

          {/* Skip for non-admin */}
          {currentPlayer && !member?.is_admin && (
            <button className="btn" style={{ width:'100%',background:'var(--navy3)',color:'var(--muted)',border:'1px solid var(--border)' }}
              onClick={() => { setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); if(timerRef.current) clearInterval(timerRef.current) }}>
              ⏭ Skip
            </button>
          )}

          {/* Available players list - admin only */}
          {member?.is_admin && (
            <div style={{ marginTop:20 }}>
              <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:600,marginBottom:12,color:'var(--text2)' }}>
                Available Players ({players.length})
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,maxHeight:380,overflowY:'auto' }}>
                {players.map(p => (
                  <div key={p.id} onClick={() => startBiddingOnPlayer(p)}
                    style={{ background:'var(--navy2)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:10 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor='rgba(245,166,35,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor='var(--border)'}>
                    <div style={{ width:36,height:36,borderRadius:8,background:'var(--navy3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'var(--text2)',flexShrink:0 }}>
                      {p.image_initials || p.name.slice(0,2)}
                    </div>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize:11,color:'var(--muted)' }}>{p.team} · Base ₹{p.base_price}Cr</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Unsold players section */}
              {unsoldPlayers.length > 0 && (
                <div style={{ marginTop:20 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
                    <div style={{ fontFamily:'Rajdhani',fontSize:18,fontWeight:600,color:'var(--red)',display:'flex',alignItems:'center',gap:8 }}>
                      🔴 Unsold Players ({unsoldPlayers.length})
                    </div>
                    <button className="btn btn-secondary" style={{ fontSize:12,padding:'4px 12px' }}
                      onClick={() => setShowUnsold(!showUnsold)}>
                      {showUnsold ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showUnsold && (
                    <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                      {unsoldPlayers.map(p => (
                        <div key={p.id} style={{ background:'rgba(232,69,69,0.05)',border:'1px solid rgba(232,69,69,0.2)',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8 }}>
                          <div style={{ display:'flex',alignItems:'center',gap:10,minWidth:0 }}>
                            <div style={{ width:36,height:36,borderRadius:8,background:'rgba(232,69,69,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'var(--red)',flexShrink:0 }}>
                              {p.image_initials || p.name.slice(0,2)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>{p.name}</div>
                              <div style={{ fontSize:11,color:'var(--muted)' }}>{p.team}</div>
                            </div>
                          </div>
                          <button className="btn btn-teal" style={{ fontSize:11,padding:'4px 10px',flexShrink:0 }}
                            onClick={() => reAuctionPlayer(p)}>
                            Re-auction
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div>
          <div className="card" style={{ padding:16,marginBottom:12 }}>
            <div style={{ fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:14 }}>Friend Purses (₹120 Cr)</div>
            {members.map((m) => {
              const pct = Math.round((m.purse_remaining / 120) * 100)
              const col = m.purse_remaining < 20 ? 'var(--red)' : m.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)'
              const isLeading = currentBidder?.id === m.user_id
              return (
                <div key={m.id} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <div style={{ width:8,height:8,borderRadius:'50%',background:col }} />
                      <span style={{ fontSize:13,fontWeight:500,color:m.user_id===profile?.id?'var(--gold)':'var(--text)' }}>
                        {m.profiles?.name?.split(' ')[0]}
                      </span>
                    </div>
                    <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                      <span style={{ fontSize:12,color:'var(--muted)' }}>₹{m.purse_remaining}Cr</span>
                      {isLeading && <span style={{ fontSize:10,color:'var(--teal)',fontWeight:700 }}>LEADING</span>}
                    </div>
                  </div>
                  <div style={{ background:'var(--navy4)',borderRadius:20,height:5 }}>
                    <div style={{ height:'100%',borderRadius:20,width:`${pct}%`,background:col,transition:'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div className="card" style={{ padding:16 }}>
            <div style={{ fontSize:11,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.8px',marginBottom:12 }}>Recent Bids</div>
            {bidHistory.length === 0 && (
              <div style={{ color:'var(--muted)',fontSize:13,textAlign:'center',padding:'12px 0' }}>No bids yet</div>
            )}
            {bidHistory.map((b, i) => (
              <div key={i} style={{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }}>
                <div style={{ fontFamily:'Rajdhani',fontSize:16,fontWeight:700,color:'var(--text)',minWidth:60 }}>₹{b.amount}Cr</div>
                <div style={{ flex:1,fontSize:12,color:'var(--muted)' }}>{b.profiles?.name?.split(' ')[0]}</div>
                <div style={{ fontSize:10,color:'var(--muted)' }}>{i === 0 ? 'just now' : `${i * 12}s ago`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}