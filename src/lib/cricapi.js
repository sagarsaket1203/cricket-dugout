const CRIC_API_KEY = 'ad9de024-29c6-4cda-9749-4784da6429a5'
const BASE_URL = 'https://api.cricapi.com/v1'

export async function fetchCurrentMatches() {
  try {
    const res = await fetch(`${BASE_URL}/currentMatches?apikey=${CRIC_API_KEY}&offset=0`)
    const data = await res.json()
    if (!data.data) return []
    return data.data.filter(m =>
      m.name?.toLowerCase().includes('ipl') ||
      m.name?.toLowerCase().includes('indian premier league') ||
      (m.teamInfo && m.teamInfo.some(t => isIPLTeam(t.name)))
    )
  } catch (e) { return [] }
}

export async function fetchMatchScore(matchId) {
  try {
    const res = await fetch(`${BASE_URL}/match_scorecard?apikey=${CRIC_API_KEY}&id=${matchId}`)
    const data = await res.json()
    return data.data || null
  } catch (e) { return null }
}

const IPL_TEAMS = ['mumbai indians','chennai super kings','royal challengers','kolkata knight riders','rajasthan royals','delhi capitals','punjab kings','sunrisers hyderabad','gujarat titans','lucknow super giants']

function isIPLTeam(name) {
  if (!name) return false
  return IPL_TEAMS.some(t => name.toLowerCase().includes(t))
}

export function parseScorecardToPerformances(scorecard) {
  const performances = []
  if (!scorecard?.scorecard) return performances
  scorecard.scorecard.forEach(innings => {
    innings.batting?.forEach(bat => {
      if (!bat.batsman?.name) return
      performances.push({
        playerName: bat.batsman.name,
        runs: parseInt(bat.r) || 0,
        balls_faced: parseInt(bat.b) || 0,
        fours: parseInt(bat['4s']) || 0,
        sixes: parseInt(bat['6s']) || 0,
        is_duck: (parseInt(bat.r) === 0 && parseInt(bat.b) > 0),
        wickets: 0, catches: 0, stumpings: 0, run_outs: 0,
        maidens: 0, economy: 0, overs: 0,
        is_lbw: bat.dismissal?.toLowerCase().includes('lbw') || false,
        is_bowled: bat.dismissal?.toLowerCase().includes('b ') || false,
      })
    })
    innings.bowling?.forEach(bowl => {
      if (!bowl.bowler?.name) return
      const existing = performances.find(p => p.playerName === bowl.bowler.name)
      const overs = parseFloat(bowl.o) || 0
      const economy = overs > 0 ? parseFloat(((parseInt(bowl.r)||0) / overs).toFixed(2)) : 0
      if (existing) {
        existing.wickets = parseInt(bowl.w) || 0
        existing.maidens = parseInt(bowl.m) || 0
        existing.economy = economy
        existing.overs = overs
      } else {
        performances.push({
          playerName: bowl.bowler.name,
          runs: 0, balls_faced: 0, fours: 0, sixes: 0, is_duck: false,
          wickets: parseInt(bowl.w) || 0,
          maidens: parseInt(bowl.m) || 0,
          economy, overs,
          catches: 0, stumpings: 0, run_outs: 0,
          is_lbw: false, is_bowled: false,
        })
      }
    })
  })
  return performances
}