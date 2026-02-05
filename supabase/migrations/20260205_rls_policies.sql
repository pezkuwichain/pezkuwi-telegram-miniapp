-- =====================================================
-- RLS POLICIES - PezkuwiChain Telegram MiniApp
-- =====================================================

-- Önce tüm mevcut policy'leri temizle
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

-- Helper: Get current user's telegram_id (BIGINT)
CREATE OR REPLACE FUNCTION get_my_telegram_id()
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT (raw_user_meta_data->>'telegram_id')::BIGINT
    FROM auth.users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: Check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tg_users
    WHERE telegram_id = get_my_telegram_id()
    AND is_admin = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper: Get current user's tg_users.id (UUID)
CREATE OR REPLACE FUNCTION get_my_tg_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM tg_users
    WHERE telegram_id = get_my_telegram_id()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =====================================================
-- TG_USERS (telegram_id = BIGINT, id = UUID)
-- =====================================================
ALTER TABLE tg_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_users_select" ON tg_users
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "tg_users_update" ON tg_users
  FOR UPDATE TO authenticated
  USING (telegram_id = get_my_telegram_id());

-- =====================================================
-- TG_ANNOUNCEMENTS (author_id = UUID)
-- =====================================================
ALTER TABLE tg_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_announcements_select" ON tg_announcements
  FOR SELECT TO authenticated, anon USING (is_published = true);

CREATE POLICY "tg_announcements_admin" ON tg_announcements
  FOR ALL TO authenticated USING (is_admin());

-- =====================================================
-- TG_ANNOUNCEMENT_REACTIONS (user_id = UUID)
-- =====================================================
ALTER TABLE tg_announcement_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_announcement_reactions_select" ON tg_announcement_reactions
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "tg_announcement_reactions_insert" ON tg_announcement_reactions
  FOR INSERT TO authenticated WITH CHECK (user_id = get_my_tg_user_id());

CREATE POLICY "tg_announcement_reactions_delete" ON tg_announcement_reactions
  FOR DELETE TO authenticated USING (user_id = get_my_tg_user_id());

-- =====================================================
-- TG_THREADS (author_id = UUID)
-- =====================================================
ALTER TABLE tg_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_threads_select" ON tg_threads
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "tg_threads_insert" ON tg_threads
  FOR INSERT TO authenticated WITH CHECK (author_id = get_my_tg_user_id());

CREATE POLICY "tg_threads_update" ON tg_threads
  FOR UPDATE TO authenticated
  USING (author_id = get_my_tg_user_id() OR is_admin());

CREATE POLICY "tg_threads_delete" ON tg_threads
  FOR DELETE TO authenticated
  USING (author_id = get_my_tg_user_id() OR is_admin());

-- =====================================================
-- TG_REPLIES (author_id = UUID)
-- =====================================================
ALTER TABLE tg_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_replies_select" ON tg_replies
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "tg_replies_insert" ON tg_replies
  FOR INSERT TO authenticated WITH CHECK (author_id = get_my_tg_user_id());

CREATE POLICY "tg_replies_update" ON tg_replies
  FOR UPDATE TO authenticated
  USING (author_id = get_my_tg_user_id() OR is_admin());

CREATE POLICY "tg_replies_delete" ON tg_replies
  FOR DELETE TO authenticated
  USING (author_id = get_my_tg_user_id() OR is_admin());

-- =====================================================
-- TG_THREAD_LIKES (user_id = UUID)
-- =====================================================
ALTER TABLE tg_thread_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_thread_likes_select" ON tg_thread_likes
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "tg_thread_likes_insert" ON tg_thread_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = get_my_tg_user_id());

CREATE POLICY "tg_thread_likes_delete" ON tg_thread_likes
  FOR DELETE TO authenticated USING (user_id = get_my_tg_user_id());

-- =====================================================
-- TG_REPLY_LIKES (user_id = UUID)
-- =====================================================
ALTER TABLE tg_reply_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tg_reply_likes_select" ON tg_reply_likes
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "tg_reply_likes_insert" ON tg_reply_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = get_my_tg_user_id());

CREATE POLICY "tg_reply_likes_delete" ON tg_reply_likes
  FOR DELETE TO authenticated USING (user_id = get_my_tg_user_id());

