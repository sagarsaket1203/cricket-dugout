import { supabase } from './supabase'
import { calculateFantasyPoints } from './fantasyPoints'

/**
 * Backfill fantasy_points for all performances where fantasy_points is 0 or NULL.
 * Also recalculates match_points for all affected users/leagues.
 * Also populates player_match_performances table.
 *
 * @param {function} onProgress - Callback for progress updates: ({ phase, current, total, message })
 * @returns {{ updated: number, matchPointsRecalculated: number, playerMatchPerfsCreated: number }}
 */
export async function backfillFantasyPoints(onProgress) {
  const progress = onProgress || (() => {})

  // Phase 1: Fetch all performances
  progress({ phase: 'fetch', current: 0, total: 0, message: 'Fetching performances...' })
  const { data: allPerfs, error: perfErr } = await supabase
    .from('performances').select('*')
  if (perfErr) throw new Error('Failed to fetch performances: ' + perfErr.message)
  if (!allPerfs || allPerfs.length === 0) {
    return { updated: 0, matchPointsRecalculated: 0, playerMatchPerfsCreated: 0 }
  }

  // Phase 2: Recalculate and update fantasy_points for each performance
  let updated = 0
  const total = allPerfs.length
  const matchPlayerPoints = {} // matchId -> { playerId -> points }
  const matchPlayerPerfs = {} // matchId -> { playerId -> perf data }

  for (let i = 0; i < allPerfs.length; i++) {
    const perf = allPerfs[i]
    const { points } = calculateFantasyPoints(perf)

    if (perf.fantasy_points !== points) {
      const { error } = await supabase
        .from('performances')
        .update({ fantasy_points: points })
        .eq('match_id', perf.match_id)
        .eq('player_id', perf.player_id)
      if (!error) updated++
    }

    // Track points per match per player for match_points recalculation
    if (!matchPlayerPoints[perf.match_id]) matchPlayerPoints[perf.match_id] = {}
    matchPlayerPoints[perf.match_id][perf.player_id] = points

    // Track full perf data for player_match_performances backfill
    if (!matchPlayerPerfs[perf.match_id]) matchPlayerPerfs[perf.match_id] = {}
    matchPlayerPerfs[perf.match_id][perf.player_id] = { ...perf, fantasy_points: points }

    if ((i + 1) % 10 === 0 || i === allPerfs.length - 1) {
      progress({ phase: 'update', current: i + 1, total, message: `Updated ${i + 1}/${total} performances...` })
    }
  }

  // Phase 3: Recalculate match_points for all users/leagues
  progress({ phase: 'match_points', current: 0, total: 0, message: 'Recalculating match points...' })

  // Fetch all squads to know which user owns which player in which league
  const { data: squads } = await supabase.from('squad').select('user_id, league_id, player_id')
  if (!squads) {
    return { updated, matchPointsRecalculated: 0, playerMatchPerfsCreated: 0 }
  }

  // Build lookup: playerId -> [{ user_id, league_id }]
  const playerOwners = {}
  for (const sq of squads) {
    if (!playerOwners[sq.player_id]) playerOwners[sq.player_id] = []
    playerOwners[sq.player_id].push({ user_id: sq.user_id, league_id: sq.league_id })
  }

  // For each match, compute total points per user per league
  const matchIds = Object.keys(matchPlayerPoints)
  let mpRecalculated = 0
  let pmpCreated = 0

  for (let m = 0; m < matchIds.length; m++) {
    const matchId = matchIds[m]
    const playerPts = matchPlayerPoints[matchId]
    const playerPerfs = matchPlayerPerfs[matchId] || {}
    // userLeagueKey -> total points
    const userLeaguePoints = {}

    for (const [playerId, points] of Object.entries(playerPts)) {
      const owners = playerOwners[playerId] || []
      const perf = playerPerfs[playerId]

      for (const { user_id, league_id } of owners) {
        const key = `${user_id}|${league_id}`
        userLeaguePoints[key] = (userLeaguePoints[key] || 0) + points

        // Insert into player_match_performances
        if (perf) {
          const balls = perf.balls_faced ?? perf.balls ?? 0
          const runOuts = perf.run_outs ?? perf.runOuts ?? 0
          const dismissalType = perf.dismissal_type ?? perf.dismissalType ?? ''
          const runsConceded = perf.runs_conceded ?? perf.runsConceded ?? 0
          const overs = perf.overs ?? 0
          const isDuck = perf.runs === 0 && balls > 0 && dismissalType && dismissalType.toLowerCase() !== 'not out'
          const isLbw = dismissalType ? dismissalType.toLowerCase().includes('lbw') : false
          const isBowled = dismissalType ? dismissalType.toLowerCase().includes('bowled') : false
          const economy = overs > 0 ? runsConceded / overs : null

          const { error: pmpErr } = await supabase.from('player_match_performances').upsert({
            match_id: matchId,
            player_id: playerId,
            user_id,
            league_id,
            runs: perf.runs || 0,
            balls_faced: balls,
            wickets: perf.wickets || 0,
            catches: perf.catches || 0,
            stumpings: perf.stumpings || 0,
            run_outs: runOuts,
            maidens: perf.maidens || 0,
            fours: perf.fours || 0,
            sixes: perf.sixes || 0,
            economy,
            is_duck: isDuck,
            is_lbw: isLbw,
            is_bowled: isBowled,
            fantasy_points: points
          }, { onConflict: 'match_id,player_id,user_id,league_id' })
          if (!pmpErr) pmpCreated++
        }
      }
    }

    // Upsert match_points for each user/league combo
    for (const [key, totalPoints] of Object.entries(userLeaguePoints)) {
      const [userId, leagueId] = key.split('|')
      const { data: existing } = await supabase
        .from('match_points').select('id, total_points')
        .eq('match_id', matchId).eq('user_id', userId).eq('league_id', leagueId)
        .maybeSingle()

      if (existing) {
        if (existing.total_points !== totalPoints) {
          await supabase.from('match_points').update({ total_points: totalPoints }).eq('id', existing.id)
          mpRecalculated++
        }
      } else {
        await supabase.from('match_points').insert({
          match_id: matchId, user_id: userId, league_id: leagueId, total_points: totalPoints
        })
        mpRecalculated++
      }
    }

    progress({ phase: 'match_points', current: m + 1, total: matchIds.length, message: `Recalculated match points for ${m + 1}/${matchIds.length} matches...` })
  }

  return { updated, matchPointsRecalculated: mpRecalculated, playerMatchPerfsCreated: pmpCreated }
}
