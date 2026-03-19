import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [search, setSearch] = useState('')
  const [activeAuctionPlayerId, setActiveAuctionPlayerId] = useState(null)
  const [lastBidTime, setLastBidTime] = useState(null)
  const timerRef = useRef(null)
  const pollRef = useRef(null)
  const channelRef = useRef(null)
  const leagueRef = useRef(null)
  const memberRef = useRef(null)

  useEffect(() => {
    if (profile) init()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [profile])

  // Keep refs in sync
  useEffect(() => { leagueRef.current = league }, [league])
  useEffect(() => { memberRef.current = member }, [member])

  async function init() {
    setLoading(true)
    const { data: mem } = await supabase
      .from('league_members').select('*, leagues(*)')
      .eq('user_id', profile.id).single()
    if (!mem) { setLoading(false); return }
    setLeague(mem.leagues)
    setMember(mem)
    leagueRef.current = mem.leagues
    memberRef.current = mem

    const { data: lg } = await supabase
      .from('leagues').select('active_player_id')
      .eq('id', mem.league_id).single()
    const activeId = lg?.active_player_id
    setActiveAuctionPlayerId(activeId)

    await refreshData(mem, activeId)
    setupRealtime(mem)
    startPolling(mem)
    setLoading(false)
  }

  function setupRealtime(mem) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase.channel(`auction-${mem.league_id}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'auction_bids',
        filter: `league_id=eq.${mem.league_id}`
      }, async (payload) => {
        const bid = payload.new
        // Skip our own bids (already applied optimistically)
        if (bid.bidder_id === profile.id) return
        const [{ data: bidderProfile }, { data: playerData }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', bid.bidder_id).single(),
          supabase.from('players').select('*').eq('id', bid.player_id).single()
        ])
        setCurrentBid(bid.amount)
        setCurrentBidder(bidderProfile)
        setCurrentPlayer(playerData)
        setBidHistory(prev => [{ ...bid, profiles: bidderProfile, players: playerData }, ...prev.slice(0,7)])
        setLastBidTime(Date.now())
        resetTimer()
        refreshMembers(mem.league_id)
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'squad',
        filter: `league_id=eq.${mem.league_id}`
      }, () => { refreshData(mem, null) })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leagues',
        filter: `id=eq.${mem.league_id}`
      }, async (payload) => {
        const activeId = payload.new.active_player_id
        setActiveAuctionPlayerId(activeId)
        if (!activeId) {
          setCurrentPlayer(null); setCurrentBid(0)
          setCurrentBidder(null); setBidHistory([])
          if (timerRef.current) clearInterval(timerRef.current)
          refreshData(mem, null)
        } else if (activeId) {
          // New player started - fetch it
          const { data: p } = await supabase.from('players').select('*').eq('id', activeId).single()
          if (p) {
            setCurrentPlayer(p)
            setCurrentBid(p.base_price)
            setCurrentBidder(null)
            setBidHistory([])
            resetTimer()
          }
        }
      })
      .subscribe()

    channelRef.current = channel
  }

  // Polling as backup for real-time lag
  function startPolling(mem) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      await pollLatestBid(mem)
    }, 3000) // Poll every 3 seconds
  }

  async function pollLatestBid(mem) {
    if (!leagueRef.current) return
    const { data: latestBids } = await supabase
      .from('auction_bids').select('*, players(*), profiles(*)')
      .eq('league_id', mem.league_id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!latestBids?.length) return
    const latest = latestBids[0]

    // Check if this is newer than what we have
    const bidTime = new Date(latest.created_at).getTime()
    if (lastBidTime && bidTime <= lastBidTime) return

    setCurrentBid(latest.amount)
    setCurrentBidder(latest.profiles)
    if (latest.players) setCurrentPlayer(latest.players)
    setBidHistory(prev => {
      if (prev[0]?.id === latest.id) return prev
      return [latest, ...prev.slice(0,7)]
    })
    setLastBidTime(bidTime)
    await refreshMembers(mem.league_id)
  }

  async function refreshMembers(leagueId) {
    const { data: allMem } = await supabase
      .from('league_members').select('*, profiles(*)')
      .eq('league_id', leagueId)
    if (allMem) {
      setMembers(allMem)
      const myMem = allMem.find(m => m.user_id === profile.id)
      if (myMem) { setMember(myMem); memberRef.current = myMem }
    }
  }

  async function refreshData(mem, activePlayerId) {
    await refreshMembers(mem.league_id)
    const { data: allPlayers } = await supabase.from('players').select('*').order('name')
    const { data: squadData } = await supabase.from('squad').select('player_id').eq('league_id', mem.league_id)
    const soldIds = new Set(squadData?.map(s => s.player_id) || [])
    setPlayers((allPlayers || []).filter(p => !soldIds.has(p.id) && !p.is_unsold))
    setUnsoldPlayers((allPlayers || []).filter(p => p.is_unsold))

    if (activePlayerId) {
      const { data: bids } = await supabase
        .from('auction_bids').select('*, players(*), profiles(*)')
        .eq('league_id', mem.league_id)
        .eq('player_id', activePlayerId)
        .order('created_at', { ascending: false }).limit(10)
      if (bids?.length > 0) {
        const latest = bids[0]
        if (!soldIds.has(latest.player_id) && !latest.players?.is_unsold) {
          setCurrentPlayer(latest.players)
          setCurrentBid(latest.amount)
          setCurrentBidder(latest.profiles)
          setBidHistory(bids.slice(0,8))
          setLastBidTime(new Date(latest.created_at).getTime())
          resetTimer()
        }
      } else {
        // No bids yet, just show the player
        const { data: p } = await supabase.from('players').select('*').eq('id', activePlayerId).single()
        if (p && !soldIds.has(p.id)) {
          setCurrentPlayer(p)
          setCurrentBid(p.base_price)
          setCurrentBidder(null)
          setBidHistory([])
          resetTimer()
        }
      }
    } else {
      setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null); setBidHistory([])
    }
  }

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimer(30)
    timerRef.current = setInterval(() => {
      setTimer(t => { if (t <= 1) { clearInterval(timerRef.current); return 0 } return t - 1 })
    }, 1000)
  }

  async function placeBid(amount) {
    if (!currentPlayer || !member || bidding) return
    const mem = memberRef.current
    if (mem.purse_remaining < amount) { alert(`Not enough purse! You have ₹${mem.purse_remaining} Cr left.`); return }
    if (amount <= currentBid) { alert(`Bid must be more than ₹${currentBid} Cr`); return }
    if (currentBidder?.id === profile.id) { alert("You're already the highest bidder!"); return }

    // Optimistic update — instant UI response
    const optimisticBid = { amount, bidder_id: profile.id, profiles: { name: profile.name, id: profile.id }, players: currentPlayer, created_at: new Date().toISOString() }
    setCurrentBid(amount)
    setCurrentBidder({ id: profile.id, name: profile.name })
    setBidHistory(prev => [optimisticBid, ...prev.slice(0,7)])
    setLastBidTime(Date.now())
    resetTimer()
    setBidding(true)

    const { error } = await supabase.from('auction_bids').insert({
      league_id: leagueRef.current.id, player_id: currentPlayer.id,
      bidder_id: profile.id, amount
    })

    if (error) {
      // Revert on error
      alert('Bid failed: ' + error.message)
      await refreshData(memberRef.current, activeAuctionPlayerId)
    }
    setBidding(false)
  }

  async function sellPlayer() {
    if (!currentPlayer || !currentBidder || !member?.is_admin) return
    const { data: alreadySold } = await supabase.from('squad').select('id')
      .eq('player_id', currentPlayer.id).eq('league_id', league.id).maybeSingle()
    if (alreadySold) { setSoldMsg('Already sold!'); await clearActivePlayer(); return }

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
    setTimeout(() => setSoldMsg(''), 5000)
    await clearActivePlayer()
    await refreshData(memberRef.current, null)
  }

  async function clearActivePlayer() {
    await supabase.from('leagues').update({ active_player_id: null }).eq('id', league.id)
    setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null)
    setBidHistory([]); setActiveAuctionPlayerId(null)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  async function markUnsold() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Mark ${currentPlayer.name} as UNSOLD?`)) return
    await supabase.from('players').update({ is_unsold: true }).eq('id', currentPlayer.id)
    setSoldMsg(`${currentPlayer.name} marked as unsold.`)
    setTimeout(() => setSoldMsg(''), 3000)
    await clearActivePlayer()
    await refreshData(memberRef.current, null)
  }

  async function removeFromAuction() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Remove ${currentPlayer.name} from auction?`)) return
    setSoldMsg(`${currentPlayer.name} removed.`)
    setTimeout(() => setSoldMsg(''), 3000)
    await clearActivePlayer()
    await refreshData(memberRef.current, null)
  }

  async function reAuctionPlayer(player) {
    if (!member?.is_admin) return
    await supabase.from('players').update({ is_unsold: false }).eq('id', player.id)
    setSoldMsg(`${player.name} back to available!`)
    setTimeout(() => setSoldMsg(''), 3000)
    await refreshData(memberRef.current, activeAuctionPlayerId)
  }

  async function startBiddingOnPlayer(player) {
    if (!member?.is_admin) return
    const { data: alreadySold } = await supabase.from('squad').select('id')
      .eq('player_id', player.id).eq('league_id', league.id).maybeSingle()
    if (alreadySold) { alert('Already sold!'); return }

    setCurrentPlayer(player); setCurrentBid(player.base_price)
    setCurrentBidder(null); setBidHistory([])
    setActiveAuctionPlayerId(player.id)
    resetTimer()

    await supabase.from('leagues').update({ active_player_id: player.id }).eq('id', league.id)
    await supabase.from('auction_bids').insert({
      league_id: league.id, player_id: player.id,
      bidder_id: profile.id, amount: player.base_price
    })
  }

  const filteredPlayers = players.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.team.toLowerCase().includes(search.toLowerCase())
  )

  const timerPct = (timer / 30) * 100
  const timerColor = timer < 8 ? 'var(--red)' : timer < 15 ? 'var(--gold)' : 'var(--teal)'
  const isMyBid = currentBidder?.id === profile.id
  const totalSold = members.reduce((a, m) => a + (120 - m.purse_remaining), 0)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading auction...</div>
    </div>
  )
  if (!league) return (
    <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🏟️</div>
      <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700 }}>Join a league first</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <div style={{ fontSize:12, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:6 }}>Live Bidding</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:36, fontWeight:700, marginBottom:4 }}>Auction Room</h1>
          <div style={{ color:'var(--text2)', fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
            <span>{players.length} available</span>
            <span style={{ color:'var(--border2)' }}>·</span>
            <span>{unsoldPlayers.length} unsold</span>
            <span style={{ color:'var(--border2)' }}>·</span>
            <span>₹{totalSold} Cr spent total</span>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:20, padding:'8px 16px' }}>
            <div className="live-dot" />
            <span style={{ fontSize:12, fontWeight:700, color:'var(--red)', letterSpacing:1 }}>LIVE</span>
          </div>
          <div style={{ padding:'8px 18px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:20 }}>
            <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px' }}>Your Purse</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color: member?.purse_remaining < 20 ? 'var(--red)' : member?.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)', lineHeight:1.1 }}>₹{member?.purse_remaining} Cr</div>
          </div>
        </div>
      </div>

      {/* Sold message */}
      {soldMsg && (
        <div className="fade-in" style={{ padding:'16px 22px', background:'linear-gradient(135deg, rgba(0,212,170,0.1), rgba(0,212,170,0.03))', border:'1px solid rgba(0,212,170,0.25)', borderRadius:14, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:24 }}>🎉</span>
          <span style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--teal)' }}>{soldMsg}</span>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 290px', gap:18 }}>
        {/* Main */}
        <div>
          {/* Player card */}
          {currentPlayer ? (
            <div className="fade-in" style={{ position:'relative', background:'linear-gradient(135deg, #0E1B2E 0%, #13203A 50%, #0E1B2E 100%)', border:`1px solid ${isMyBid?'rgba(0,212,170,0.3)':'rgba(240,165,0,0.15)'}`, borderRadius:20, padding:28, marginBottom:14, overflow:'hidden', boxShadow:`0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${isMyBid?'rgba(0,212,170,0.1)':'rgba(240,165,0,0.05)'}` }}>

              {/* Background glow */}
              <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:`radial-gradient(circle, ${isMyBid?'rgba(0,212,170,0.08)':'rgba(240,165,0,0.06)'} 0%, transparent 70%)`, pointerEvents:'none' }} />

              {/* Your bid indicator */}
              {isMyBid && (
                <div style={{ position:'absolute', top:16, right:16, display:'flex', alignItems:'center', gap:6, background:'rgba(0,212,170,0.15)', border:'1px solid rgba(0,212,170,0.3)', borderRadius:20, padding:'4px 12px' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--teal)', animation:'pulse 1s ease infinite' }} />
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--teal)' }}>YOU'RE LEADING</span>
                </div>
              )}

              <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
                {/* Avatar */}
                <div style={{ width:90, height:90, borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:30, fontWeight:700, flexShrink:0, background:ROLE_BG[ROLE_COLOR[currentPlayer.role]], color:ROLE_TEXT[ROLE_COLOR[currentPlayer.role]], border:`2px solid ${ROLE_TEXT[ROLE_COLOR[currentPlayer.role]]}33`, boxShadow:`0 0 24px ${ROLE_TEXT[ROLE_COLOR[currentPlayer.role]]}22` }}>
                  {currentPlayer.image_initials || currentPlayer.name.slice(0,2)}
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'Rajdhani', fontSize:32, fontWeight:700, color:'var(--text)', marginBottom:8, lineHeight:1 }}>{currentPlayer.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                    <span className={`badge badge-${ROLE_COLOR[currentPlayer.role]}`} style={{ fontSize:11 }}>{currentPlayer.role}</span>
                    <span style={{ fontSize:14, color:'var(--text2)', fontWeight:600 }}>{currentPlayer.team}</span>
                    <span style={{ fontSize:12, color:'var(--text3)', padding:'2px 8px', background:'var(--navy4)', borderRadius:6 }}>Base ₹{currentPlayer.base_price} Cr</span>
                  </div>

                  {/* Stats */}
                  <div style={{ display:'flex', gap:0, background:'var(--navy3)', borderRadius:10, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
                    {[
                      currentPlayer.runs > 0 && { label:'Runs', value:currentPlayer.runs },
                      currentPlayer.wickets > 0 && { label:'Wkts', value:currentPlayer.wickets },
                      currentPlayer.strike_rate && { label:'SR', value:currentPlayer.strike_rate },
                      currentPlayer.economy && { label:'Econ', value:currentPlayer.economy },
                      currentPlayer.matches > 0 && { label:'Matches', value:currentPlayer.matches },
                    ].filter(Boolean).slice(0,4).map((s, i, arr) => (
                      <div key={s.label} style={{ padding:'8px 16px', textAlign:'center', borderRight: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--text)' }}>{s.value}</div>
                        <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', marginTop:1 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Current bid */}
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:6 }}>Current Bid</div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:48, fontWeight:700, color:'var(--gold)', lineHeight:1, textShadow:'0 0 40px rgba(240,165,0,0.5)' }}>₹{currentBid}</div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:500, color:'var(--gold)', opacity:0.7 }}>Crore</div>
                  <div style={{ fontSize:12, color: isMyBid ? 'var(--teal)' : 'var(--text3)', marginTop:8, fontWeight: isMyBid ? 600 : 400 }}>
                    {currentBidder ? `by ${currentBidder.name?.split(' ')[0]}` : 'Opening bid'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ background:'var(--navy2)', border:`2px dashed ${member?.is_admin?'rgba(240,165,0,0.2)':'var(--border)'}`, borderRadius:20, padding:52, textAlign:'center', marginBottom:14 }}>
              <div style={{ fontSize:52, marginBottom:16 }}>🔨</div>
              <div style={{ fontFamily:'Rajdhani', fontSize:24, fontWeight:700, color:'var(--text2)', marginBottom:8 }}>
                {member?.is_admin ? 'Select a player to start' : 'Auction not started yet'}
              </div>
              <div style={{ fontSize:14, color:'var(--text3)' }}>
                {member?.is_admin ? 'Click any player from the list below to begin bidding' : 'Wait for the admin to put up the next player'}
              </div>
            </div>
          )}

          {/* Timer */}
          {currentPlayer && (
            <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 18px', marginBottom:12, display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
                  <span style={{ fontSize:12, color:'var(--text3)', fontWeight:500 }}>Time to bid</span>
                  <span style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:timerColor }}>{timer}s</span>
                </div>
                <div style={{ background:'var(--navy4)', borderRadius:20, height:7, overflow:'hidden' }}>
                  <div style={{ height:'100%', borderRadius:20, background:timerColor, width:`${timerPct}%`, transition:'width 1s linear, background 0.3s', boxShadow:`0 0 10px ${timerColor}88` }} />
                </div>
              </div>
            </div>
          )}

          {/* Bid buttons */}
          {currentPlayer && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
              {[
                { inc:1, label:'Quick' },
                { inc:2, label:'Raise' },
                { inc:5, label:'Power' },
              ].map(({ inc, label }) => {
                const amt = currentBid + inc
                const canBid = member?.purse_remaining >= amt && !isMyBid && !bidding
                return (
                  <button key={inc} onClick={() => placeBid(amt)} disabled={!canBid}
                    style={{ padding:'16px 10px', borderRadius:14, fontSize:13, fontWeight:600, border:`1px solid ${canBid?'rgba(240,165,0,0.2)':'var(--border)'}`, cursor:canBid?'pointer':'not-allowed', transition:'all 0.15s', fontFamily:'Plus Jakarta Sans, sans-serif',
                      background:canBid?'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.03))':'var(--navy3)',
                      opacity:canBid?1:0.4 }}
                    onMouseEnter={e => { if(canBid) { e.currentTarget.style.background='linear-gradient(135deg, rgba(240,165,0,0.15), rgba(240,165,0,0.05))'; e.currentTarget.style.borderColor='rgba(240,165,0,0.4)'; e.currentTarget.style.transform='translateY(-2px)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background=canBid?'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.03))':'var(--navy3)'; e.currentTarget.style.borderColor=canBid?'rgba(240,165,0,0.2)':'var(--border)'; e.currentTarget.style.transform='translateY(0)' }}>
                    <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>{label} +₹{inc}Cr</div>
                    <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:canBid?'var(--gold)':'var(--text3)' }}>₹{amt} Cr</div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Your bid status */}
          {currentPlayer && isMyBid && (
            <div style={{ padding:'10px 16px', background:'rgba(0,212,170,0.06)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:10, marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>✅</span>
              <span style={{ fontSize:13, color:'var(--teal)', fontWeight:600 }}>You're the highest bidder at ₹{currentBid} Cr — waiting for others...</span>
            </div>
          )}

          {/* Admin sell buttons */}
          {currentPlayer && member?.is_admin && currentBidder && timer === 0 && (
            <button className="btn btn-primary" style={{ width:'100%', marginBottom:10, padding:18, fontSize:20, fontFamily:'Rajdhani', fontWeight:700, letterSpacing:1, borderRadius:14 }} onClick={sellPlayer}>
              🔨 SOLD! {currentPlayer.name} → {currentBidder.name?.split(' ')[0]} for ₹{currentBid} Cr
            </button>
          )}

          {currentPlayer && member?.is_admin && currentBidder && timer > 0 && (
            <button className="btn btn-teal" style={{ width:'100%', marginBottom:10, padding:14, fontSize:15, borderRadius:14, fontWeight:600 }} onClick={sellPlayer}>
              ✓ Confirm Sale — ₹{currentBid} Cr to {currentBidder.name?.split(' ')[0]}
            </button>
          )}

          {currentPlayer && member?.is_admin && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              <button className="btn btn-danger" style={{ borderRadius:12, padding:13 }} onClick={markUnsold}>🔴 Mark Unsold</button>
              <button className="btn btn-ghost" style={{ borderRadius:12, padding:13 }} onClick={removeFromAuction}>✕ Remove</button>
            </div>
          )}

          {/* Admin player list */}
          {member?.is_admin && (
            <div style={{ marginTop:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <h3 style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700 }}>
                  Available <span style={{ color:'var(--text3)', fontWeight:400, fontSize:16 }}>({filteredPlayers.length})</span>
                </h3>
                <input className="input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width:180, padding:'7px 12px', fontSize:12 }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, maxHeight:420, overflowY:'auto' }} className="no-scroll">
                {filteredPlayers.map(p => {
                  const rc = ROLE_COLOR[p.role]
                  const isActive = currentPlayer?.id === p.id
                  return (
                    <div key={p.id} onClick={() => startBiddingOnPlayer(p)}
                      style={{ background:isActive?'rgba(240,165,0,0.08)':'var(--navy2)', border:`1px solid ${isActive?'rgba(240,165,0,0.35)':'var(--border)'}`, borderRadius:12, padding:'10px 14px', cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:10 }}
                      onMouseEnter={e => { if(!isActive){e.currentTarget.style.background='var(--navy3)'; e.currentTarget.style.borderColor='rgba(240,165,0,0.2)'} }}
                      onMouseLeave={e => { if(!isActive){e.currentTarget.style.background='var(--navy2)'; e.currentTarget.style.borderColor='var(--border)'} }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:ROLE_BG[rc], display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:ROLE_TEXT[rc], flexShrink:0 }}>
                        {p.image_initials || p.name.slice(0,2)}
                      </div>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{p.team} · ₹{p.base_price}Cr</div>
                      </div>
                      {isActive && <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--gold)', flexShrink:0, boxShadow:'0 0 6px var(--gold)' }} />}
                    </div>
                  )
                })}
              </div>

              {unsoldPlayers.length > 0 && (
                <div style={{ marginTop:20 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--red)' }}>
                      Unsold <span style={{ color:'var(--text3)', fontWeight:400, fontSize:14 }}>({unsoldPlayers.length})</span>
                    </h3>
                    <button className="btn btn-ghost" style={{ fontSize:12, padding:'4px 12px', borderRadius:8 }} onClick={() => setShowUnsold(!showUnsold)}>
                      {showUnsold?'Hide':'Show'}
                    </button>
                  </div>
                  {showUnsold && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {unsoldPlayers.map(p => (
                        <div key={p.id} style={{ background:'rgba(255,71,87,0.04)', border:'1px solid rgba(255,71,87,0.15)', borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                            <div style={{ width:34, height:34, borderRadius:9, background:'rgba(255,71,87,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'var(--red)', flexShrink:0 }}>
                              {p.image_initials || p.name.slice(0,2)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                              <div style={{ fontSize:11, color:'var(--text3)' }}>{p.team}</div>
                            </div>
                          </div>
                          <button className="btn btn-teal" style={{ fontSize:11, padding:'5px 10px', flexShrink:0, borderRadius:8 }} onClick={() => reAuctionPlayer(p)}>Re-auction</button>
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
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {/* Purse tracker */}
          <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, padding:18 }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:16 }}>Friend Purses</div>
            {members.sort((a,b) => b.purse_remaining - a.purse_remaining).map((m) => {
              const pct = Math.round((m.purse_remaining/120)*100)
              const col = m.purse_remaining < 20 ? 'var(--red)' : m.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)'
              const isLeading = currentBidder?.id === m.user_id
              const isMe = m.user_id === profile?.id
              return (
                <div key={m.id} style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--navy4)', border:`1px solid ${isMe?'rgba(240,165,0,0.3)':'var(--border2)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'var(--text2)', overflow:'hidden', flexShrink:0 }}>
                        {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                      </div>
                      <span style={{ fontSize:13, fontWeight:600, color:isMe?'var(--gold)':'var(--text)' }}>
                        {m.profiles?.name?.split(' ')[0]}
                        {isMe && <span style={{ fontSize:9, color:'var(--gold)', marginLeft:4, opacity:0.7 }}>you</span>}
                      </span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <span style={{ fontSize:12, fontFamily:'Rajdhani', fontWeight:700, color:col }}>₹{m.purse_remaining}Cr</span>
                      {isLeading && <span style={{ fontSize:9, color:'var(--teal)', fontWeight:700, background:'var(--teal2)', padding:'2px 5px', borderRadius:4 }}>⬆</span>}
                    </div>
                  </div>
                  <div style={{ background:'var(--navy4)', borderRadius:20, height:5, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:20, width:`${pct}%`, background:col, transition:'width 0.6s ease', boxShadow:`0 0 6px ${col}44` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Live bid feed */}
          <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:16, padding:18, flex:1 }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:14 }}>Live Bid Feed</div>
            {bidHistory.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text3)', fontSize:13 }}>
                <div style={{ fontSize:24, marginBottom:8 }}>🎯</div>
                No bids yet
              </div>
            ) : (
              bidHistory.map((b, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, padding:'9px 12px', background: i===0?'rgba(240,165,0,0.06)':'transparent', borderRadius:10, border: i===0?'1px solid rgba(240,165,0,0.12)':'1px solid transparent', transition:'all 0.3s' }}>
                  <div style={{ width:32, height:32, borderRadius:'50%', background: i===0?'rgba(240,165,0,0.15)':'var(--navy4)', border: i===0?'1px solid rgba(240,165,0,0.2)':'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color: i===0?'var(--gold)':'var(--text2)', flexShrink:0 }}>
                    {b.profiles?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, color: i===0?'var(--text)':'var(--text2)' }}>{b.profiles?.name?.split(' ')[0]}</div>
                    <div style={{ fontSize:10, color:'var(--text3)' }}>{i===0?'just now':`${i*12}s ago`}</div>
                  </div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color: i===0?'var(--gold)':'var(--text2)' }}>₹{b.amount}Cr</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}