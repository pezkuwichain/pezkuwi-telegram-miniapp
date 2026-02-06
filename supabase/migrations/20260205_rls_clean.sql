-- =====================================================
-- CLEAN RLS POLICIES - PezkuwiChain Telegram MiniApp
-- Strategy: SELECT for anon, mutations via Edge Functions
-- =====================================================

-- Drop all existing policies first
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

-- Enable RLS and create SELECT policies for all tables
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN (
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  ) LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t.tablename);

    -- Allow SELECT for anon and authenticated
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true)',
      t.tablename || '_select',
      t.tablename
    );
  END LOOP;
END $$;

-- Note: INSERT/UPDATE/DELETE blocked for anon by default
-- All mutations must go through Edge Functions (service role bypasses RLS)
