export function getSelectedLeagueId() {
  return localStorage.getItem('selectedLeagueId')
}

export function setSelectedLeagueId(id) {
  localStorage.setItem('selectedLeagueId', id)
}