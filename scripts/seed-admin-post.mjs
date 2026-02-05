import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedAdminPost() {
  console.log('Seeding admin post...\n');

  // 1. Check/Create category
  console.log('1. Checking for Giştî category...');
  let { data: existingCategory } = await supabase
    .from('forum_categories')
    .select('id')
    .eq('name', 'Giştî')
    .single();

  let categoryId;
  if (existingCategory) {
    categoryId = existingCategory.id;
    console.log('   Category exists:', categoryId);
  } else {
    console.log('   Creating category...');
    const { data: newCategory, error: catError } = await supabase
      .from('forum_categories')
      .insert({
        name: 'Giştî',
        description: 'Mijarên giştî û nîqaşên civakî',
        icon: '💬',
        color: '#3B82F6',
        is_active: true,
        display_order: 1
      })
      .select()
      .single();

    if (catError) {
      console.error('   Error creating category:', catError.message);
      return;
    }
    categoryId = newCategory.id;
    console.log('   Category created:', categoryId);
  }

  // 2. Check if welcome post exists
  console.log('\n2. Checking for existing welcome post...');
  const { data: existingPost } = await supabase
    .from('forum_discussions')
    .select('id')
    .eq('author_id', 'admin')
    .eq('is_pinned', true)
    .single();

  if (existingPost) {
    console.log('   Welcome post already exists:', existingPost.id);
  } else {
    console.log('   Creating welcome post...');
    const postContent = `Silav û rêz ji hemû welatiyên Kurd ên li seranserê cîhanê! 🌍

Pezkuwichain ne tenê blockchaineke e - ew xewna me ye ku Kurdên li her çar perçeyên Kurdistanê û li diasporayê bi hev re bigihîjin.

🔗 **Çima Pezkuwichain?**

Di vê serdema dîjîtal de, em Kurd hewce ne ku platformeke xwe hebe ku:
- Bi azadî bi hev re biaxivin
- Aboriya xwe bi hev re ava bikin
- Nasname û çanda xwe biparêzin
- Ji hêza teknolojiya blockchain ve ewlekariya xwe misoger bikin

🌐 **Armanca Me**

Em dixwazin platformeke ava bikin ku hemû Kurdên cîhanê dikarin:
- Bi hev re pêwendî daynin (connect)
- Projeyên hevbeş bi rê ve bibin
- Bi ziman û çanda xwe bi hev re têkildar bin
- Di aboriya dîjîtal de cîhê xwe bigirin

💪 **Hêza Civakê**

Blockchain ne tenê teknolojî ye - ew şanseke nû ye ji bo gelên wekî me ku di dîrokê de nekarîbûn dewleta xwe ava bikin. Niha em dikarin "Dewleta Dîjîtal"a xwe ava bikin!

Ev platform diyarîyeke ji me ye ji bo hemû Kurdên cîhanê. Bi hev re em dikarin!

#BiHevRe #Pezkuwichain #Blockchain #Kurd #DewletaDîjîtal`;

    const { data: newPost, error: postError } = await supabase
      .from('forum_discussions')
      .insert({
        category_id: categoryId,
        title: 'Bi xêr hatî Pezkuwichain! 🎉 Dewleta Dîjîtal a Kurd',
        content: postContent,
        image_url: '/tokens/DKState.png',
        author_id: 'admin',
        author_name: 'Pezkuwichain Admin',
        is_pinned: true,
        is_locked: false,
        views_count: 0,
        replies_count: 0,
        tags: ['BiHevRe', 'Pezkuwichain', 'Blockchain', 'Kurd', 'Civak'],
        last_activity_at: new Date().toISOString()
      })
      .select()
      .single();

    if (postError) {
      console.error('   Error creating post:', postError.message);
    } else {
      console.log('   Welcome post created:', newPost.id);
    }
  }

  // 3. Check/Create announcement
  console.log('\n3. Checking for welcome announcement...');
  const { data: existingAnnouncement } = await supabase
    .from('admin_announcements')
    .select('id')
    .eq('title', 'Bi xêr hatî Forum!')
    .single();

  if (existingAnnouncement) {
    console.log('   Announcement already exists:', existingAnnouncement.id);
  } else {
    console.log('   Creating announcement...');
    const { data: newAnnouncement, error: annError } = await supabase
      .from('admin_announcements')
      .insert({
        title: 'Bi xêr hatî Forum!',
        content: 'Ev foruma fermî ya Pezkuwichain e. Li vir tu dikarî mijarên nû vekî, bersivan bidî û bi civakê re têkiliyê ragirî!',
        type: 'success',
        priority: 100,
        is_active: true
      })
      .select()
      .single();

    if (annError) {
      console.error('   Error creating announcement:', annError.message);
    } else {
      console.log('   Announcement created:', newAnnouncement.id);
    }
  }

  console.log('\n✅ Seeding complete!');
}

seedAdminPost().catch(console.error);
