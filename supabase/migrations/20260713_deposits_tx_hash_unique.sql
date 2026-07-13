-- Prevent duplicate deposit records for the same on-chain transaction.
-- Without this constraint, a check-then-insert race in check-deposits
-- (concurrent invocations, or any transient duplicate) permanently breaks
-- the .single() dedup lookup once 2+ rows share a tx_hash, causing every
-- subsequent cron run to re-insert indefinitely. This happened in
-- production: two tx_hashes accumulated 50k+ and 30k+ duplicate rows
-- respectively before being cleaned up.
ALTER TABLE tg_deposits ADD CONSTRAINT tg_deposits_tx_hash_unique UNIQUE (tx_hash);
