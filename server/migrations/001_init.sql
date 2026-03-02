CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY,
  handle TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  elo INTEGER DEFAULT 1200
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS hands (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  hand_no INTEGER NOT NULL,
  seed TEXT,
  trump TEXT,
  ombre TEXT,
  resting TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actions (
  id BIGSERIAL PRIMARY KEY,
  hand_id BIGINT REFERENCES hands(id),
  seq INTEGER NOT NULL,
  player_id UUID,
  seat TEXT,
  type TEXT NOT NULL,
  payload JSONB,
  ts TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS results (
  id BIGSERIAL PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  hand_no INTEGER,
  result TEXT,
  points INTEGER,
  award JSONB,
  tricks JSONB,
  scores JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
