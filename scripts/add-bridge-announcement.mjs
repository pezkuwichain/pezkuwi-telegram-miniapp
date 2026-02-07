import { createClient } from '@supabase/supabase-js';

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://imxxpzevsnomqxqrbokh.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_KEY) {
  console.error('SUPABASE_SERVICE_KEY or VITE_SUPABASE_ANON_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const announcement = {
  title: '🌉 Polkadot Bridge Tê!',
  content: `🇰🇼 Kurmancî:
Xebata bridge bi Polkadot re dest pê kir! Di demeke pir nêzîk de, hûn ê bikaribin DOT'ên xwe yên li ser Pezkuwi Asset Hub veguhezînin Polkadot Asset Hub. Ev pira dê rêyek nû ya veguheztina hebûnan di navbera her du ekosistemanê de veke. Li bendê bin!

🇮🇶 سۆرانی:
کاری پردەکان لەگەڵ پۆڵکادۆت دەستی پێکرد! لە کاتێکی زۆر نزیکدا، تۆ دەتوانیت DOTەکانت لە سەر Pezkuwi Asset Hub بگوازیتەوە بۆ Polkadot Asset Hub. ئەم پردە رێگایەکی نوێ بۆ گواستنەوەی سامانەکان لە نێوان هەردوو ئیکۆسیستەمەکەدا دەکاتەوە. چاوەڕوان بن!

🇬🇧 English:
Bridge work with Polkadot has started! Very soon, you will be able to transfer your DOT from Pezkuwi Asset Hub to Polkadot Asset Hub. This bridge will open a new way to move assets between both ecosystems. Stay tuned!`,
  is_published: true,
  views: 0,
  likes: 0,
  dislikes: 0,
};

async function main() {
  console.log('Adding bridge announcement...');

  const { data, error } = await supabase
    .from('tg_announcements')
    .insert(announcement)
    .select()
    .single();

  if (error) {
    console.error('Error adding announcement:', error);
    process.exit(1);
  }

  console.log('Announcement added successfully!');
  console.log('ID:', data.id);
  console.log('Title:', data.title);
}

main();
