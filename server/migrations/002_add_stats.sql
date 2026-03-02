CREATE TABLE IF NOT EXISTS match_players (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  player_id UUID REFERENCES players(id),
  seat INTEGER NOT NULL,
  final_score INTEGER DEFAULT 0,
  is_winner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);
CREATE INDEX IF NOT EXISTS idx_results_room ON results(room_id);

ALTER TABLE players ADD COLUMN IF NOT EXISTS games_played INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS wins INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_played TIMESTAMPTZ;
