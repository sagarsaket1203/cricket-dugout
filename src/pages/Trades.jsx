import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.1)','Bowler':'rgba(0,212,170,0.1)','All-Rounder':'rgba(255,71,87,0.1)','WK-Batsman':'rgba(75,159,255,0.1)' }
const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }

export default function Trades() {
  const { profile } = useAuth()
  const [league, setLeague] = useState(null)
  const [member, setMember] = useState(null)
  const [members, setMembers] = useState([])
  const [mySquad, setMySquad] = useState([])
  const [theirSquad, setTheirSquad] = useState([])
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState('success')

  // Trade form
  const [selectedFriend, setSelectedFriend] = useState(null)
  const [myPlayer, setMyPlayer] = useState(null)
  const [theirPlayer, setTheirPlayer] = useState(null)
  const [cashFromMe, setCashFromMe] = useState(0)
  const [cashFromThem, setCashFromThem] = useState(0)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => { if (profile) load() }, [profile])

  async function load() {
    setLoading(true)
    try {
      const { data: mem } = await supabase
        .from('league_members').select('*, leagues(*)')
        .eq('user_id', profile.id).single()
      if (!mem) { setLoading(false); return }
      setLeague(mem.leagues)
      setMember(mem)

      const { data: allMem } = await supabase
        .from('league_members').select('*, profiles(*)')
        .eq('league_id', mem.league_id)
      setMembers(allMem || [])

      const { data: squad } = await supabase
        .from('squad').select('*, players(*)')
        .eq('league_id', mem.league_id)
        .eq('user_id', profile.id)
        .order('bought_price', { ascending: false })
      setMySquad(squad || [])

      const { data: allTrades } = await supabase
        .from('trade_requests').select('*')
        .eq('league_id', mem.league_id)
        .order('created_at', { ascending: false })
      // Load player and profile info for trades
      const enriched = await Promise.all((allTrades || []).map(async t => {
        const [{ data: fp }, { data: tp }, { data: fpl }, { data: tpl }, { data: fu }, { data: tu }] = await Promise.all([
          t.from_player_id ? supabase.from('players').select('*').eq('id', t.from_player_id).single() : { data: null },
          t.to_player_id ? supabase.from('players').select('*').eq('id', t.to_player_id).single() : { data: null },
          supabase.from('players').select('*').eq('id', t.from_player_id).single(),
          t.to_player_id ? supabase.from('players').select('*').eq('id', t.to_player_id).single() : { data: null },
          supabase.from('profiles').select('*').eq('id', t.from_user_id).single(),
          supabase.from('profiles').select('*').eq('id', t.to_user_id).single(),
        ])
        return { ...t, from_player: fp, to_player: tp, from_user: fu, to_user: tu }
      }))
      setTrades(enriched)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function loadTheirSquad(userId) {
    const { data } = await supabase
      .from('squad').select('*, players(*)')
      .eq('league_id', league.id)
      .eq('user_id', userId)
      .order('bought_price', { ascending: false })
    setTheirSquad(data || [])
  }

  async function selectFriend(m) {
    setSelectedFriend(m)
    setMyPlayer(null)
    setTheirPlayer(null)
    setCashFromMe(0)
    setCashFromThem(0)
    await loadTheirSquad(m.user_id)
  }

  async function sendTrade() {
    if (!selectedFriend) { showMsg('Select a friend first!', 'error'); return }
    if (!myPlayer && !theirPlayer && cashFromMe === 0 && cashFromThem === 0) {
      showMsg('Add at least one player or cash to trade!', 'error'); return
    }
    if (cashFromMe > 0 && cashFromMe > member.purse_remaining) {
      showMsg(`You only have ₹${member.purse_remaining}Cr!`, 'error'); return
    }
    if (cashFromThem > 0 && cashFromThem > (members.find(m => m.user_id === selectedFriend.user_id)?.purse_remaining || 0)) {
      showMsg(`Friend doesn't have enough purse!`, 'error'); return
    }

    setSending(true)
    const { error } = await supabase.from('trade_requests').insert({
      league_id: league.id,
      from_user_id: profile.id,
      to_user_id: selectedFriend.user_id,
      from_player_id: myPlayer?.player_id || null,
      to_player_id: theirPlayer?.player_id || null,
      cash_from: cashFromMe,
      cash_to: cashFromThem,
      status: 'pending'
    })

    if (error) {
      showMsg('Error: ' + error.message, 'error')
    } else {
      showMsg('Trade request sent! Waiting for friend to accept.', 'success')
      setShowForm(false)
      setSelectedFriend(null)
      setMyPlayer(null)
      setTheirPlayer(null)
      setCashFromMe(0)
      setCashFromThem(0)
      load()
    }
    setSending(false)
  }

  async function respondTrade(trade, accept) {
    if (!accept) {
      await supabase.from('trade_requests').update({ status: 'rejected', resolved_at: new Date() }).eq('id', trade.id)
      showMsg('Trade rejected.', 'error')
      load(); return
    }
    await supabase.from('trade_requests').update({ status: 'accepted', resolved_at: new Date() }).eq('id', trade.id)
    showMsg('Trade accepted! Waiting for admin approval.', 'success')
    load()
  }

  function showMsg(text, type = 'success') {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  const myTrades = trades.filter(t => t.from_user_id === profile?.id || t.to_user_id === profile?.id)
  const pendingForMe = myTrades.filter(t => t.to_user_id === profile?.id && t.status === 'pending')
  const sentByMe = myTrades.filter(t => t.from_user_id === profile?.id && t.status === 'pending')
  const accepted = myTrades.filter(t => t.status === 'accepted')
  const completed = myTrades.filter(t => t.status === 'admin_approved')
  const rejected = myTrades.filter(t => t.status === 'rejected' || t.status === 'admin_rejected')

  const statusColor = { pending:'var(--gold)', accepted:'var(--teal)', rejected:'var(--red)', admin_approved:'var(--teal)', admin_rejected:'var(--red)' }
  const statusLabel = { pending:'Pending', accepted:'Awaiting Admin', rejected:'Rejected', admin_approved:'✅ Completed', admin_rejected:'❌ Admin Rejected' }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, border:'3px solid var(--border)', borderTop:'3px solid var(--gold)', borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      <div style={{ color:'var(--text2)', fontSize:14 }}>Loading trades...</div>
    </div>
  )

  if (!league) return (
    <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>
      <div style={{ fontSize:48, marginBottom:12 }}>🔄</div>
      <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700 }}>Join a league first</div>
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="fade-up" style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:4 }}>Player Exchange</div>
          <h1 style={{ fontFamily:'Rajdhani', fontSize:'clamp(24px,5vw,36px)', fontWeight:700, marginBottom:4 }}>Trade Room</h1>
          <div style={{ color:'var(--text2)', fontSize:13 }}>Propose player swaps or cash deals with friends</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ padding:'10px 20px' }}>
          {showForm ? '✕ Cancel' : '+ New Trade'}
        </button>
      </div>

      {/* Message */}
      {msg && (
        <div style={{ padding:'12px 16px', background:msgType==='error'?'var(--red2)':'var(--teal2)', border:`1px solid ${msgType==='error'?'rgba(255,71,87,0.3)':'rgba(0,212,170,0.3)'}`, borderRadius:10, marginBottom:14, color:msgType==='error'?'var(--red)':'var(--teal)', fontSize:13, fontWeight:500 }}>
          {msg}
        </div>
      )}

      {/* Pending trades for me */}
      {pendingForMe.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <div className="live-dot" />
            <h2 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, color:'var(--gold)' }}>
              Incoming Trades ({pendingForMe.length})
            </h2>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {pendingForMe.map(t => (
              <TradeCard key={t.id} trade={t} profile={profile} members={members} onRespond={respondTrade} showActions={true} />
            ))}
          </div>
        </div>
      )}

      {/* New Trade Form */}
      {showForm && (
        <div className="fade-in" style={{ background:'var(--navy2)', border:'1px solid var(--border2)', borderRadius:18, padding:24, marginBottom:24 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, marginBottom:20 }}>Propose a Trade</h2>

          {/* Step 1 - Select Friend */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:10 }}>Step 1 — Select Friend</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {members.filter(m => m.user_id !== profile?.id).map(m => (
                <div key={m.user_id} onClick={() => selectFriend(m)}
                  style={{ padding:'8px 14px', borderRadius:10, cursor:'pointer', border:`1px solid ${selectedFriend?.user_id===m.user_id?'rgba(240,165,0,0.4)':'var(--border)'}`, background:selectedFriend?.user_id===m.user_id?'rgba(240,165,0,0.1)':'var(--navy3)', display:'flex', alignItems:'center', gap:8, transition:'all 0.15s' }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--navy4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, overflow:'hidden' }}>
                    {m.profiles?.avatar_url ? <img src={m.profiles.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : m.profiles?.name?.slice(0,2).toUpperCase()}
                  </div>
                  <span style={{ fontSize:13, fontWeight:600, color:selectedFriend?.user_id===m.user_id?'var(--gold)':'var(--text)' }}>{m.profiles?.name?.split(' ')[0]}</span>
                  <span style={{ fontSize:11, color:'var(--teal)' }}>₹{m.purse_remaining}Cr</span>
                </div>
              ))}
            </div>
          </div>

          {selectedFriend && (
            <>
              {/* Trade Builder */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:16, alignItems:'start', marginBottom:20 }}>

                {/* My side */}
                <div>
                  <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:10 }}>
                    You Give
                  </div>
                  {/* My player */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Player (optional)</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:6, maxHeight:200, overflowY:'auto' }} className="no-scroll">
                      <div onClick={() => setMyPlayer(null)}
                        style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', border:`1px solid ${!myPlayer?'rgba(240,165,0,0.4)':'var(--border)'}`, background:!myPlayer?'rgba(240,165,0,0.08)':'var(--navy3)', fontSize:12, color:!myPlayer?'var(--gold)':'var(--text3)', textAlign:'center' }}>
                        None
                      </div>
                      {mySquad.map(s => (
                        <div key={s.id} onClick={() => setMyPlayer(s)}
                          style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', border:`1px solid ${myPlayer?.id===s.id?'rgba(240,165,0,0.4)':'var(--border)'}`, background:myPlayer?.id===s.id?'rgba(240,165,0,0.08)':'var(--navy3)', transition:'all 0.15s' }}>
                          <div style={{ fontSize:11, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.players?.name}</div>
                          <div style={{ fontSize:10, color:'var(--text3)' }}>{s.players?.team} · ₹{s.bought_price}Cr</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Cash from me */}
                  <div>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Cash (optional)</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="number" min={0} max={member?.purse_remaining||120} value={cashFromMe}
                        onChange={e => setCashFromMe(Math.max(0, Math.min(member?.purse_remaining||120, parseInt(e.target.value)||0)))}
                        className="input" style={{ width:80, padding:'7px 10px', fontSize:14, textAlign:'center', fontFamily:'Rajdhani', fontWeight:700 }} />
                      <span style={{ fontSize:13, color:'var(--text3)' }}>Cr (max ₹{member?.purse_remaining}Cr)</span>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', paddingTop:32, gap:8 }}>
                  <div style={{ fontSize:28, color:'var(--gold)' }}>⇄</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>trade</div>
                </div>

                {/* Their side */}
                <div>
                  <div style={{ fontSize:11, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'1px', fontWeight:600, marginBottom:10 }}>
                    You Get
                  </div>
                  {/* Their player */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Player (optional)</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:6, maxHeight:200, overflowY:'auto' }} className="no-scroll">
                      <div onClick={() => setTheirPlayer(null)}
                        style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', border:`1px solid ${!theirPlayer?'rgba(0,212,170,0.4)':'var(--border)'}`, background:!theirPlayer?'rgba(0,212,170,0.08)':'var(--navy3)', fontSize:12, color:!theirPlayer?'var(--teal)':'var(--text3)', textAlign:'center' }}>
                        None
                      </div>
                      {theirSquad.map(s => (
                        <div key={s.id} onClick={() => setTheirPlayer(s)}
                          style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', border:`1px solid ${theirPlayer?.id===s.id?'rgba(0,212,170,0.4)':'var(--border)'}`, background:theirPlayer?.id===s.id?'rgba(0,212,170,0.08)':'var(--navy3)', transition:'all 0.15s' }}>
                          <div style={{ fontSize:11, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.players?.name}</div>
                          <div style={{ fontSize:10, color:'var(--text3)' }}>{s.players?.team} · ₹{s.bought_price}Cr</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Cash from them */}
                  <div>
                    <div style={{ fontSize:12, color:'var(--text2)', marginBottom:6 }}>Cash (optional)</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="number" min={0} max={members.find(m => m.user_id===selectedFriend?.user_id)?.purse_remaining||120} value={cashFromThem}
                        onChange={e => setCashFromThem(Math.max(0, parseInt(e.target.value)||0))}
                        className="input" style={{ width:80, padding:'7px 10px', fontSize:14, textAlign:'center', fontFamily:'Rajdhani', fontWeight:700 }} />
                      <span style={{ fontSize:13, color:'var(--text3)' }}>Cr</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trade Summary */}
              <div style={{ padding:'12px 16px', background:'var(--navy3)', borderRadius:12, border:'1px solid var(--border)', marginBottom:16, fontSize:13, color:'var(--text2)' }}>
                <span style={{ fontWeight:600, color:'var(--text)' }}>Trade Summary: </span>
                You give {myPlayer ? <span style={{ color:'var(--gold)' }}>{myPlayer.players?.name}</span> : 'no player'}
                {cashFromMe > 0 && <span> + <span style={{ color:'var(--gold)' }}>₹{cashFromMe}Cr</span></span>}
                {' '}for{' '}
                {theirPlayer ? <span style={{ color:'var(--teal)' }}>{theirPlayer.players?.name}</span> : 'no player'}
                {cashFromThem > 0 && <span> + <span style={{ color:'var(--teal)' }}>₹{cashFromThem}Cr</span></span>}
                {' '}from <span style={{ color:'var(--text)' }}>{selectedFriend.profiles?.name?.split(' ')[0]}</span>
              </div>

              <button className="btn btn-primary" onClick={sendTrade} disabled={sending} style={{ padding:'12px 28px', fontSize:15 }}>
                {sending ? '⟳ Sending...' : '🔄 Send Trade Proposal'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Sent trades */}
      {sentByMe.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:12, color:'var(--text2)' }}>
            Sent ({sentByMe.length})
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {sentByMe.map(t => (
              <TradeCard key={t.id} trade={t} profile={profile} members={members} />
            ))}
          </div>
        </div>
      )}

      {/* Accepted trades */}
      {accepted.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:12, color:'var(--teal)' }}>
            Awaiting Admin Approval ({accepted.length})
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {accepted.map(t => (
              <TradeCard key={t.id} trade={t} profile={profile} members={members} />
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:12, color:'var(--teal)' }}>
            Completed ({completed.length})
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {completed.map(t => (
              <TradeCard key={t.id} trade={t} profile={profile} members={members} />
            ))}
          </div>
        </div>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontFamily:'Rajdhani', fontSize:18, fontWeight:700, marginBottom:12, color:'var(--red)' }}>
            Rejected ({rejected.length})
          </h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rejected.map(t => (
              <TradeCard key={t.id} trade={t} profile={profile} members={members} />
            ))}
          </div>
        </div>
      )}

      {myTrades.length === 0 && !showForm && (
        <div style={{ padding:48, textAlign:'center', background:'var(--navy2)', border:'2px dashed var(--border)', borderRadius:18, color:'var(--text3)' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🔄</div>
          <div style={{ fontFamily:'Rajdhani', fontSize:22, fontWeight:700, marginBottom:6 }}>No trades yet</div>
          <div style={{ fontSize:13, marginBottom:20 }}>Propose a trade with your friends!</div>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ New Trade</button>
        </div>
      )}
    </div>
  )
}

