const CRICAPI_KEY = 'ad9de024-29c6-4cda-9749-4784da6429a5'

export async function fetchCurrentMatches() {
  try {
    const res = await fetch(
      `https://api.cricapi.com/v1/currentMatches?apikey=${CRICAPI_KEY}&offset=0`
    )
    const data = await res.json()
    console.log('CricAPI response:', data)
    if (!data.data) return []

    const IPL_TEAMS = ['rcb','csk','mi','kkr','srh','rr','dc','pbks','gt','lsg',
      'mumbai','chennai','bangalore','bengaluru','kolkata','rajasthan',
      'delhi','punjab','hyderabad','gujarat','lucknow']

    return data.data.filter(m => {
      const name = (m.name || '').toLowerCase()
      const series = (m.series || '').toLowerCase()
      const matchType = (m.matchType || '').toLowerCase()

      // Check if IPL in name or series
      if (name.includes('ipl')) return true
      if (name.includes('indian premier league')) return true
      if (series.includes('ipl')) return true
      if (series.includes('indian premier league')) return true

      // Check if any IPL team name in match name
      if (IPL_TEAMS.some(t => name.includes(t))) return true

      // Check teams array
      const teams = (m.teams || []).join(' ').toLowerCase()
      if (IPL_TEAMS.some(t => teams.includes(t))) return true

      return false
    })
  } catch (e) {
    console.error('CricAPI fetchCurrentMatches error:', e)
    return []
  }
}

export async function fetchMatchScore(matchId) {
  try {
    const res = await fetch(
      `https://api.cricapi.com/v1/match_info?apikey=${CRICAPI_KEY}&id=${matchId}`
    )
    const data = await res.json()
    console.log('Match info:', data)
    if (!data.data) return null
    return data.data
  } catch (e) {
    console.error('CricAPI fetchMatchScore error:', e)
    return null
  }
}

export async function fetchMatchScorecard(matchId) {
  try {
    const res = await fetch(
      `https://api.cricapi.com/v1/match_scorecard?apikey=${CRICAPI_KEY}&id=${matchId}`
    )
    const data = await res.json()
    console.log('Scorecard:', data)
    if (!data.data) return null
    return data.data
  } catch (e) {
    console.error('CricAPI fetchMatchScorecard error:', e)
    return null
  }
}

export function parseScorecardToPerformances(scorecard) {
  const performances = []
  if (!scorecard?.scorecard) return performances

  for (const inning of scorecard.scorecard) {
    // Batting performances
    for (const batter of (inning.batting || [])) {
      if (!batter.batsman?.name) continue
      const existing = performances.find(p => p.playerName === batter.batsman.name)
      if (existing) {
        existing.runs = (existing.runs || 0) + (batter.r || 0)
        existing.balls = (existing.balls || 0) + (batter.b || 0)
        existing.fours = (existing.fours || 0) + (batter['4s'] || 0)
        existing.sixes = (existing.sixes || 0) + (batter['6s'] || 0)
      } else {
        performances.push({
          playerName: batter.batsman.name,
          runs: batter.r || 0,
          balls: batter.b || 0,
          fours: batter['4s'] || 0,
          sixes: batter['6s'] || 0,
          wickets: 0,
          overs: 0,
          maidens: 0,
          runsConceded: 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
          dismissalType: batter.dismissal || '',
        })
      }
    }

    // Bowling performances
    for (const bowler of (inning.bowling || [])) {
      if (!bowler.bowler?.name) continue
      const existing = performances.find(p => p.playerName === bowler.bowler.name)
      if (existing) {
        existing.wickets = (existing.wickets || 0) + (bowler.w || 0)
        existing.overs = (existing.overs || 0) + parseFloat(bowler.o || 0)
        existing.maidens = (existing.maidens || 0) + (bowler.m || 0)
        existing.runsConceded = (existing.runsConceded || 0) + (bowler.r || 0)
      } else {
        performances.push({
          playerName: bowler.bowler.name,
          runs: 0,
          balls: 0,
          fours: 0,
          sixes: 0,
          wickets: bowler.w || 0,
          overs: parseFloat(bowler.o || 0),
          maidens: bowler.m || 0,
          runsConceded: bowler.r || 0,
          catches: 0,
          stumpings: 0,
          runOuts: 0,
          dismissalType: '',
        })
      }
    }
  }

  return performances
}