import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing: SUPABASE_URL and SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedRagihandin() {
  console.log('Creating Ragihandin (Announcements) section...\n');

  // 1. Create or get Ragihandin category
  console.log('1. Checking for Ragihandin category...');
  let { data: existingCategory } = await supabase
    .from('forum_categories')
    .select('id')
    .eq('name', 'Ragihandin')
    .single();

  let categoryId;
  if (existingCategory) {
    categoryId = existingCategory.id;
    console.log('   Category exists:', categoryId);
  } else {
    console.log('   Creating Ragihandin category...');
    const { data: newCategory, error: catError } = await supabase
      .from('forum_categories')
      .insert({
        name: 'Ragihandin',
        description: 'Daxuyaniyên fermî yên Pezkuwichain',
        icon: '📢',
        color: '#EF4444',
        is_active: true,
        display_order: 0  // First in the list
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

  // 2. Create the pinned announcement post
  console.log('\n2. Creating pinned announcement post...');

  const { data: existingPost } = await supabase
    .from('forum_discussions')
    .select('id')
    .eq('category_id', categoryId)
    .eq('author_id', 'admin')
    .eq('is_pinned', true)
    .single();

  if (existingPost) {
    console.log('   Pinned announcement already exists:', existingPost.id);
  } else {
    const announcementContent = `Hûn bi xêr hatin rûpela daxuyaniyên fermî yên Pezkuwichain! 🎉

📢 **Ev Çi Ye?**

Ev rûpela yekem û yekane ya daxuyaniyên fermî yên Pezkuwichain e. Hemû nûçe, update, û daxuyaniyên girîng ên projeyê dê li vir werin weşandin.

✅ **Li Vir Hûn Dikarin:**
- Nûçeyên herî dawî yên Pezkuwichain bişopînin
- Updateyên teknîkî û pêşkeftinên nû bibînin
- Daxuyaniyên fermî yên tîmê bixwînin
- Pêşerojê û roadmapê bişopînin

⚠️ **Girîng:**
Tenê admin dikare li vê beşê post bike. Ev garantî dike ku hemû agahdarî rast û fermî ne.

🔔 Bi me re bimînin û nûçeyên herî dawî werin!

#Pezkuwichain #Ragihandin #Fermî #Daxuyanî`;

    const { data: newPost, error: postError } = await supabase
      .from('forum_discussions')
      .insert({
        category_id: categoryId,
        title: '📢 Bi Xêr Hatî Rûpela Daxuyaniyên Fermî yên Pezkuwichain!',
        content: announcementContent,
        image_url: '/tokens/pezkuwichain_header.png',
        author_id: 'admin',
        author_name: 'Pezkuwichain Admin',
        is_pinned: true,
        is_locked: false,
        views_count: 0,
        replies_count: 0,
        tags: ['Pezkuwichain', 'Ragihandin', 'Fermî', 'Daxuyanî'],
        last_activity_at: new Date().toISOString()
      })
      .select()
      .single();

    if (postError) {
      console.error('   Error creating post:', postError.message);
    } else {
      console.log('   Announcement post created:', newPost.id);
    }
  }

  console.log('\n✅ Ragihandin section ready!');
}

seedRagihandin().catch(console.error);