function TradeCard({ trade, profile, members, onRespond, showActions }) {
  const ROLE_BG = { 'Batsman':'rgba(240,165,0,0.1)','Bowler':'rgba(0,212,170,0.1)','All-Rounder':'rgba(255,71,87,0.1)','WK-Batsman':'rgba(75,159,255,0.1)' }
  const ROLE_TEXT = { 'Batsman':'var(--gold)','Bowler':'var(--teal)','All-Rounder':'var(--red)','WK-Batsman':'var(--blue)' }
  const statusColor = { pending:'var(--gold)', accepted:'var(--teal)', rejected:'var(--red)', admin_approved:'var(--teal)', admin_rejected:'var(--red)' }
  const statusLabel = { pending:'⏳ Pending', accepted:'⏳ Awaiting Admin', rejected:'❌ Rejected', admin_approved:'✅ Completed', admin_rejected:'❌ Admin Rejected' }
  const isFromMe = trade.from_user_id === profile?.id
  const fromName = members.find(m => m.user_id === trade.from_user_id)?.profiles?.name?.split(' ')[0] || 'Unknown'
  const toName = members.find(m => m.user_id === trade.to_user_id)?.profiles?.name?.split(' ')[0] || 'Unknown'

  return (
    <div style={{ background:'var(--navy2)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', transition:'all 0.2s' }}>
      <div style={{ padding:'12px 16px', background:'var(--navy3)', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid var(--border)', flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, fontWeight:600 }}>
          <span style={{ color:isFromMe?'var(--gold)':'var(--text)' }}>{fromName}</span>
          <span style={{ color:'var(--text3)', margin:'0 6px' }}>→</span>
          <span style={{ color:!isFromMe?'var(--teal)':'var(--text)' }}>{toName}</span>
        </div>
        <div style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:`${statusColor[trade.status]}22`, color:statusColor[trade.status], border:`1px solid ${statusColor[trade.status]}44` }}>
          {statusLabel[trade.status]}
        </div>
      </div>

      <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center' }}>
        {/* From player side */}
        <div>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>{fromName} gives</div>
          {trade.from_player ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:ROLE_BG[trade.from_player.role], borderRadius:8, border:`1px solid ${ROLE_TEXT[trade.from_player.role]}22` }}>
              <div style={{ width:32, height:32, borderRadius:7, background:ROLE_BG[trade.from_player.role], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:ROLE_TEXT[trade.from_player.role], flexShrink:0 }}>
                {trade.from_player.image_initials||trade.from_player.name?.slice(0,2)}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>{trade.from_player.name}</div>
                <div style={{ fontSize:10, color:'var(--text3)' }}>{trade.from_player.team}</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>No player</div>
          )}
          {trade.cash_from > 0 && (
            <div style={{ marginTop:6, fontSize:13, fontWeight:700, color:'var(--gold)', fontFamily:'Rajdhani' }}>+ ₹{trade.cash_from}Cr</div>
          )}
        </div>

        <div style={{ fontSize:24, color:'var(--text3)' }}>⇄</div>

        {/* To player side */}
        <div>
          <div style={{ fontSize:10, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:8 }}>{toName} gives</div>
          {trade.to_player ? (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 10px', background:ROLE_BG[trade.to_player.role], borderRadius:8, border:`1px solid ${ROLE_TEXT[trade.to_player.role]}22` }}>
              <div style={{ width:32, height:32, borderRadius:7, background:ROLE_BG[trade.to_player.role], display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:ROLE_TEXT[trade.to_player.role], flexShrink:0 }}>
                {trade.to_player.image_initials||trade.to_player.name?.slice(0,2)}
              </div>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>{trade.to_player.name}</div>
                <div style={{ fontSize:10, color:'var(--text3)' }}>{trade.to_player.team}</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize:12, color:'var(--text3)', fontStyle:'italic' }}>No player</div>
          )}
          {trade.cash_to > 0 && (
            <div style={{ marginTop:6, fontSize:13, fontWeight:700, color:'var(--teal)', fontFamily:'Rajdhani' }}>+ ₹{trade.cash_to}Cr</div>
          )}
        </div>
      </div>

      {/* Accept/Reject buttons */}
      {showActions && trade.status === 'pending' && (
        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:10 }}>
          <button className="btn btn-teal" style={{ flex:1, padding:10, borderRadius:10, fontWeight:600 }} onClick={() => onRespond(trade, true)}>
            ✓ Accept Trade
          </button>
          <button className="btn btn-danger" style={{ flex:1, padding:10, borderRadius:10 }} onClick={() => onRespond(trade, false)}>
            ✕ Reject
          </button>
        </div>
      )}
    </div>
  )
}