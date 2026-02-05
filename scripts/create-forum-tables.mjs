import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing: SUPABASE_URL and SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createForumTables() {
  console.log('Creating forum tables in DKSapp Supabase...\n');

  // Create tables using raw SQL via Supabase's pg_catalog or rpc
  // Since we can't run raw SQL directly, let's check if tables exist and create data

  // First, let's try to query the tables to see if they exist
  console.log('Checking existing tables...');

  const { data: categories, error: catError } = await supabase
    .from('forum_categories')
    .select('*')
    .limit(1);

  if (catError && catError.message.includes('does not exist')) {
    console.log('\n❌ Forum tables do not exist in this Supabase project.');
    console.log('\nYou need to create them in Supabase SQL Editor:');
    console.log('Go to your Supabase dashboard SQL editor\n');
    console.log('Run this SQL:\n');
    console.log(`
-- Forum Categories Table
CREATE TABLE IF NOT EXISTS forum_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT DEFAULT '💬',
  color TEXT DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum Discussions Table
CREATE TABLE IF NOT EXISTS forum_discussions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES forum_categories(id),
  proposal_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_address TEXT,
  is_pinned BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  views_count INTEGER DEFAULT 0,
  replies_count INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum Replies Table
CREATE TABLE IF NOT EXISTS forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID REFERENCES forum_discussions(id) ON DELETE CASCADE,
  parent_reply_id UUID REFERENCES forum_replies(id),
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_address TEXT,
  is_edited BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forum Reactions Table
CREATE TABLE IF NOT EXISTS forum_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discussion_id UUID REFERENCES forum_discussions(id) ON DELETE CASCADE,
  reply_id UUID REFERENCES forum_replies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('upvote', 'downvote')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(discussion_id, user_id),
  UNIQUE(reply_id, user_id)
);

-- Admin Announcements Table
CREATE TABLE IF NOT EXISTS admin_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'critical')),
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE forum_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_announcements ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for now - can be restricted later)
CREATE POLICY "Allow all on forum_categories" ON forum_categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on forum_discussions" ON forum_discussions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on forum_replies" ON forum_replies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on forum_reactions" ON forum_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on admin_announcements" ON admin_announcements FOR ALL USING (true) WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_discussions_category ON forum_discussions(category_id);
CREATE INDEX IF NOT EXISTS idx_discussions_pinned ON forum_discussions(is_pinned);
CREATE INDEX IF NOT EXISTS idx_discussions_activity ON forum_discussions(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_discussion ON forum_replies(discussion_id);
CREATE INDEX IF NOT EXISTS idx_reactions_discussion ON forum_reactions(discussion_id);
CREATE INDEX IF NOT EXISTS idx_reactions_reply ON forum_reactions(reply_id);
`);
    return false;
  } else if (catError) {
    console.error('Error checking tables:', catError.message);
    return false;
  } else {
    console.log('✅ Forum tables exist!');
    console.log('   Categories found:', categories?.length || 0);
    return true;
  }
}

createForumTables().then(exists => {
  if (exists) {
    console.log('\nTables ready. Now run seed-admin-post.mjs');
  }
}).catch(console.error);