-- =====================================================
-- FORUM_CATEGORIES (id = UUID)
-- =====================================================
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_categories_select" ON forum_categories
  FOR SELECT TO authenticated, anon USING (is_active = true);

CREATE POLICY "forum_categories_admin" ON forum_categories
  FOR ALL TO authenticated USING (is_admin());

-- =====================================================
-- FORUM_DISCUSSIONS (author_id = TEXT)
-- =====================================================
ALTER TABLE forum_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_discussions_select" ON forum_discussions
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "forum_discussions_insert" ON forum_discussions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "forum_discussions_update" ON forum_discussions
  FOR UPDATE TO authenticated
  USING (author_id = get_my_tg_user_id()::text OR is_admin());

CREATE POLICY "forum_discussions_delete" ON forum_discussions
  FOR DELETE TO authenticated USING (is_admin());

-- =====================================================
-- FORUM_REPLIES (author_id = TEXT)
-- =====================================================
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_replies_select" ON forum_replies
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "forum_replies_insert" ON forum_replies
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "forum_replies_update" ON forum_replies
  FOR UPDATE TO authenticated
  USING (author_id = get_my_tg_user_id()::text OR is_admin());

CREATE POLICY "forum_replies_delete" ON forum_replies
  FOR DELETE TO authenticated
  USING (author_id = get_my_tg_user_id()::text OR is_admin());

-- =====================================================
-- FORUM_REACTIONS (user_id = TEXT)
-- =====================================================
ALTER TABLE forum_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "forum_reactions_select" ON forum_reactions
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "forum_reactions_insert" ON forum_reactions
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "forum_reactions_delete" ON forum_reactions
  FOR DELETE TO authenticated
  USING (user_id = get_my_tg_user_id()::text);

-- =====================================================
-- ADMIN_ANNOUNCEMENTS
-- =====================================================
ALTER TABLE admin_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_announcements_select" ON admin_announcements
  FOR SELECT TO authenticated, anon USING (is_active = true);

CREATE POLICY "admin_announcements_admin" ON admin_announcements
  FOR ALL TO authenticated USING (is_admin());

-- =====================================================
-- USERS (telegram_id = BIGINT)
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "users_update" ON users
  FOR UPDATE TO authenticated
  USING (telegram_id = get_my_telegram_id());

-- =====================================================
-- TÜM DİĞER TABLOLAR - Authenticated erişim
-- =====================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'p2p_audit_log', 'p2p_balance_transactions', 'p2p_block_trade_requests',
    'p2p_deposit_withdraw_requests', 'p2p_dispute_evidence', 'p2p_featured_ads',
    'p2p_fiat_disputes', 'p2p_fiat_offers', 'p2p_fiat_trades', 'p2p_fraud_reports',
    'p2p_merchant_stats', 'p2p_merchant_tiers', 'p2p_messages', 'p2p_notifications',
    'p2p_ratings', 'p2p_reputation', 'p2p_suspicious_activity', 'p2p_tier_requirements',
    'p2p_trades', 'p2p_user_fraud_indicators', 'p2p_user_payment_methods',
    'p2p_withdrawal_limits', 'platform_escrow_balance', 'user_internal_balances',
    'activity_logs', 'admin_roles', 'backup_metadata', 'backup_schedules',
    'batch_transactions', 'bridge_transactions', 'chain_configs', 'cross_chain_proposals',
    'email_verification_tokens', 'gas_prices', 'governance_permissions',
    'mev_attacks_detected', 'mev_protection_configs', 'mev_rewards_config',
    'mev_rewards_history', 'mev_statistics', 'multi_sig_transactions', 'multi_sig_wallets',
    'notifications', 'optimization_routes', 'password_reset_tokens', 'payment_methods',
    'permissions', 'platform_wallet_config', 'private_pools', 'profiles',
    'protected_transactions', 'recovery_logs', 'role_permissions', 'roles',
    'staking_positions', 'system_settings', 'transaction_signatures', 'two_factor_auth',
    'user_roles', 'user_sessions', 'validator_incentives', 'wallet_connections', 'wallet_signers'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', t || '_sel', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true)', t || '_ins', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true)', t || '_upd', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (is_admin())', t || '_del', t);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

SELECT 'RLS Policies başarıyla oluşturuldu!' as result;
