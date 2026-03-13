CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  match_no INTEGER NOT NULL,
  mode TEXT NOT NULL,
  game_target INTEGER NOT NULL DEFAULT 12,
  stake_mode TEXT NOT NULL DEFAULT 'free',
  ante BIGINT NOT NULL DEFAULT 0,
  pot BIGINT NOT NULL DEFAULT 0,
  winner_player_id UUID REFERENCES players(id),
  winner_seat INTEGER,
  ombre_seat INTEGER,
  resting_seat INTEGER,
  total_hands INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'completed'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_room_match_no
  ON matches(room_id, match_no);

CREATE INDEX IF NOT EXISTS idx_matches_ended_at
  ON matches(ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_matches_winner_player
  ON matches(winner_player_id);

CREATE TABLE IF NOT EXISTS match_participants (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  player_handle TEXT,
  seat INTEGER NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  final_score INTEGER NOT NULL DEFAULT 0,
  placement INTEGER,
  role TEXT NOT NULL DEFAULT 'contra',
  outcome TEXT NOT NULL DEFAULT 'loss',
  stake_delta BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_participants_player_id
  ON match_participants(player_id);

CREATE INDEX IF NOT EXISTS idx_match_participants_match_id
  ON match_participants(match_id);
