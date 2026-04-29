CREATE TABLE IF NOT EXISTS match_activity (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  mode TEXT NOT NULL,
  stake_mode TEXT NOT NULL DEFAULT 'free',
  ante BIGINT NOT NULL DEFAULT 0,
  pot BIGINT NOT NULL DEFAULT 0,
  winner_player_id UUID REFERENCES players(id),
  winner_handle TEXT NOT NULL,
  winner_seat INTEGER,
  ombre_player_id UUID REFERENCES players(id),
  ombre_handle TEXT,
  contract TEXT,
  trump TEXT,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_activity_match_id
  ON match_activity(match_id);

CREATE INDEX IF NOT EXISTS idx_match_activity_ended_at
  ON match_activity(ended_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_activity_stake_mode
  ON match_activity(stake_mode);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_publication
     WHERE pubname = 'supabase_realtime'
  ) AND NOT EXISTS (
    SELECT 1
      FROM pg_publication_rel pr
      JOIN pg_class c ON c.oid = pr.prrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_publication p ON p.oid = pr.prpubid
     WHERE p.pubname = 'supabase_realtime'
       AND n.nspname = 'public'
       AND c.relname = 'match_activity'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.match_activity';
  END IF;
END $$;
