import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLE_COLOR = { 'Batsman':'bat', 'Bowler':'bowl', 'All-Rounder':'ar', 'WK-Batsman':'wk' }
const ROLE_BG = { 'bat':'rgba(240,165,0,0.12)', 'bowl':'rgba(0,212,170,0.12)', 'ar':'rgba(255,71,87,0.12)', 'wk':'rgba(75,159,255,0.12)' }
const ROLE_TEXT = { 'bat':'var(--gold)', 'bowl':'var(--teal)', 'ar':'var(--red)', 'wk':'var(--blue)' }

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
  const [activeAuctionPlayerId, setActiveAuctionPlayerId] = useState(null)
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

    // Load active auction player from DB
    const { data: auctionState } = await supabase
      .from('leagues').select('active_player_id')
      .eq('id', mem.league_id).single()
    if (auctionState?.active_player_id) {
      setActiveAuctionPlayerId(auctionState.active_player_id)
    }

    await refreshData(mem, auctionState?.active_player_id)

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
      }, async () => { await refreshData(mem, null) })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leagues',
        filter: `id=eq.${mem.league_id}`
      }, async (payload) => {
        const activeId = payload.new.active_player_id
        setActiveAuctionPlayerId(activeId)
        if (!activeId) {
          // Admin cleared the player - clear for everyone
          setCurrentPlayer(null)
          setCurrentBid(0)
          setCurrentBidder(null)
          setBidHistory([])
          if (timerRef.current) clearInterval(timerRef.current)
        }
      })
      .subscribe()

    channelRef.current = channel
    setLoading(false)
  }

  async function refreshData(mem, activePlayerId) {
    const { data: allMem } = await supabase
      .from('league_members').select('*, profiles(*)')
      .eq('league_id', mem.league_id)
    setMembers(allMem || [])
    const myMem = allMem?.find(m => m.user_id === profile.id)
    if (myMem) setMember(myMem)

    const { data: allPlayers } = await supabase.from('players').select('*').order('name')
    const { data: squadData } = await supabase.from('squad').select('player_id').eq('league_id', mem.league_id)
    const soldIds = new Set(squadData?.map(s => s.player_id) || [])
    const available = (allPlayers || []).filter(p => !soldIds.has(p.id) && !p.is_unsold)
    const unsold = (allPlayers || []).filter(p => p.is_unsold)
    setPlayers(available)
    setUnsoldPlayers(unsold)

    // Only restore current player if there's an active auction player
    if (activePlayerId) {
      const { data: latestBids } = await supabase
        .from('auction_bids').select('*, players(*), profiles(*)')
        .eq('league_id', mem.league_id)
        .eq('player_id', activePlayerId)
        .order('created_at', { ascending: false }).limit(10)

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
    } else {
      // No active player — clear the board
      setCurrentPlayer(null)
      setCurrentBid(0)
      setCurrentBidder(null)
      setBidHistory([])
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
    if (alreadySold) { alert('This player was already sold!'); await refreshData(member, null); return }
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
      await clearActivePlayer()
      return
    }
    const { error } = await supabase.from('squad').insert({
      league_id: league.id, user_id: currentBidder.id,
      player_id: currentPlayer.id, bought_price: currentBid
    })
    if (error) { setSoldMsg('Error: ' + error.message); return }
    const { data: winnerMem } = await supabase.from('league_members').select('purse_remaining')
      .eq('league_id', league.id).eq('user_id', currentBidder.id).single()
    if (winnerMem) {
      await supabase.from('league_members').update({
        purse_remaining: winnerMem.purse_remaining - currentBid
      }).eq('league_id', league.id).eq('user_id', currentBidder.id)
    }
    setSoldMsg(`🔨 ${currentPlayer.name} SOLD to ${currentBidder.name?.split(' ')[0]} for ₹${currentBid} Cr!`)
    setTimeout(() => setSoldMsg(''), 4000)
    await clearActivePlayer()
    await refreshData(member, null)
  }

  async function clearActivePlayer() {
    // Clear active player in DB so all users see empty board
    await supabase.from('leagues').update({ active_player_id: null }).eq('id', league.id)
    setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); setBidHistory([])
    setActiveAuctionPlayerId(null)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  async function markUnsold() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Mark ${currentPlayer.name} as UNSOLD?`)) return
    await supabase.from('players').update({ is_unsold: true }).eq('id', currentPlayer.id)
    setSoldMsg(`${currentPlayer.name} marked as unsold.`)
    setTimeout(() => setSoldMsg(''), 3000)
    await clearActivePlayer()
    await refreshData(member, null)
  }

  async function removeFromAuction() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Remove ${currentPlayer.name} from auction? They go back to available list.`)) return
    setSoldMsg(`${currentPlayer.name} removed from auction.`)
    setTimeout(() => setSoldMsg(''), 3000)
    await clearActivePlayer()
    await refreshData(member, null)
  }

  async function reAuctionPlayer(player) {
    if (!member?.is_admin) return
    await supabase.from('players').update({ is_unsold: false }).eq('id', player.id)
    setSoldMsg(`${player.name} moved back to available!`)
    setTimeout(() => setSoldMsg(''), 3000)
    await refreshData(member, activeAuctionPlayerId)
  }

  async function startBiddingOnPlayer(player) {
    if (!member?.is_admin) return
    const { data: alreadySold } = await supabase.from('squad').select('id').eq('player_id', player.id).eq('league_id', league.id).maybeSingle()
    if (alreadySold) { alert('This player is already sold!'); return }
    // Save active player to DB so all users see it
    await supabase.from('leagues').update({ active_player_id: player.id }).eq('id', league.id)
    setActiveAuctionPlayerId(player.id)
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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading auction...</div>
    </div>
  )
  if (!league) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Join a league first from the Dashboard.</div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
        <div>
          <div style={{ fontSize:12, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:6 }}>Live Bidding</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:36, fontWeight:700, marginBottom:4 }}>Auction Room</h1>
          <div style={{ color:'var(--text2)', fontSize:14 }}>
            {players.length} available · {unsoldPlayers.length} unsold · ₹120 Cr purse each
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:20, padding:'8px 16px' }}>
            <div className="live-dot" />
            <span style={{ fontSize:12, fontWeight:700, color:'var(--red)', letterSpacing:1 }}>LIVE</span>
          </div>
          <div style={{ padding:'8px 18px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:20, fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--gold)' }}>
            ₹{member?.purse_remaining} Cr
          </div>
        </div>
      </div>

      {/* Sold message */}
      {soldMsg && (
        <div className="fade-in" style={{ padding:'16px 20px', background:'linear-gradient(135deg, rgba(0,212,170,0.1), rgba(0,212,170,0.05))', border:'1px solid rgba(0,212,170,0.25)', borderRadius:14, marginBottom:16, color:'var(--teal)', fontFamily:'Rajdhani', fontSize:20, fontWeight:700, display:'flex', alignItems:'center', gap:10 }}>
          {soldMsg}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:18 }}>
        {/* Main */}
        <div>
          {/* Current player */}
          {currentPlayer ? (
            <div className="fade-in" style={{ background:'linear-gradient(135deg, #0D1A2E 0%, #111D30 100%)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:18, padding:26, marginBottom:14, boxShadow:'0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ display:'flex', gap:22, alignItems:'center' }}>
                <div style={{ width:86, height:86, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:28, fontWeight:700, flexShrink:0, background:ROLE_BG[ROLE_COLOR[currentPlayer.role]], color:ROLE_TEXT[ROLE_COLOR[currentPlayer.role]], border:`1px solid ${ROLE_TEXT[ROLE_COLOR[currentPlayer.role]]}33`, boxShadow:`0 0 20px ${ROLE_TEXT[ROLE_COLOR[currentPlayer.role]]}22` }}>
                  {currentPlayer.image_initials || currentPlayer.name.slice(0,2)}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:'Rajdhani', fontSize:30, fontWeight:700, color:'var(--text)', marginBottom:6 }}>{currentPlayer.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                    <span className={`badge badge-${ROLE_COLOR[currentPlayer.role]}`}>{currentPlayer.role}</span>
                    <span style={{ fontSize:13, color:'var(--text2)', fontWeight:500 }}>{currentPlayer.team}</span>
                    <span style={{ fontSize:12, color:'var(--text3)' }}>Base: ₹{currentPlayer.base_price} Cr</span>
                  </div>
                  <div style={{ display:'flex', gap:20 }}>
                    {currentPlayer.runs > 0 && <div><div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--text)' }}>{currentPlayer.runs}</div><div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Runs</div></div>}
                    {currentPlayer.wickets > 0 && <div><div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--text)' }}>{currentPlayer.wickets}</div><div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Wickets</div></div>}
                    {currentPlayer.strike_rate && <div><div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--text)' }}>{currentPlayer.strike_rate}</div><div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px' }}>SR</div></div>}
                    {currentPlayer.economy && <div><div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--text)' }}>{currentPlayer.economy}</div><div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px' }}>Economy</div></div>}
                  </div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Current Bid</div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:44, fontWeight:700, color:'var(--gold)', lineHeight:1, textShadow:'0 0 30px rgba(240,165,0,0.4)' }}>₹{currentBid} Cr</div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:6 }}>
                    {currentBidder ? `by ${currentBidder.name?.split(' ')[0]}` : 'Opening bid'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background:'var(--navy2)', border:`2px dashed ${member?.is_admin?'rgba(240,165,0,0.2)':'var(--border)'}`, borderRadius:18, padding:48, textAlign:'center', marginBottom:14 }}>
              <div style={{ fontSize:48, marginBottom:14 }}>🔨</div>
              <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:'var(--text2)', marginBottom:6 }}>
                {member?.is_admin ? 'Select a player to start bidding' : 'Waiting for admin to start...'}
              </div>
              <div style={{ fontSize:13, color:'var(--text3)' }}>
                {member?.is_admin ? 'Click any player from the list below' : 'Sit tight, the auction will begin soon!'}
              </div>
            </div>
          )}

          {/* Timer */}
          {currentPlayer && (
            <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 20px', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:13, color:'var(--text2)', fontWeight:500 }}>Time remaining</span>
                <span style={{ fontFamily:'Rajdhani', fontSize:26, fontWeight:700, color:timerColor, textShadow:timer < 8 ? '0 0 16px var(--red)' : 'none' }}>{timer}s</span>
              </div>
              <div style={{ background:'var(--navy4)', borderRadius:20, height:8, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:20, background:timerColor, width:`${timerPct}%`, transition:'width 1s linear, background 0.3s', boxShadow:`0 0 10px ${timerColor}66` }} />
              </div>
            </div>
          )}

          {/* Bid buttons */}
          {currentPlayer && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
              {[currentBid+1, currentBid+2, currentBid+5].map(amt => (
                <button key={amt} onClick={() => placeBid(amt)}
                  disabled={bidding || member?.purse_remaining < amt || currentBidder?.id === profile?.id}
                  style={{ padding:'14px 10px', borderRadius:12, fontSize:13, fontWeight:600, border:'1px solid var(--border2)', cursor:'pointer', transition:'all 0.2s', fontFamily:'Plus Jakarta Sans, sans-serif',
                    background: member?.purse_remaining < amt ? 'var(--navy3)' : 'var(--navy4)',
                    color: member?.purse_remaining < amt ? 'var(--text3)' : 'var(--text)',
                    opacity: member?.purse_remaining < amt ? 0.4 : 1 }}
                  onMouseEnter={e => { if (member?.purse_remaining >= amt) { e.currentTarget.style.background='var(--navy5)'; e.currentTarget.style.borderColor='rgba(240,165,0,0.3)' } }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--navy4)'; e.currentTarget.style.borderColor='var(--border2)' }}>
                  <div style={{ color:'var(--text3)', fontSize:11, marginBottom:2 }}>+₹{amt-currentBid} Cr</div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--gold)' }}>₹{amt} Cr</div>
                </button>
              ))}
            </div>
          )}

          {/* SOLD - timer at 0 */}
          {currentPlayer && member?.is_admin && currentBidder && timer === 0 && (
            <button className="btn btn-primary" style={{ width:'100%', marginBottom:10, padding:16, fontSize:18, fontFamily:'Rajdhani', fontWeight:700, letterSpacing:1, borderRadius:12 }} onClick={sellPlayer}>
              🔨 SOLD! {currentPlayer.name} → {currentBidder.name?.split(' ')[0]} for ₹{currentBid} Cr
            </button>
          )}

          {/* Confirm sale anytime */}
          {currentPlayer && member?.is_admin && currentBidder && timer > 0 && (
            <button className="btn btn-teal" style={{ width:'100%', marginBottom:10, padding:13, fontSize:14, borderRadius:12 }} onClick={sellPlayer}>
              ✓ Confirm Sale — ₹{currentBid} Cr to {currentBidder.name?.split(' ')[0]}
            </button>
          )}

          {/* Admin controls */}
          {currentPlayer && member?.is_admin && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <button className="btn btn-danger" style={{ borderRadius:12, padding:12 }} onClick={markUnsold}>
                🔴 Mark Unsold
              </button>
              <button className="btn btn-ghost" style={{ borderRadius:12, padding:12 }} onClick={removeFromAuction}>
                ✕ Remove from Auction
              </button>
            </div>
          )}

          {/* Players list - admin */}
          {member?.is_admin && (
            <div style={{ marginTop:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--text2)' }}>
                  Available Players <span style={{ color:'var(--text3)', fontSize:16, fontWeight:400 }}>({players.length})</span>
                </h3>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, maxHeight:400, overflowY:'auto' }} className="no-scroll">
                {players.map(p => {
                  const rc = ROLE_COLOR[p.role]
                  const isActive = currentPlayer?.id === p.id
                  return (
                    <div key={p.id} onClick={() => startBiddingOnPlayer(p)}
                      style={{ background: isActive ? 'rgba(240,165,0,0.08)' : 'var(--navy2)', border:`1px solid ${isActive?'rgba(240,165,0,0.4)':'var(--border)'}`, borderRadius:12, padding:'10px 14px', cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:10 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor='rgba(240,165,0,0.3)'; e.currentTarget.style.background='var(--navy3)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor=isActive?'rgba(240,165,0,0.4)':'var(--border)'; e.currentTarget.style.background=isActive?'rgba(240,165,0,0.08)':'var(--navy2)' }}>
                      <div style={{ width:36, height:36, borderRadius:9, background:ROLE_BG[rc], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:ROLE_TEXT[rc], flexShrink:0 }}>
                        {p.image_initials || p.name.slice(0,2)}
                      </div>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'var(--text)' }}>{p.name}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>{p.team} · ₹{p.base_price}Cr</div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Unsold section */}
              {unsoldPlayers.length > 0 && (
                <div style={{ marginTop:20 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                    <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--red)', display:'flex', alignItems:'center', gap:8 }}>
                      🔴 Unsold <span style={{ color:'var(--text3)', fontSize:14, fontWeight:400 }}>({unsoldPlayers.length})</span>
                    </h3>
                    <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 12px', borderRadius:8 }} onClick={() => setShowUnsold(!showUnsold)}>
                      {showUnsold ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showUnsold && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {unsoldPlayers.map(p => (
                        <div key={p.id} style={{ background:'rgba(255,71,87,0.04)', border:'1px solid rgba(255,71,87,0.15)', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
                            <div style={{ width:34, height:34, borderRadius:9, background:'rgba(255,71,87,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--red)', flexShrink:0 }}>
                              {p.image_initials || p.name.slice(0,2)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                              <div style={{ fontSize:11, color:'var(--text3)' }}>{p.team}</div>
                            </div>
                          </div>
                          <button className="btn btn-teal" style={{ fontSize:11, padding:'4px 10px', flexShrink:0, borderRadius:8 }} onClick={() => reAuctionPlayer(p)}>
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
          <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, padding:18, marginBottom:14 }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:16 }}>Friend Purses</div>
            {members.map((m) => {
              const pct = Math.round((m.purse_remaining/120)*100)
              const col = m.purse_remaining < 20 ? 'var(--red)' : m.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)'
              const isLeading = currentBidder?.id === m.user_id
              const isMe = m.user_id === profile?.id
              return (
                <div key={m.id} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--navy4)', border:'1px solid var(--border2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--text2)', overflow:'hidden', flexShrink:0 }}>
                        {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:isMe?'var(--gold)':'var(--text)' }}>
                        {m.profiles?.name?.split(' ')[0]}
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:12, color:'var(--text2)', fontFamily:'Rajdhani', fontWeight:600 }}>₹{m.purse_remaining}Cr</span>
                      {isLeading && <span style={{ fontSize:9, color:'var(--teal)', fontWeight:700, background:'var(--teal2)', padding:'2px 6px', borderRadius:4, letterSpacing:'0.5px' }}>LEADING</span>}
                    </div>
                  </div>
                  <div style={{ background:'var(--navy4)', borderRadius:20, height:5 }}>
                    <div style={{ height:'100%', borderRadius:20, width:`${pct}%`, background:col, transition:'width 0.5s', boxShadow:`0 0 6px ${col}66` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Recent bids */}
          <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:14 }}>Recent Bids</div>
            {bidHistory.length === 0 && (
              <div style={{ color:'var(--text3)', fontSize:13, textAlign:'center', padding:'16px 0' }}>No bids yet</div>
            )}
            {bidHistory.map((b, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'8px 10px', background: i === 0 ? 'rgba(240,165,0,0.05)' : 'transparent', borderRadius:8, border: i === 0 ? '1px solid rgba(240,165,0,0.1)' : '1px solid transparent' }}>
                <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color: i === 0 ? 'var(--gold)' : 'var(--text)', minWidth:60 }}>₹{b.amount}Cr</div>
                <div style={{ flex:1, fontSize:12, color:'var(--text2)', fontWeight:500 }}>{b.profiles?.name?.split(' ')[0]}</div>
                <div style={{ fontSize:10, color:'var(--text3)' }}>{i === 0 ? 'just now' : `${i*12}s ago`}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}