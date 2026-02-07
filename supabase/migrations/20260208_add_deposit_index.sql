-- Add deposit_index column for TRC20 HD wallet derivation
ALTER TABLE tg_users ADD COLUMN IF NOT EXISTS deposit_index INTEGER UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_deposit_index ON tg_users(deposit_index);

-- Assign deposit_index to existing users
WITH numbered_users AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 as idx
  FROM tg_users
  WHERE deposit_index IS NULL
)
UPDATE tg_users
SET deposit_index = numbered_users.idx
FROM numbered_users
WHERE tg_users.id = numbered_users.id;
