/**
 * PezkuwiChain Telegram Bot - Supabase Edge Function
 * Handles webhook updates from two separate bots:
 *   - @Pezkuwichain_Bot (main)  → telegram.pezkuwichain.io
 *   - @pezkuwichainBot  (krd)   → telegram.pezkiwi.app
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Keyring } from 'npm:@pezkuwi/api@16.5.36';
import { cryptoWaitReady } from 'npm:@pezkuwi/util-crypto@14.0.25';
import * as bip39 from 'https://esm.sh/@scure/bip39@1.2.1';
import { wordlist } from 'https://esm.sh/@scure/bip39@1.2.1/wordlists/english';

// ── Bot configuration ───────────────────────────────────────────────
const BOT_TOKENS: Record<string, string> = {
  main: Deno.env.get('TELEGRAM_BOT_TOKEN') || '',
  krd: Deno.env.get('TELEGRAM_BOT_TOKEN_KRD') || '',
};

const MINI_APP_URLS: Record<string, string> = {
  main: 'https://telegram.pezkuwichain.io',
  krd: 'https://telegram.pezkiwi.app',
};

function getBotId(req: Request): string {
  const url = new URL(req.url);
  return url.searchParams.get('bot') || 'main';
}

// ── Welcome image ───────────────────────────────────────────────────
const WELCOME_IMAGE_URL =
  'https://raw.githubusercontent.com/pezkuwichain/pezkuwi-telegram-miniapp/main/public/images/welcome.png';

// ── Main bot (@Pezkuwichain_Bot) welcome ────────────────────────────
const MAIN_WELCOME_MESSAGE = `
🌍 <b>Welcome to PezkuwiChain!</b>

The first blockchain platform connecting Kurds worldwide — building a digital Kurdistan where borders don't limit our unity.

🔗 <b>One Chain. One Nation. One Future.</b>

Join millions of Kurds in creating a decentralized digital economy. Your wallet, your identity, your freedom.

<i>Bi hev re, em dikarin.</i>
<i>Together, we can.</i>
`;

// ── KRD bot (@pezkuwichainBot) welcome ──────────────────────────────
const KRD_WELCOME_MESSAGE = `
🌐 <b>Pezkuwî</b>

Bi Pezkuwî re dest bi rêwîtiya xwe ya dîjîtal bikin.
Cûzdanê xwe biafirînin, zimanê xwe hilbijêrin û welatiyê Pezkuwî bibin.

<i>Start your digital journey with Pezkuwi.
Create your wallet, choose your language and become a citizen.</i>
`;

// ── Types ────────────────────────────────────────────────────────────
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
    };
    message?: {
      chat: {
        id: number;
      };
    };
    data: string;
  };
}

// ── Telegram API helper ─────────────────────────────────────────────
async function sendTelegramRequest(token: string, method: string, body: Record<string, unknown>) {
  console.log(`[Telegram] Calling ${method}`, JSON.stringify(body));

  if (!token) {
    console.error('[Telegram] BOT_TOKEN is not set!');
    return { ok: false, error: 'BOT_TOKEN not configured' };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log(`[Telegram] Response:`, JSON.stringify(result));
  return result;
}

// ── Main bot: welcome ───────────────────────────────────────────────
async function sendMainWelcome(token: string, chatId: number) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Open App on Telegram',
          web_app: { url: MINI_APP_URLS.main },
        },
      ],
      [
        {
          text: '🤖 Play Store (Coming Soon)',
          callback_data: 'playstore_coming_soon',
        },
      ],
    ],
  };

  if (WELCOME_IMAGE_URL) {
    const result = await sendTelegramRequest(token, 'sendPhoto', {
      chat_id: chatId,
      photo: WELCOME_IMAGE_URL,
      caption: MAIN_WELCOME_MESSAGE,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    if (result.ok) return;
    console.log('[Bot] Photo failed, falling back to text');
  }

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: MAIN_WELCOME_MESSAGE,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

// ── KRD bot: welcome ────────────────────────────────────────────────
async function sendKrdWelcome(token: string, chatId: number) {
  const appUrl = MINI_APP_URLS.krd;

  const keyboard = {
    inline_keyboard: [
      // Row 1: Create Wallet (callback - bot generates wallet in chat)
      [
        {
          text: '🔐 Create Wallet / Cûzdan Biafirîne',
          callback_data: 'create_wallet',
        },
      ],
      // Row 2: Languages (top row)
      [
        { text: 'Kurmancî', web_app: { url: `${appUrl}/krd` } },
        { text: 'English', web_app: { url: `${appUrl}/en` } },
        { text: 'Türkçe', web_app: { url: `${appUrl}/tr` } },
      ],
      // Row 3: Languages (bottom row)
      [
        { text: 'سۆرانی', web_app: { url: `${appUrl}/ckb` } },
        { text: 'فارسی', web_app: { url: `${appUrl}/fa` } },
        { text: 'العربية', web_app: { url: `${appUrl}/ar` } },
      ],
      // Row 4: Be Citizen
      [
        {
          text: '🏛️ Be Citizen / Bibe Welatî',
          web_app: { url: `${appUrl}?page=citizen` },
        },
      ],
    ],
  };

  if (WELCOME_IMAGE_URL) {
    const result = await sendTelegramRequest(token, 'sendPhoto', {
      chat_id: chatId,
      photo: WELCOME_IMAGE_URL,
      caption: KRD_WELCOME_MESSAGE,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    if (result.ok) return;
    console.log('[Bot] Photo failed, falling back to text');
  }

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: KRD_WELCOME_MESSAGE,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

// ── Create wallet handler ───────────────────────────────────────────
async function handleCreateWallet(token: string, chatId: number) {
  try {
    await cryptoWaitReady();

    const mnemonic = bip39.generateMnemonic(wordlist, 128);
    const keyring = new Keyring({ type: 'sr25519' });
    const pair = keyring.addFromUri(mnemonic);
    const address = pair.address;

    const walletMessage = `
🔐 <b>Cûzdanê Te Hate Afirandin!</b>
<b>Your Wallet Has Been Created!</b>

📍 <b>Address / Navnîşan:</b>
<code>${address}</code>

🔑 <b>Seed Phrase (12 words):</b>
<code>${mnemonic}</code>

⚠️ <b>GIRÎNG / IMPORTANT:</b>
<i>Ev 12 peyvan binivîsin û li cihekî ewle bihêlin.
Kesî re nîşan nedin! Eger winda bikin, cûzdanê xwe winda dikin.

Write down these 12 words and keep them safe.
Never share them! If you lose them, you lose your wallet.</i>
`;

    await sendTelegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: walletMessage,
      parse_mode: 'HTML',
    });
  } catch (error) {
    console.error('[Bot] Wallet generation error:', error);
    await sendTelegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: '❌ Wallet creation failed. Please try again.',
    });
  }
}

// ── Callback handler ────────────────────────────────────────────────
async function handleCallbackQuery(
  token: string,
  callbackQueryId: string,
  data: string,
  chatId: number | undefined
) {
  if (data === 'create_wallet' && chatId) {
    await sendTelegramRequest(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: '🔐 Creating your wallet...',
    });
    await handleCreateWallet(token, chatId);
  } else if (data === 'playstore_coming_soon') {
    await sendTelegramRequest(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: '🚀 Android app coming soon! Stay tuned.',
      show_alert: true,
    });
  }
}

// ── Help & App commands ─────────────────────────────────────────────
async function sendHelpMessage(token: string, chatId: number, botId: string) {
  const appUrl = MINI_APP_URLS[botId] || MINI_APP_URLS.main;
  const helpText = `
<b>PezkuwiChain Bot Commands:</b>

/start - Show welcome message
/help - Show this help message
/app - Open the PezkuwiChain app

<b>Links:</b>
🌐 Website: pezkuwichain.io
📱 App: ${appUrl}
`;

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: helpText,
    parse_mode: 'HTML',
  });
}

async function sendAppLink(token: string, chatId: number, botId: string) {
  const appUrl = MINI_APP_URLS[botId] || MINI_APP_URLS.main;
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Open PezkuwiChain App',
          web_app: { url: appUrl },
        },
      ],
    ],
  };

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: 'Click below to open the app:',
    reply_markup: keyboard,
  });
}

// ── Main handler ────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const botId = getBotId(req);
    const botToken = BOT_TOKENS[botId] || BOT_TOKENS.main;
    const update: TelegramUpdate = await req.json();
    console.log(`[Bot:${botId}] Received update:`, JSON.stringify(update));

    // Handle message
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === '/start' || text.startsWith('/start ')) {
        if (botId === 'krd') {
          await sendKrdWelcome(botToken, chatId);
        } else {
          await sendMainWelcome(botToken, chatId);
        }
      } else if (text === '/help') {
        await sendHelpMessage(botToken, chatId, botId);
      } else if (text === '/app') {
        await sendAppLink(botToken, chatId, botId);
      }
    }

    // Handle callback query
    if (update.callback_query) {
      const chatId = update.callback_query.message?.chat?.id;
      await handleCallbackQuery(
        botToken,
        update.callback_query.id,
        update.callback_query.data,
        chatId
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing update:', error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
