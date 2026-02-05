import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing: SUPABASE_URL and SUPABASE_SERVICE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedAnnouncements() {
  console.log('Setting up Ragihandin (tg_announcements)...\n');

  // 1. Check/create admin user
  console.log('1. Checking for admin user...');
  let { data: adminUser } = await supabase
    .from('tg_users')
    .select('*')
    .eq('is_admin', true)
    .single();

  if (!adminUser) {
    console.log('   No admin user found, checking all users...');
    const { data: allUsers } = await supabase
      .from('tg_users')
      .select('*')
      .limit(5);

    console.log('   Found', allUsers?.length || 0, 'users');

    if (allUsers && allUsers.length > 0) {
      console.log('   Users:', allUsers.map(u => `${u.first_name} (${u.id})`).join(', '));
      // Use the first user as admin for now
      adminUser = allUsers[0];
      console.log('   Using first user as admin:', adminUser.first_name);
    } else {
      // Create a system admin user
      console.log('   Creating system admin user...');
      const { data: newAdmin, error: adminError } = await supabase
        .from('tg_users')
        .insert({
          telegram_id: 0,
          username: 'pezkuwichain_admin',
          first_name: 'Pezkuwichain',
          last_name: 'Admin',
          is_admin: true
        })
        .select()
        .single();

      if (adminError) {
        console.error('   Error creating admin:', adminError.message);
        return false;
      }
      adminUser = newAdmin;
      console.log('   Admin created:', adminUser.id);
    }
  } else {
    console.log('   Admin found:', adminUser.first_name, adminUser.id);
  }

  // 2. Check existing announcements
  console.log('\n2. Checking existing announcements...');
  const { data: existing } = await supabase
    .from('tg_announcements')
    .select('*')
    .limit(5);

  console.log('   Found', existing?.length || 0, 'announcements');

  const ourAnnouncement = existing?.find(a =>
    a.title?.includes('Bi Xêr Hatî') || a.title?.includes('Daxuyaniyên Fermî')
  );

  if (ourAnnouncement) {
    console.log('\n   ✅ Admin announcement already exists:', ourAnnouncement.id);
    return true;
  }

  // 3. Create the admin announcement
  console.log('\n3. Creating admin announcement...');

  const announcementContent = `Hûn bi xêr hatin rûpela daxuyaniyên fermî yên Pezkuwichain!

📢 Ev rûpela yekem û yekane ya daxuyaniyên fermî yên Pezkuwichain e.

✅ Li vir hûn dikarin:
• Nûçeyên herî dawî yên Pezkuwichain bişopînin
• Updateyên teknîkî û pêşkeftinên nû bibînin
• Daxuyaniyên fermî yên tîmê bixwînin
• Roadmap û pêşerojê bişopînin

⚠️ Tenê admin dikare li vir post bike - hemû agahdarî rast û fermî ne.

🔔 Bi me re bimînin!`;

  const { data: newAnn, error: annError } = await supabase
    .from('tg_announcements')
    .insert({
      title: '📢 Bi Xêr Hatî Rûpela Daxuyaniyên Fermî!',
      content: announcementContent,
      image_url: '/tokens/pezkuwichain_header.png',
      link_url: 'https://pezkuwichain.io',
      author_id: adminUser.id,
      is_published: true
    })
    .select()
    .single();

  if (annError) {
    console.error('   Error creating announcement:', annError.message);
    return false;
  }

  console.log('   ✅ Announcement created:', newAnn.id);
  console.log('\n✅ Ragihandin setup complete!');
  return true;
}

seedAnnouncements().catch(console.error);
