-- Pezkuwichain Forum - Admin First Post Seed
-- Run this in Supabase SQL Editor to create the welcome post

-- First, ensure there's a "General" category (if not exists)
INSERT INTO forum_categories (id, name, description, icon, color, is_active, display_order)
VALUES (
  gen_random_uuid(),
  'Giştî',
  'Mijarên giştî û nîqaşên civakî',
  '💬',
  '#3B82F6',
  true,
  1
)
ON CONFLICT (name) DO NOTHING;

-- Get the category ID
DO $$
DECLARE
  category_id UUID;
BEGIN
  SELECT id INTO category_id FROM forum_categories WHERE name = 'Giştî' LIMIT 1;

  -- Insert the welcome discussion
  INSERT INTO forum_discussions (
    id,
    category_id,
    title,
    content,
    image_url,
    author_id,
    author_name,
    is_pinned,
    is_locked,
    views_count,
    replies_count,
    tags,
    created_at,
    updated_at,
    last_activity_at
  ) VALUES (
    gen_random_uuid(),
    category_id,
    'Bi xêr hatî Pezkuwichain! 🎉 Dewleta Dîjîtal a Kurd',
    'Silav û rêz ji hemû welatiyên Kurd ên li seranserê cîhanê! 🌍

Pezkuwichain ne tenê blockchaineke e - ew xewna me ye ku Kurdên li her çar perçeyên Kurdistanê û li diasporayê bi hev re bigihîjin.

🔗 **Çima Pezkuwichain?**

Di vê serdema dîjîtal de, em Kurd hewce ne ku platformeke xwe hebe ku:
- Bi azadî bi hev re biaxivin
- Aboriya xwe bi hev re ava bikin
- Nasname û çanda xwe biparêzin
- Ji hêla teknolojiya blockchain ve ewlekariya xwe misoger bikin

🌐 **Armanca Me**

Em dixwazin platformeke ava bikin ku hemû Kurdên cîhanê dikarin:
- Bi hev re pêwendî daynin (connect)
- Projeyên hevbeş bi rê ve bibin
- Bi ziman û çanda xwe bi hev re têkildar bin
- Di aboriya dîjîtal de cîhê xwe bigirin

💪 **Hêza Civakê**

Blockchain ne tenê teknolojî ye - ew şanseke nû ye ji bo gelên wekî me ku di dîrokê de nekarîbûn dewleta xwe ava bikin. Niha em dikarin "Dewleta Dîjîtal"a xwe ava bikin!

Ev platform diyarîyeke ji me ye ji bo hemû Kurdên cîhanê. Bi hev re em dikarin!

#BiHevRe #Pezkuwichain #Blockchain #Kurd #DewletaDîjîtal',
    '/tokens/DKState.png',
    'admin',
    'Pezkuwichain Admin',
    true,  -- pinned
    false, -- not locked
    0,
    0,
    ARRAY['BiHevRe', 'Pezkuwichain', 'Blockchain', 'Kurd', 'Civak'],
    NOW(),
    NOW(),
    NOW()
  );
END $$;

-- Create an admin announcement
INSERT INTO admin_announcements (
  id,
  title,
  content,
  type,
  priority,
  is_active,
  created_at
) VALUES (
  gen_random_uuid(),
  'Bi xêr hatî Forum!',
  'Ev foruma fermî ya Pezkuwichain e. Li vir tu dikarî mijarên nû vekî, bersivan bidî û bi civakê re têkiliyê ragirî!',
  'success',
  100,
  true,
  NOW()
)
ON CONFLICT DO NOTHING;

-- Output success message
SELECT 'Admin post and announcement created successfully!' as result;
