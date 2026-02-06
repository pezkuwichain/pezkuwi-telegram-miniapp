-- =====================================================
-- SECURE RLS POLICIES - PezkuwiChain Telegram MiniApp
-- Date: 2026-02-06
-- Priority: Financial security first
-- =====================================================

-- Drop ALL existing policies first
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- =====================================================
-- HELPER: Apply service-only policy (for sensitive tables)
-- =====================================================
CREATE OR REPLACE FUNCTION apply_service_only_rls(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO service_role USING (true)', tbl || '_sel_svc', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO service_role WITH CHECK (true)', tbl || '_ins_svc', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO service_role USING (true)', tbl || '_upd_svc', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO service_role USING (true)', tbl || '_del_svc', tbl);
EXCEPTION WHEN undefined_table THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- HELPER: Apply public read + service write policy
-- =====================================================
CREATE OR REPLACE FUNCTION apply_public_read_rls(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)', tbl || '_sel_pub', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO service_role WITH CHECK (true)', tbl || '_ins_svc', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO service_role USING (true)', tbl || '_upd_svc', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO service_role USING (true)', tbl || '_del_svc', tbl);
EXCEPTION WHEN undefined_table THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- HELPER: Apply authenticated write policy (for forum etc)
-- =====================================================
CREATE OR REPLACE FUNCTION apply_authenticated_write_rls(tbl TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)', tbl || '_sel_all', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true)', tbl || '_ins_auth', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true)', tbl || '_upd_auth', tbl);
  EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (true)', tbl || '_del_auth', tbl);
  -- Service role also needs access
  EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl || '_all_svc', tbl);
EXCEPTION WHEN undefined_table THEN NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 1. FINANCIAL/P2P TABLES - SERVICE ROLE ONLY (CRITICAL)
-- These contain money, balances, trades - highest security
-- =====================================================
SELECT apply_service_only_rls('user_internal_balances');
SELECT apply_service_only_rls('platform_escrow_balance');
SELECT apply_service_only_rls('p2p_fiat_offers');
SELECT apply_service_only_rls('p2p_fiat_trades');
SELECT apply_service_only_rls('p2p_fiat_disputes');
SELECT apply_service_only_rls('p2p_dispute_evidence');
SELECT apply_service_only_rls('p2p_messages');
SELECT apply_service_only_rls('p2p_ratings');
SELECT apply_service_only_rls('p2p_notifications');
SELECT apply_service_only_rls('p2p_user_payment_methods');
SELECT apply_service_only_rls('p2p_fraud_reports');
SELECT apply_service_only_rls('p2p_suspicious_activity');
SELECT apply_service_only_rls('p2p_user_fraud_indicators');
SELECT apply_service_only_rls('p2p_audit_log');
SELECT apply_service_only_rls('p2p_balance_transactions');
SELECT apply_service_only_rls('p2p_block_trade_requests');
SELECT apply_service_only_rls('p2p_deposit_withdraw_requests');
SELECT apply_service_only_rls('p2p_featured_ads');
SELECT apply_service_only_rls('p2p_merchant_stats');
SELECT apply_service_only_rls('p2p_merchant_tiers');
SELECT apply_service_only_rls('p2p_reputation');
SELECT apply_service_only_rls('p2p_tier_requirements');
SELECT apply_service_only_rls('p2p_trades');
SELECT apply_service_only_rls('p2p_withdrawal_limits');

