-- Ensure player_match_performances uniqueness is league-aware.
-- Previous unique key (match_id, player_id, user_id) caused cross-league overwrites.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_match_performances_match_id_player_id_user_id_key'
  ) THEN
    ALTER TABLE player_match_performances
      DROP CONSTRAINT player_match_performances_match_id_player_id_user_id_key;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'player_match_performances_match_id_player_id_user_id_league_id_key'
  ) THEN
    ALTER TABLE player_match_performances
      ADD CONSTRAINT player_match_performances_match_id_player_id_user_id_league_id_key
      UNIQUE (match_id, player_id, user_id, league_id);
  END IF;
END $$;
