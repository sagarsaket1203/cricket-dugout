import { calculateFantasyPoints } from './fantasyPoints'

/**
 * Aggregates player performances across all matches for a given squad.
 * Returns an array of player stats sorted by total points (descending).
 *
 * @param {Array} performances - All performance records (from `performances` table with joined `players` data)
 * @param {Set} squadPlayerIds - Set of player IDs in the user's squad
 * @param {Object} playersMap - Map of player_id -> player object { id, name, role, team }
 * @returns {Array} Sorted array of { playerId, name, role, team, totalPoints, matchCount, avgPoints, matches }
 */
export function aggregatePlayerStats(performances, squadPlayerIds, playersMap) {
  const statsMap = {}

  for (const perf of performances) {
    if (!squadPlayerIds.has(perf.player_id)) continue

    const { points } = calculateFantasyPoints(perf)
    const player = playersMap[perf.player_id]
    if (!player) continue

    if (!statsMap[perf.player_id]) {
      statsMap[perf.player_id] = {
        playerId: perf.player_id,
        name: player.name,
        role: player.role,
        team: player.team,
        totalPoints: 0,
        matchCount: 0,
        matches: [],
      }
    }

    statsMap[perf.player_id].totalPoints += points
    statsMap[perf.player_id].matchCount += 1
    statsMap[perf.player_id].matches.push({
      matchId: perf.match_id,
      points,
    })
  }

  return Object.values(statsMap)
    .map(s => ({
      ...s,
      avgPoints: s.matchCount > 0 ? Math.round(s.totalPoints / s.matchCount) : 0,
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
}