-- =====================================================
-- 2. ADMIN/SYSTEM TABLES - SERVICE ROLE ONLY
-- =====================================================
SELECT apply_service_only_rls('activity_logs');
SELECT apply_service_only_rls('admin_roles');
SELECT apply_service_only_rls('backup_metadata');
SELECT apply_service_only_rls('backup_schedules');
SELECT apply_service_only_rls('batch_transactions');
SELECT apply_service_only_rls('bridge_transactions');
SELECT apply_service_only_rls('chain_configs');
SELECT apply_service_only_rls('cross_chain_proposals');
SELECT apply_service_only_rls('email_verification_tokens');
SELECT apply_service_only_rls('gas_prices');
SELECT apply_service_only_rls('governance_permissions');
SELECT apply_service_only_rls('mev_attacks_detected');
SELECT apply_service_only_rls('mev_protection_configs');
SELECT apply_service_only_rls('mev_rewards_config');
SELECT apply_service_only_rls('mev_rewards_history');
SELECT apply_service_only_rls('mev_statistics');
SELECT apply_service_only_rls('multi_sig_transactions');
SELECT apply_service_only_rls('multi_sig_wallets');
SELECT apply_service_only_rls('notifications');
SELECT apply_service_only_rls('optimization_routes');
SELECT apply_service_only_rls('password_reset_tokens');
SELECT apply_service_only_rls('payment_methods');
SELECT apply_service_only_rls('permissions');
SELECT apply_service_only_rls('platform_wallet_config');
SELECT apply_service_only_rls('private_pools');
SELECT apply_service_only_rls('profiles');
SELECT apply_service_only_rls('protected_transactions');
SELECT apply_service_only_rls('recovery_logs');
SELECT apply_service_only_rls('role_permissions');
SELECT apply_service_only_rls('roles');
SELECT apply_service_only_rls('staking_positions');
SELECT apply_service_only_rls('system_settings');
SELECT apply_service_only_rls('transaction_signatures');
SELECT apply_service_only_rls('two_factor_auth');
SELECT apply_service_only_rls('user_roles');
SELECT apply_service_only_rls('user_sessions');
SELECT apply_service_only_rls('validator_incentives');
SELECT apply_service_only_rls('wallet_connections');
SELECT apply_service_only_rls('wallet_signers');

-- =====================================================
-- 3. USER TABLE - Public read, service write
-- =====================================================
SELECT apply_public_read_rls('users');
SELECT apply_public_read_rls('tg_users');

-- =====================================================
-- 4. ANNOUNCEMENT TABLES - Public read, service write
-- =====================================================
SELECT apply_public_read_rls('announcements');
SELECT apply_public_read_rls('tg_announcements');
SELECT apply_public_read_rls('admin_announcements');

-- =====================================================
-- 5. FORUM/THREAD TABLES - Authenticated can write
-- (Lower priority security - social features)
-- =====================================================
SELECT apply_authenticated_write_rls('threads');
SELECT apply_authenticated_write_rls('tg_threads');
SELECT apply_authenticated_write_rls('replies');
SELECT apply_authenticated_write_rls('tg_replies');
SELECT apply_authenticated_write_rls('thread_likes');
SELECT apply_authenticated_write_rls('tg_thread_likes');
SELECT apply_authenticated_write_rls('reply_likes');
SELECT apply_authenticated_write_rls('tg_reply_likes');
SELECT apply_authenticated_write_rls('announcement_reactions');
SELECT apply_authenticated_write_rls('tg_announcement_reactions');
SELECT apply_authenticated_write_rls('forum_categories');
SELECT apply_authenticated_write_rls('forum_discussions');
SELECT apply_authenticated_write_rls('forum_replies');
SELECT apply_authenticated_write_rls('forum_reactions');

-- =====================================================
-- CLEANUP
-- =====================================================
DROP FUNCTION IF EXISTS apply_service_only_rls(TEXT);
DROP FUNCTION IF EXISTS apply_public_read_rls(TEXT);
DROP FUNCTION IF EXISTS apply_authenticated_write_rls(TEXT);

-- =====================================================
-- SUMMARY
-- =====================================================
-- CRITICAL (service_role only):
--   All P2P/financial tables, admin tables, system settings
--
-- PUBLIC READ (service_role write):
--   users, announcements
--
-- AUTHENTICATED WRITE (forum features):
--   threads, replies, likes, reactions
-- =====================================================

SELECT 'Secure RLS policies applied successfully!' as result;
