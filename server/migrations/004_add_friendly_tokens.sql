ALTER TABLE players ADD COLUMN IF NOT EXISTS token_balance BIGINT DEFAULT 1000;
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_rescue_at TIMESTAMPTZ;

UPDATE players
   SET token_balance = COALESCE(token_balance, 1000)
 WHERE token_balance IS NULL;

CREATE TABLE IF NOT EXISTS token_ledger (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id),
  delta BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reason TEXT NOT NULL,
  match_ref TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_player_id ON token_ledger(player_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_match_ref ON token_ledger(match_ref);
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_ledger_unique_match_reason_player
  ON token_ledger(player_id, reason, match_ref)
  WHERE match_ref IS NOT NULL;
