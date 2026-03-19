import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.12)','Bowler':'rgba(0,212,170,0.12)','All-Rounder':'rgba(255,71,87,0.12)','WK-Batsman':'rgba(75,159,255,0.12)' }
const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }
const ROLE_CLASS = { 'Batsman':'bat','Bowler':'bowl','All-Rounder':'ar','WK-Batsman':'wk' }

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
  const [activePlayerId, setActivePlayerId] = useState(null)
  const timerRef = useRef(null)
  const pollRef = useRef(null)
  const channelRef = useRef(null)
  const leagueRef = useRef(null)
  const memberRef = useRef(null)

  useEffect(() => {
    if (profile) init()
    return () => cleanup()
  }, [profile])

  function cleanup() {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function init() {
    setLoading(true)
    try {
  const { data: mems } = await supabase
  .from('league_members').select('*, leagues(*)')
  .eq('user_id', profile.id)
if (!mems || mems.length === 0) { setLoading(false); return }
const mem = mems[0]
      setLeague(mem.leagues)
      setMember(mem)
      leagueRef.current = mem.leagues
      memberRef.current = mem

      const { data: lg } = await supabase
        .from('leagues').select('active_player_id')
        .eq('id', mem.league_id).single()
      const activeId = lg?.active_player_id || null
      setActivePlayerId(activeId)

      await loadAll(mem.league_id, activeId)
      setupChannel(mem.league_id)
      startPoll(mem.league_id)
    } catch (e) {
      console.error('Init error:', e)
    }
    setLoading(false)
  }

  async function loadAll(leagueId, activeId) {
    try {
      const { data: allMem } = await supabase
        .from('league_members').select('*, profiles(*)')
        .eq('league_id', leagueId)
      setMembers(allMem || [])
      const myMem = allMem?.find(m => m.user_id === profile.id)
      if (myMem) { setMember(myMem); memberRef.current = myMem }

      const { data: allPlayers } = await supabase.from('players').select('*').order('name')
      const { data: squadData } = await supabase.from('squad').select('player_id').eq('league_id', leagueId)
      const soldIds = new Set(squadData?.map(s => s.player_id) || [])
      setPlayers((allPlayers || []).filter(p => !soldIds.has(p.id) && !p.is_unsold))
      setUnsoldPlayers((allPlayers || []).filter(p => p.is_unsold))

      if (activeId) {
        const { data: bids } = await supabase
          .from('auction_bids').select('*, players(*), profiles(*)')
          .eq('league_id', leagueId)
          .eq('player_id', activeId)
          .order('created_at', { ascending: false })
          .limit(10)

        if (bids?.length > 0 && !soldIds.has(bids[0].player_id)) {
          setCurrentPlayer(bids[0].players)
          setCurrentBid(bids[0].amount)
          setCurrentBidder(bids[0].profiles)
          setBidHistory(bids)
          resetTimer()
        } else if (!bids?.length) {
          const { data: p } = await supabase.from('players').select('*').eq('id', activeId).single()
          if (p && !soldIds.has(p.id)) {
            setCurrentPlayer(p)
            setCurrentBid(p.base_price)
            setCurrentBidder(null)
            setBidHistory([])
            resetTimer()
          }
        }
      } else {
        setCurrentPlayer(null)
        setCurrentBid(0)
        setCurrentBidder(null)
        setBidHistory([])
      }
    } catch (e) {
      console.error('loadAll error:', e)
    }
  }

  function setupChannel(leagueId) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const ch = supabase.channel(`auc-${leagueId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'leagues',
        filter: `id=eq.${leagueId}`
      }, async (payload) => {
        const newActiveId = payload.new.active_player_id
        setActivePlayerId(newActiveId)
        if (!newActiveId) {
          setCurrentPlayer(null); setCurrentBid(0)
          setCurrentBidder(null); setBidHistory([])
          if (timerRef.current) clearInterval(timerRef.current)
          await loadAll(leagueId, null)
        } else {
          const { data: p } = await supabase.from('players').select('*').eq('id', newActiveId).single()
          if (p) {
            setCurrentPlayer(p); setCurrentBid(p.base_price)
            setCurrentBidder(null); setBidHistory([])
            resetTimer()
          }
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'auction_bids',
        filter: `league_id=eq.${leagueId}`
      }, async (payload) => {
        const bid = payload.new
        if (bid.bidder_id === profile.id) return
        try {
          const [{ data: bp }, { data: pp }] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', bid.bidder_id).single(),
            supabase.from('players').select('*').eq('id', bid.player_id).single()
          ])
          setCurrentBid(bid.amount)
          setCurrentBidder(bp)
          if (pp) setCurrentPlayer(pp)
          setBidHistory(prev => {
            if (prev[0]?.id === bid.id) return prev
            return [{ ...bid, profiles: bp, players: pp }, ...prev.slice(0, 7)]
          })
          resetTimer()
          loadMembers(leagueId)
        } catch (e) { console.error('bid realtime error:', e) }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'squad',
        filter: `league_id=eq.${leagueId}`
      }, () => loadAll(leagueId, null))
      .subscribe()
    channelRef.current = ch
  }

  function startPoll(leagueId) {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => pollBids(leagueId), 4000)
  }

  async function pollBids(leagueId) {
    try {
      const { data: lg } = await supabase
        .from('leagues').select('active_player_id')
        .eq('id', leagueId).single()
      const activeId = lg?.active_player_id
      if (!activeId) return

      const { data: bids } = await supabase
        .from('auction_bids').select('*, profiles(*), players(*)')
        .eq('league_id', leagueId)
        .eq('player_id', activeId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (!bids?.length) return
      const latest = bids[0]

      setCurrentBid(prev => {
        if (latest.amount > prev) {
          setCurrentBidder(latest.profiles)
          if (latest.players) setCurrentPlayer(latest.players)
          setBidHistory(prev2 => {
            if (prev2[0]?.id === latest.id) return prev2
            return [latest, ...prev2.slice(0, 7)]
          })
          resetTimer()
          loadMembers(leagueId)
          return latest.amount
        }
        return prev
      })
    } catch (e) { /* silent */ }
  }

  async function loadMembers(leagueId) {
    const { data } = await supabase
      .from('league_members').select('*, profiles(*)')
      .eq('league_id', leagueId)
    if (data) {
      setMembers(data)
      const myMem = data.find(m => m.user_id === profile.id)
      if (myMem) { setMember(myMem); memberRef.current = myMem }
    }
  }

  function resetTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimer(30)
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) { clearInterval(timerRef.current); return 0 }
        return t - 1
      })
    }, 1000)
  }

  async function placeBid(amount) {
    if (!currentPlayer || bidding) return
    if (!member || member.purse_remaining < amount) {
      alert(`Not enough purse! You have ₹${member?.purse_remaining} Cr left.`)
      return
    }
    if (amount <= currentBid) {
      alert(`Bid must be more than ₹${currentBid} Cr`)
      return
    }
    if (currentBidder?.id === profile.id) {
      alert("You're already the highest bidder!")
      return
    }

    // Check 15 player limit
    const { data: mySquad } = await supabase.from('squad').select('id')
      .eq('league_id', league.id).eq('user_id', profile.id)
    if (mySquad?.length >= 15) {
      alert('Squad full! You already have 15 players — maximum limit reached.')
      return
    }

    // Optimistic update
    const prev = { bid: currentBid, bidder: currentBidder }
    setCurrentBid(amount)
    setCurrentBidder({ id: profile.id, name: profile.name })
    setBidHistory(h => [{
      amount, bidder_id: profile.id,
      profiles: { name: profile.name }, id: Date.now()
    }, ...h.slice(0, 7)])
    resetTimer()
    setBidding(true)

    const { error } = await supabase.from('auction_bids').insert({
      league_id: league.id,
      player_id: currentPlayer.id,
      bidder_id: profile.id,
      amount
    })

    if (error) {
      setCurrentBid(prev.bid)
      setCurrentBidder(prev.bidder)
      alert('Bid failed: ' + error.message)
    }
    setBidding(false)
  }

  async function clearActive() {
    if (!league) return
    await supabase.from('leagues').update({ active_player_id: null }).eq('id', league.id)
    setCurrentPlayer(null); setCurrentBid(0); setCurrentBidder(null)
    setBidHistory([]); setActivePlayerId(null)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  async function sellPlayer() {
    if (!currentPlayer || !currentBidder || !member?.is_admin) return
    const { data: check } = await supabase.from('squad').select('id')
      .eq('player_id', currentPlayer.id).eq('league_id', league.id).maybeSingle()
    if (check) { setSoldMsg('Already sold!'); await clearActive(); return }

    await supabase.from('squad').insert({
      league_id: league.id, user_id: currentBidder.id,
      player_id: currentPlayer.id, bought_price: currentBid
    })
    const { data: wm } = await supabase.from('league_members').select('purse_remaining')
      .eq('league_id', league.id).eq('user_id', currentBidder.id).single()
    if (wm) {
      await supabase.from('league_members').update({
        purse_remaining: Math.max(0, wm.purse_remaining - currentBid)
      }).eq('league_id', league.id).eq('user_id', currentBidder.id)
    }
    setSoldMsg(`🔨 ${currentPlayer.name} SOLD to ${currentBidder.name?.split(' ')[0]} for ₹${currentBid} Cr!`)
    setTimeout(() => setSoldMsg(''), 5000)
    await clearActive()
    await loadAll(league.id, null)
  }

  async function markUnsold() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Mark ${currentPlayer.name} as unsold?`)) return
    await supabase.from('players').update({ is_unsold: true }).eq('id', currentPlayer.id)
    setSoldMsg(`${currentPlayer.name} marked unsold.`)
    setTimeout(() => setSoldMsg(''), 3000)
    await clearActive()
    await loadAll(league.id, null)
  }

  async function removeFromAuction() {
    if (!currentPlayer || !member?.is_admin) return
    if (!confirm(`Remove ${currentPlayer.name} from auction?`)) return
    setSoldMsg(`${currentPlayer.name} removed.`)
    setTimeout(() => setSoldMsg(''), 3000)
    await clearActive()
    await loadAll(league.id, null)
  }

  async function reAuction(player) {
    if (!member?.is_admin) return
    await supabase.from('players').update({ is_unsold: false }).eq('id', player.id)
    setSoldMsg(`${player.name} back to available!`)
    setTimeout(() => setSoldMsg(''), 3000)
    await loadAll(league.id, activePlayerId)
  }

  async function startBidding(player) {
    if (!member?.is_admin) return
    const { data: check } = await supabase.from('squad').select('id')
      .eq('player_id', player.id).eq('league_id', league.id).maybeSingle()
    if (check) { alert('Already sold!'); return }

    setCurrentPlayer(player); setCurrentBid(player.base_price)
    setCurrentBidder(null); setBidHistory([])
    setActivePlayerId(player.id)
    resetTimer()

    await supabase.from('leagues').update({ active_player_id: player.id }).eq('id', league.id)
    await supabase.from('auction_bids').insert({
      league_id: league.id, player_id: player.id,
      bidder_id: profile.id, amount: player.base_price
    })
  }

  const filtered = players.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.team.toLowerCase().includes(search.toLowerCase())
  )
  const isMyBid = currentBidder?.id === profile.id
  const timerPct = (timer / 30) * 100
  const timerColor = timer < 8 ? 'var(--red)' : timer < 15 ? 'var(--gold)' : 'var(--teal)'

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading auction...</div>
    </div>
  )

  if (!league) return (
    <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🏟️</div>
      <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, marginBottom:8 }}>Join a league first</div>
      <a href="/" style={{ color:'var(--gold)', fontSize:14 }}>Go to Dashboard →</a>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Live Bidding</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(22px,5vw,34px)', fontWeight:700, marginBottom:3 }}>Auction Room</h1>
          <div style={{ color:'var(--text2)', fontSize:13 }}>{players.length} available · {unsoldPlayers.length} unsold</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,71,87,0.1)', border:'1px solid rgba(255,71,87,0.2)', borderRadius:20, padding:'6px 12px' }}>
            <div className="live-dot" />
            <span style={{ fontSize:11, fontWeight:700, color:'var(--red)' }}>LIVE</span>
          </div>
          <div style={{ padding:'6px 14px', background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:20 }}>
            <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px' }}>Purse</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:member?.purse_remaining < 20 ? 'var(--red)' : member?.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)', lineHeight:1.1 }}>
              ₹{member?.purse_remaining}Cr
            </div>
          </div>
        </div>
      </div>

      {/* Sold message */}
      {soldMsg && (
        <div style={{ padding:'14px 18px', background:'rgba(0,212,170,0.08)', border:'1px solid rgba(0,212,170,0.2)', borderRadius:12, marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>🎉</span>
          <span style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--teal)' }}>{soldMsg}</span>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:14 }}>

        {/* Current player card */}
        {currentPlayer ? (
          <div style={{ background:'linear-gradient(135deg, #0E1B2E, #13203A)', border:`1px solid ${isMyBid?'rgba(0,212,170,0.3)':'rgba(240,165,0,0.15)'}`, borderRadius:18, padding:'20px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:-30, right:-30, width:150, height:150, borderRadius:'50%', background:`radial-gradient(circle, ${isMyBid?'rgba(0,212,170,0.07)':'rgba(240,165,0,0.05)'} 0%, transparent 70%)`, pointerEvents:'none' }} />

            {isMyBid && (
              <div style={{ position:'absolute', top:14, right:14, display:'flex', alignItems:'center', gap:5, background:'rgba(0,212,170,0.12)', border:'1px solid rgba(0,212,170,0.25)', borderRadius:20, padding:'3px 10px' }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--teal)' }} />
                <span style={{ fontSize:10, fontWeight:700, color:'var(--teal)' }}>LEADING</span>
              </div>
            )}

            <div style={{ display:'flex', gap:16, alignItems:'flex-start', flexWrap:'wrap' }}>
              <div style={{ width:72, height:72, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Rajdhani', fontSize:24, fontWeight:700, flexShrink:0, background:ROLE_BG[currentPlayer.role], color:ROLE_TEXT[currentPlayer.role], border:`1px solid ${ROLE_TEXT[currentPlayer.role]}33` }}>
                {currentPlayer.image_initials || currentPlayer.name.slice(0,2)}
              </div>

              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontFamily:'Rajdhani', fontSize:'clamp(20px,4vw,28px)', fontWeight:700, color:'var(--text)', marginBottom:6 }}>{currentPlayer.name}</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12, flexWrap:'wrap' }}>
                  <span className={`badge badge-${ROLE_CLASS[currentPlayer.role]}`}>{currentPlayer.role}</span>
                  <span style={{ fontSize:13, color:'var(--text2)', fontWeight:500 }}>{currentPlayer.team}</span>
                  <span style={{ fontSize:11, color:'var(--text3)', padding:'2px 7px', background:'var(--navy4)', borderRadius:5 }}>Base ₹{currentPlayer.base_price}Cr</span>
                </div>
                <div style={{ display:'flex', gap:0, background:'var(--navy3)', borderRadius:9, overflow:'hidden', border:'1px solid var(--border)', width:'fit-content' }}>
                  {[
                    currentPlayer.runs > 0 && { l:'Runs', v:currentPlayer.runs },
                    currentPlayer.wickets > 0 && { l:'Wkts', v:currentPlayer.wickets },
                    currentPlayer.strike_rate && { l:'SR', v:currentPlayer.strike_rate },
                    currentPlayer.economy && { l:'Econ', v:currentPlayer.economy },
                  ].filter(Boolean).slice(0,4).map((s, i, arr) => (
                    <div key={s.l} style={{ padding:'6px 12px', textAlign:'center', borderRight:i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                      <div style={{ fontFamily:'Rajdhani', fontSize:17, fontWeight:700 }}>{s.v}</div>
                      <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Current Bid</div>
                <div style={{ fontFamily:'Rajdhani', fontSize:'clamp(32px,6vw,44px)', fontWeight:700, color:'var(--gold)', lineHeight:1 }}>₹{currentBid}</div>
                <div style={{ fontFamily:'Rajdhani', fontSize:16, color:'var(--gold)', opacity:0.6 }}>Crore</div>
                <div style={{ fontSize:12, color:isMyBid?'var(--teal)':'var(--text3)', marginTop:6, fontWeight:isMyBid?600:400 }}>
                  {currentBidder ? `by ${currentBidder.name?.split(' ')[0]}` : 'Opening'}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background:'var(--navy2)', border:`2px dashed ${member?.is_admin?'rgba(240,165,0,0.2)':'var(--border)'}`, borderRadius:18, padding:40, textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:12 }}>🔨</div>
            <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:'var(--text2)', marginBottom:6 }}>
              {member?.is_admin ? 'Select a player to start' : 'Waiting for auction to start...'}
            </div>
            <div style={{ fontSize:13, color:'var(--text3)' }}>
              {member?.is_admin ? 'Click any player below' : 'Admin will start bidding soon'}
            </div>
          </div>
        )}

        {/* Timer + Bid buttons */}
        {currentPlayer && (
          <div>
            <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:12, padding:'11px 16px', marginBottom:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:12, color:'var(--text2)' }}>Time remaining</span>
                <span style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, color:timerColor }}>{timer}s</span>
              </div>
              <div style={{ background:'var(--navy4)', borderRadius:20, height:6, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:20, background:timerColor, width:`${timerPct}%`, transition:'width 1s linear, background 0.3s' }} />
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:8 }}>
              {[{ inc:1,label:'Quick' },{ inc:2,label:'Raise' },{ inc:5,label:'Power' }].map(({ inc, label }) => {
                const amt = currentBid + inc
                const canBid = member?.purse_remaining >= amt && !isMyBid && !bidding
                return (
                  <button key={inc} onClick={() => placeBid(amt)} disabled={!canBid}
                    style={{ padding:'12px 8px', borderRadius:12, fontSize:12, fontWeight:600, border:`1px solid ${canBid?'rgba(240,165,0,0.25)':'var(--border)'}`, cursor:canBid?'pointer':'not-allowed', transition:'all 0.15s', background:canBid?'rgba(240,165,0,0.07)':'var(--navy3)', opacity:canBid?1:0.4 }}
                    onMouseEnter={e => { if(canBid){ e.currentTarget.style.background='rgba(240,165,0,0.14)'; e.currentTarget.style.transform='translateY(-1px)' } }}
                    onMouseLeave={e => { e.currentTarget.style.background=canBid?'rgba(240,165,0,0.07)':'var(--navy3)'; e.currentTarget.style.transform='translateY(0)' }}>
                    <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', marginBottom:3 }}>{label} +₹{inc}Cr</div>
                    <div style={{ fontFamily:'Rajdhani', fontSize:20, fontWeight:700, color:canBid?'var(--gold)':'var(--text3)' }}>₹{amt}Cr</div>
                  </button>
                )
              })}
            </div>

            {isMyBid && (
              <div style={{ padding:'9px 14px', background:'rgba(0,212,170,0.06)', border:'1px solid rgba(0,212,170,0.18)', borderRadius:10, marginBottom:8, fontSize:13, color:'var(--teal)', fontWeight:600 }}>
                ✅ You're leading at ₹{currentBid} Cr — waiting for others...
              </div>
            )}

            {member?.is_admin && currentBidder && timer === 0 && (
              <button className="btn btn-primary" style={{ width:'100%', marginBottom:8, padding:15, fontSize:17, fontFamily:'Rajdhani', fontWeight:700, borderRadius:12 }} onClick={sellPlayer}>
                🔨 SOLD! {currentPlayer.name} → {currentBidder.name?.split(' ')[0]} for ₹{currentBid}Cr
              </button>
            )}
            {member?.is_admin && currentBidder && timer > 0 && (
              <button className="btn btn-teal" style={{ width:'100%', marginBottom:8, padding:12, borderRadius:12, fontWeight:600 }} onClick={sellPlayer}>
                ✓ Confirm Sale — ₹{currentBid}Cr to {currentBidder.name?.split(' ')[0]}
              </button>
            )}
            {member?.is_admin && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <button className="btn btn-danger" style={{ borderRadius:10, padding:11 }} onClick={markUnsold}>🔴 Unsold</button>
                <button className="btn btn-ghost" style={{ borderRadius:10, padding:11 }} onClick={removeFromAuction}>✕ Remove</button>
              </div>
            )}
          </div>
        )}

        {/* Two column layout */}
        <div style={{ display:'grid', gridTemplateColumns: window.innerWidth > 768 ? '1fr 280px' : '1fr', gap:14 }}>

          {/* Admin player list */}
          {member?.is_admin && (
            <div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, gap:8 }}>
                <h3 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700 }}>
                  Available <span style={{ color:'var(--text3)', fontWeight:400, fontSize:14 }}>({filtered.length})</span>
                </h3>
                <input className="input" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} style={{ width:160, padding:'6px 10px', fontSize:12 }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:7, maxHeight:400, overflowY:'auto' }} className="no-scroll">
                {filtered.map(p => (
                  <div key={p.id} onClick={() => startBidding(p)}
                    style={{ background:currentPlayer?.id===p.id?'rgba(240,165,0,0.08)':'var(--navy2)', border:`1px solid ${currentPlayer?.id===p.id?'rgba(240,165,0,0.35)':'var(--border)'}`, borderRadius:10, padding:'9px 12px', cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:9 }}
                    onMouseEnter={e => { if(currentPlayer?.id!==p.id){ e.currentTarget.style.background='var(--navy3)'; e.currentTarget.style.borderColor='rgba(240,165,0,0.2)' } }}
                    onMouseLeave={e => { if(currentPlayer?.id!==p.id){ e.currentTarget.style.background='var(--navy2)'; e.currentTarget.style.borderColor='var(--border)' } }}>
                    <div style={{ width:34, height:34, borderRadius:8, background:ROLE_BG[p.role], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:ROLE_TEXT[p.role], flexShrink:0 }}>
                      {p.image_initials||p.name.slice(0,2)}
                    </div>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                      <div style={{ fontSize:10, color:'var(--text3)' }}>{p.team} · ₹{p.base_price}Cr</div>
                    </div>
                    {currentPlayer?.id===p.id && <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--gold)', flexShrink:0 }} />}
                  </div>
                ))}
              </div>

              {unsoldPlayers.length > 0 && (
                <div style={{ marginTop:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <h3 style={{ fontFamily:'Rajdhani', fontSize:16, fontWeight:700, color:'var(--red)' }}>
                      Unsold ({unsoldPlayers.length})
                    </h3>
                    <button className="btn btn-ghost" style={{ fontSize:11, padding:'3px 10px', borderRadius:7 }} onClick={() => setShowUnsold(!showUnsold)}>
                      {showUnsold?'Hide':'Show'}
                    </button>
                  </div>
                  {showUnsold && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:7 }}>
                      {unsoldPlayers.map(p => (
                        <div key={p.id} style={{ background:'rgba(255,71,87,0.04)', border:'1px solid rgba(255,71,87,0.15)', borderRadius:10, padding:'9px 12px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(255,71,87,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--red)', flexShrink:0 }}>
                              {p.image_initials||p.name.slice(0,2)}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                              <div style={{ fontSize:10, color:'var(--text3)' }}>{p.team}</div>
                            </div>
                          </div>
                          <button className="btn btn-teal" style={{ fontSize:10, padding:'3px 8px', flexShrink:0, borderRadius:7 }} onClick={() => reAuction(p)}>Re-bid</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sidebar */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {/* Purses */}
            <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, padding:16 }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:14 }}>Friend Purses</div>
              {members.sort((a,b) => b.purse_remaining - a.purse_remaining).map(m => {
                const pct = Math.round((m.purse_remaining/120)*100)
                const col = m.purse_remaining < 20 ? 'var(--red)' : m.purse_remaining < 40 ? 'var(--gold)' : 'var(--teal)'
                const isLeading = currentBidder?.id === m.user_id
                const isMe = m.user_id === profile?.id
                return (
                  <div key={m.id} style={{ marginBottom:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:26, height:26, borderRadius:'50%', background:'var(--navy4)', border:`1px solid ${isMe?'rgba(240,165,0,0.3)':'var(--border2)'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'var(--text2)', overflow:'hidden', flexShrink:0 }}>
                          {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                        </div>
                        <span style={{ fontSize:12, fontWeight:600, color:isMe?'var(--gold)':'var(--text)' }}>
                          {m.profiles?.name?.split(' ')[0]}
                        </span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <span style={{ fontSize:12, fontFamily:'Rajdhani', fontWeight:700, color:col }}>₹{m.purse_remaining}Cr</span>
                        {isLeading && <span style={{ fontSize:9, color:'var(--teal)', fontWeight:700, background:'var(--teal2)', padding:'1px 5px', borderRadius:4 }}>⬆</span>}
                      </div>
                    </div>
                    <div style={{ background:'var(--navy4)', borderRadius:20, height:4 }}>
                      <div style={{ height:'100%', borderRadius:20, width:`${pct}%`, background:col, transition:'width 0.5s' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Bid feed */}
            <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, padding:16 }}>
              <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:12 }}>Bid Feed</div>
              {bidHistory.length === 0 ? (
                <div style={{ textAlign:'center', padding:'16px 0', color:'var(--text3)', fontSize:13 }}>No bids yet</div>
              ) : bidHistory.map((b, i) => (
                <div key={b.id || i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'7px 10px', background:i===0?'rgba(240,165,0,0.05)':'transparent', borderRadius:8, border:i===0?'1px solid rgba(240,165,0,0.1)':'1px solid transparent' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:i===0?'rgba(240,165,0,0.15)':'var(--navy4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:i===0?'var(--gold)':'var(--text2)', flexShrink:0 }}>
                    {b.profiles?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:i===0?'var(--text)':'var(--text2)' }}>{b.profiles?.name?.split(' ')[0]}</div>
                    <div style={{ fontSize:9, color:'var(--text3)' }}>{i===0?'just now':`${i*12}s ago`}</div>
                  </div>
                  <div style={{ fontFamily:'Rajdhani', fontSize:17, fontWeight:700, color:i===0?'var(--gold)':'var(--text2)' }}>₹{b.amount}Cr</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}