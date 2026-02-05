-- Enable RLS on ALL public tables and create authenticated access policy
-- This migration secures all tables by requiring authentication

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE '_pg_%'
  LOOP
    -- Enable RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);

    -- Drop existing policy if exists
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_access" ON public.%I', t.tablename);

    -- Create policy for authenticated users
    EXECUTE format('CREATE POLICY "authenticated_access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t.tablename);

    RAISE NOTICE 'RLS enabled for: %', t.tablename;
  END LOOP;
END $$;
