-- Add transfer-related fields to tg_deposits
ALTER TABLE tg_deposits
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_deposits_status_retry
  ON tg_deposits(status, retry_count)
  WHERE status = 'confirming';
