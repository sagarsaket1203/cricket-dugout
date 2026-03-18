// Cricket Dugout — Fantasy Points Engine
// Fair, transparent, based on official IPL Fantasy scoring

export function calculateFantasyPoints(perf) {
  let points = 0
  const breakdown = []

  // --- BATTING ---
  if (perf.runs > 0) {
    points += perf.runs
    breakdown.push({ label: `${perf.runs} runs`, pts: perf.runs })
  }
  if (perf.fours > 0) {
    const bp = perf.fours * 1
    points += bp
    breakdown.push({ label: `${perf.fours} fours (boundary bonus)`, pts: bp })
  }
  if (perf.sixes > 0) {
    const sp = perf.sixes * 2
    points += sp
    breakdown.push({ label: `${perf.sixes} sixes`, pts: sp })
  }
  if (perf.runs >= 100) {
    points += 16
    breakdown.push({ label: 'Century bonus', pts: 16 })
  } else if (perf.runs >= 50) {
    points += 8
    breakdown.push({ label: 'Half-century bonus', pts: 8 })
  } else if (perf.runs >= 30) {
    points += 4
    breakdown.push({ label: '30+ runs bonus', pts: 4 })
  }
  if (perf.is_duck && perf.balls_faced > 0) {
    points -= 2
    breakdown.push({ label: 'Duck penalty', pts: -2 })
  }
  // Strike rate bonus/penalty (min 10 balls)
  if (perf.balls_faced >= 10) {
    const sr = (perf.runs / perf.balls_faced) * 100
    if (sr >= 170) { points += 6; breakdown.push({ label: 'SR 170+ bonus', pts: 6 }) }
    else if (sr >= 150) { points += 4; breakdown.push({ label: 'SR 150+ bonus', pts: 4 }) }
    else if (sr >= 130) { points += 2; breakdown.push({ label: 'SR 130+ bonus', pts: 2 }) }
    else if (sr < 50) { points -= 6; breakdown.push({ label: 'SR <50 penalty', pts: -6 }) }
    else if (sr < 60) { points -= 4; breakdown.push({ label: 'SR <60 penalty', pts: -4 }) }
    else if (sr < 70) { points -= 2; breakdown.push({ label: 'SR <70 penalty', pts: -2 }) }
  }

  // --- BOWLING ---
  if (perf.wickets > 0) {
    const wp = perf.wickets * 25
    points += wp
    breakdown.push({ label: `${perf.wickets} wickets`, pts: wp })
  }
  if (perf.is_lbw) { points += 8; breakdown.push({ label: 'LBW bonus', pts: 8 }) }
  if (perf.is_bowled) { points += 8; breakdown.push({ label: 'Bowled bonus', pts: 8 }) }
  if (perf.wickets >= 5) { points += 16; breakdown.push({ label: '5-wicket haul', pts: 16 }) }
  else if (perf.wickets >= 4) { points += 8; breakdown.push({ label: '4-wicket bonus', pts: 8 }) }
  else if (perf.wickets >= 3) { points += 4; breakdown.push({ label: '3-wicket bonus', pts: 4 }) }
  if (perf.maidens > 0) {
    const mp = perf.maidens * 12
    points += mp
    breakdown.push({ label: `${perf.maidens} maiden(s)`, pts: mp })
  }
  // Economy bonus/penalty (min 2 overs)
  if (perf.overs >= 2) {
    const eco = perf.economy
    if (eco <= 5) { points += 6; breakdown.push({ label: 'Economy ≤5 bonus', pts: 6 }) }
    else if (eco <= 6) { points += 4; breakdown.push({ label: 'Economy ≤6 bonus', pts: 4 }) }
    else if (eco <= 7) { points += 2; breakdown.push({ label: 'Economy ≤7 bonus', pts: 2 }) }
    else if (eco >= 12) { points -= 6; breakdown.push({ label: 'Economy 12+ penalty', pts: -6 }) }
    else if (eco >= 11) { points -= 4; breakdown.push({ label: 'Economy 11+ penalty', pts: -4 }) }
    else if (eco >= 10) { points -= 2; breakdown.push({ label: 'Economy 10+ penalty', pts: -2 }) }
  }

  // --- FIELDING ---
  if (perf.catches > 0) {
    const cp = perf.catches * 8
    points += cp
    breakdown.push({ label: `${perf.catches} catch(es)`, pts: cp })
  }
  if (perf.stumpings > 0) {
    const sp2 = perf.stumpings * 12
    points += sp2
    breakdown.push({ label: `${perf.stumpings} stumping(s)`, pts: sp2 })
  }
  if (perf.run_outs > 0) {
    const rp = perf.run_outs * 12
    points += rp
    breakdown.push({ label: `${perf.run_outs} run out(s)`, pts: rp })
  }

  return { points, breakdown }
}

export const POINTS_GUIDE = [
  { action: 'Run scored', pts: '+1' },
  { action: 'Boundary bonus (4)', pts: '+1' },
  { action: 'Six bonus', pts: '+2' },
  { action: '30 runs in innings', pts: '+4' },
  { action: 'Half century (50)', pts: '+8' },
  { action: 'Century (100)', pts: '+16' },
  { action: 'Duck (batsman)', pts: '-2' },
  { action: 'SR 170+ bonus', pts: '+6' },
  { action: 'SR <50 penalty', pts: '-6' },
  { action: 'Wicket taken', pts: '+25' },
  { action: 'LBW / Bowled bonus', pts: '+8' },
  { action: '3-wicket haul', pts: '+4' },
  { action: '4-wicket haul', pts: '+8' },
  { action: '5-wicket haul', pts: '+16' },
  { action: 'Maiden over', pts: '+12' },
  { action: 'Economy ≤5', pts: '+6' },
  { action: 'Economy 12+', pts: '-6' },
  { action: 'Catch', pts: '+8' },
  { action: 'Stumping', pts: '+12' },
  { action: 'Run out (direct)', pts: '+12' },
]
