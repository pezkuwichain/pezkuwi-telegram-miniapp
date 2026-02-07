-- Add Polkadot Bridge announcement
-- Note: This was already applied manually on 2026-02-07
-- author_id is pezkuwichain_admin
INSERT INTO tg_announcements (title, content, author_id, is_published, views, likes, dislikes) VALUES
('🌉 Polkadot Bridge Tê!',
'🇰🇼 Kurmancî:
Xebata bridge bi Polkadot re dest pê kir! Di demeke pir nêzîk de, hûn ê bikaribin DOT''ên xwe yên li ser Pezkuwi Asset Hub veguhezînin Polkadot Asset Hub. Ev pira dê rêyek nû ya veguheztina hebûnan di navbera her du ekosistemanê de veke. Li bendê bin!

🇮🇶 سۆرانی:
کاری پردەکان لەگەڵ پۆڵکادۆت دەستی پێکرد! لە کاتێکی زۆر نزیکدا، تۆ دەتوانیت DOTەکانت لە سەر Pezkuwi Asset Hub بگوازیتەوە بۆ Polkadot Asset Hub. ئەم پردە رێگایەکی نوێ بۆ گواستنەوەی سامانەکان لە نێوان هەردوو ئیکۆسیستەمەکەدا دەکاتەوە. چاوەڕوان بن!

🇬🇧 English:
Bridge work with Polkadot has started! Very soon, you will be able to transfer your DOT from Pezkuwi Asset Hub to Polkadot Asset Hub. This bridge will open a new way to move assets between both ecosystems. Stay tuned!',
'450523d5-b34d-483f-9e12-56bb69dc7f4a',
true, 0, 0, 0)
ON CONFLICT DO NOTHING;
