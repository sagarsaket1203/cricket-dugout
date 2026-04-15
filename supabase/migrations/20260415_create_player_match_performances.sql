-- Create player_match_performances table
-- Stores individual player performances per match per user (squad owner)
-- One record per player per match per squad owner
CREATE TABLE IF NOT EXISTS player_match_performances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  runs INTEGER DEFAULT 0,
  balls_faced INTEGER DEFAULT 0,
  wickets INTEGER DEFAULT 0,
  catches INTEGER DEFAULT 0,
  stumpings INTEGER DEFAULT 0,
  run_outs INTEGER DEFAULT 0,
  maidens INTEGER DEFAULT 0,
  fours INTEGER DEFAULT 0,
  sixes INTEGER DEFAULT 0,
  economy NUMERIC DEFAULT NULL,
  is_duck BOOLEAN DEFAULT NULL,
  is_lbw BOOLEAN DEFAULT NULL,
  is_bowled BOOLEAN DEFAULT NULL,
  fantasy_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(match_id, player_id, user_id)
);

-- Indexes for efficient querying
-- Note: (match_id, player_id, user_id) index is already created by the UNIQUE constraint
CREATE INDEX IF NOT EXISTS idx_pmp_user_league ON player_match_performances(user_id, league_id);
CREATE INDEX IF NOT EXISTS idx_pmp_player ON player_match_performances(player_id);
