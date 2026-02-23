-- Update p2p_balance_transactions transaction_type check constraint
-- Add new types needed for full P2P flow:
--   withdraw_lock: when user requests withdrawal, balance moves available -> locked
--   withdraw_complete: when withdrawal is processed on-chain
--   dispute_refund: admin refunds during dispute resolution

ALTER TABLE p2p_balance_transactions
  DROP CONSTRAINT p2p_balance_transactions_transaction_type_check;

ALTER TABLE p2p_balance_transactions
  ADD CONSTRAINT p2p_balance_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY[
    'deposit',
    'withdraw',
    'withdraw_lock',
    'withdraw_complete',
    'escrow_lock',
    'escrow_release',
    'escrow_refund',
    'trade_receive',
    'dispute_refund',
    'admin_adjustment'
  ]));
