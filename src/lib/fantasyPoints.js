// Cricket Dugout — Fantasy Points Engine
// Fair, transparent, based on your custom scoring

export function calculateFantasyPoints(perf) {
  let points = 0
  const breakdown = []

  // --- BATTING ---
  // 1. Run scored: +1
  if (perf.runs > 0) {
    points += perf.runs
    breakdown.push({ label: `${perf.runs} runs`, pts: perf.runs })
  }

  // 2. Boundary bonus (4): +1
  if (perf.fours > 0) {
    const bp = perf.fours * 1
    points += bp
    breakdown.push({ label: `${perf.fours} fours (boundary bonus)`, pts: bp })
  }

  // 3. Six bonus: +2
  if (perf.sixes > 0) {
    const sp = perf.sixes * 2
    points += sp
    breakdown.push({ label: `${perf.sixes} sixes`, pts: sp })
  }

  // 4. 30 runs in innings: +4
  // 5. Half century (50): +8
  // 6. Century (100): +16
  if (perf.runs >= 100) {
    points += 16
    breakdown.push({ label: 'Century (100) bonus', pts: 16 })
  } else if (perf.runs >= 50) {
    points += 8
    breakdown.push({ label: 'Half century (50) bonus', pts: 8 })
  } else if (perf.runs >= 30) {
    points += 4
    breakdown.push({ label: '30+ runs bonus', pts: 4 })
  }

  // 7. Duck (batsman): -2
  // Check if runs = 0 and was out (dismissalType is not "not out")
  if (perf.runs === 0 && perf.balls > 0) {
    const dismissed = perf.dismissalType && perf.dismissalType.toLowerCase() !== 'not out'
    if (dismissed) {
      points -= 2
      breakdown.push({ label: 'Duck penalty', pts: -2 })
    }
  }

  // 8. SR 170+ bonus: +6 (min 10 balls)
  // 9. SR <50 penalty: -6
  if (perf.balls >= 10) {
    const sr = (perf.runs / perf.balls) * 100
    if (sr >= 170) {
      points += 6
      breakdown.push({ label: 'SR 170+ bonus', pts: 6 })
    } else if (sr < 50) {
      points -= 6
      breakdown.push({ label: 'SR <50 penalty', pts: -6 })
    }
  }

  // --- BOWLING ---
  // 10. Wicket taken: +25
  if (perf.wickets > 0) {
    const wp = perf.wickets * 25
    points += wp
    breakdown.push({ label: `${perf.wickets} wickets`, pts: wp })
  }

  // 11. LBW / Bowled bonus: +8
  // This bonus is +8 per wicket that is LBW or Bowled
  // For now we'll add it once if dismissalType indicates LBW/Bowled
  if (perf.wickets > 0 && perf.dismissalType) {
    const isLbwOrBowled = perf.dismissalType.toLowerCase().includes('lbw') || 
                          perf.dismissalType.toLowerCase().includes('bowled')
    if (isLbwOrBowled) {
      points += 8
      breakdown.push({ label: 'LBW / Bowled bonus', pts: 8 })
    }
  }

  // 12. 3-wicket haul: +4
  // 13. 4-wicket haul: +8
  // 14. 5-wicket haul: +16
  if (perf.wickets >= 5) {
    points += 16
    breakdown.push({ label: '5-wicket haul bonus', pts: 16 })
  } else if (perf.wickets >= 4) {
    points += 8
    breakdown.push({ label: '4-wicket haul bonus', pts: 8 })
  } else if (perf.wickets >= 3) {
    points += 4
    breakdown.push({ label: '3-wicket haul bonus', pts: 4 })
  }

  // 15. Maiden over: +12
  if (perf.maidens > 0) {
    const mp = perf.maidens * 12
    points += mp
    breakdown.push({ label: `${perf.maidens} maiden(s)`, pts: mp })
  }

  // 16. Economy ≤5: +6 (min 1 over)
  // 17. Economy 12+: -6
  if (perf.overs >= 1 && perf.runsConceded !== undefined) {
    const economy = perf.runsConceded / perf.overs
    if (economy <= 5) {
      points += 6
      breakdown.push({ label: 'Economy ≤5 bonus', pts: 6 })
    } else if (economy >= 12) {
      points -= 6
      breakdown.push({ label: 'Economy 12+ penalty', pts: -6 })
    }
  }

  // --- FIELDING ---
  // 18. Catch: +8
  if (perf.catches > 0) {
    const cp = perf.catches * 8
    points += cp
    breakdown.push({ label: `${perf.catches} catch(es)`, pts: cp })
  }

  // 19. Stumping: +12
  if (perf.stumpings > 0) {
    const stp = perf.stumpings * 12
    points += stp
    breakdown.push({ label: `${perf.stumpings} stumping(s)`, pts: stp })
  }

  // 20. Run out (direct): +12
  if (perf.runOuts > 0) {
    const rop = perf.runOuts * 12
    points += rop
    breakdown.push({ label: `${perf.runOuts} run out(s)`, pts: rop })
  }

  return { points: Math.round(points), breakdown }
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
  { action: 'Run out (direct)', pts: '+12' }
]