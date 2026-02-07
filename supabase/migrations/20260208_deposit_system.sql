-- Deposit System Tables
-- For USDT deposits (TRC20 and Polkadot)

-- User deposit codes (unique memo for each user)
CREATE TABLE IF NOT EXISTS tg_user_deposit_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES tg_users(id) ON DELETE CASCADE,
  code VARCHAR(12) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_deposit_code UNIQUE (user_id)
);

-- Deposit records
CREATE TABLE IF NOT EXISTS tg_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES tg_users(id) ON DELETE CASCADE,
  network VARCHAR(20) NOT NULL CHECK (network IN ('trc20', 'polkadot')),
  amount DECIMAL(20, 6) NOT NULL,
  tx_hash VARCHAR(100),
  memo VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirming', 'completed', 'failed', 'expired')),
  wusdt_tx_hash VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON tg_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON tg_deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_network ON tg_deposits(network);
CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON tg_deposits(tx_hash);
CREATE INDEX IF NOT EXISTS idx_deposit_codes_code ON tg_user_deposit_codes(code);

-- Function to generate unique deposit code
CREATE OR REPLACE FUNCTION generate_deposit_code()
RETURNS VARCHAR(12) AS $$
DECLARE
  chars VARCHAR(36) := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result VARCHAR(12) := 'PEZ-';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate deposit code for new users
CREATE OR REPLACE FUNCTION create_user_deposit_code()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tg_user_deposit_codes (user_id, code)
  VALUES (NEW.id, generate_deposit_code())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_create_deposit_code ON tg_users;
CREATE TRIGGER trigger_create_deposit_code
  AFTER INSERT ON tg_users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_deposit_code();

-- Generate codes for existing users
INSERT INTO tg_user_deposit_codes (user_id, code)
SELECT id, generate_deposit_code()
FROM tg_users
WHERE id NOT IN (SELECT user_id FROM tg_user_deposit_codes)
ON CONFLICT DO NOTHING;

-- RLS Policies
ALTER TABLE tg_user_deposit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_deposits ENABLE ROW LEVEL SECURITY;

-- Users can read their own deposit code
CREATE POLICY "Users can view own deposit code"
  ON tg_user_deposit_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view their own deposits
CREATE POLICY "Users can view own deposits"
  ON tg_deposits FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for backend)
CREATE POLICY "Service role full access to deposit codes"
  ON tg_user_deposit_codes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to deposits"
  ON tg_deposits FOR ALL
  USING (auth.role() = 'service_role');
