-- Add p2p_user_id to tg_users for unified P2P identity across platforms
--
-- p2p_user_id = UUID v5 derived from citizen/visa number (same as pwap/web)
-- When a Telegram user links their wallet, this is populated.
-- Edge functions use: p2p_user_id ?? id (fallback keeps old behaviour)

ALTER TABLE tg_users ADD COLUMN IF NOT EXISTS p2p_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_tg_users_p2p_user_id ON tg_users(p2p_user_id);
