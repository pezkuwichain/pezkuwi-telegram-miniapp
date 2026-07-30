/**
 * PezkuwiChain Telegram Bot - Supabase Edge Function
 *
 * Serves @pezkuwichainBot, which opens the mini app at telegram.pezkiwi.app.
 *
 * This used to route three bots by a ?bot= query param. The other two are gone:
 * the `main` slot was the retired testnet bot and still pointed at
 * telegram.pezkuwichain.io, whose DNS record no longer exists, and `dks` was
 * @DKSKurdistanBot, whose token was revoked on 2026-07-19. Both were dead
 * paths, and `main` was the default, so an unqualified webhook call answered
 * /start with a link that could not resolve.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Keyring } from 'npm:@pezkuwi/api@16.5.36';
import { cryptoWaitReady } from 'npm:@pezkuwi/util-crypto@14.0.25';
import * as bip39 from 'https://esm.sh/@scure/bip39@1.2.1';
import { wordlist } from 'https://esm.sh/@scure/bip39@1.2.1/wordlists/english';

// ── Bot configuration ───────────────────────────────────────────────
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';

const MINI_APP_URL = 'https://telegram.pezkiwi.app';

// ── Welcome image ───────────────────────────────────────────────────
const WELCOME_IMAGE_URL =
  'https://raw.githubusercontent.com/pezkuwichain/pezkuwi-telegram-miniapp/main/public/images/welcome.png';

// ── Welcome message ─────────────────────────────────────────────────
const WELCOME_MESSAGE = `
🌐 <b>Pezkuwî</b>

Bi Pezkuwî re dest bi rêwîtiya xwe ya dîjîtal bikin.
Cûzdanê xwe biafirînin, zimanê xwe hilbijêrin û welatiyê Pezkuwî bibin.

<i>Start your digital journey with Pezkuwi.
Create your wallet, choose your language and become a citizen.</i>
`;

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

// ── Welcome ─────────────────────────────────────────────────────────
async function sendWelcome(token: string, chatId: number) {
  const appUrl = MINI_APP_URL;

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
          web_app: { url: `${appUrl}/citizens` },
        },
      ],
      // Row 5: Exchange
      [
        {
          text: '💱 Buy/Sell Crypto — PEX.network',
          url: 'https://pex.network',
        },
      ],
    ],
  };

  if (WELCOME_IMAGE_URL) {
    const result = await sendTelegramRequest(token, 'sendPhoto', {
      chat_id: chatId,
      photo: WELCOME_IMAGE_URL,
      caption: WELCOME_MESSAGE,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    if (result.ok) return;
    console.log('[Bot] Photo failed, falling back to text');
  }

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: WELCOME_MESSAGE,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

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
    // Legacy button on old messages - the app is live now, send the real link
    await sendTelegramRequest(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: '🚀 The Android app is live on Google Play!',
      show_alert: true,
    });
    if (chatId) {
      await sendTelegramRequest(token, 'sendMessage', {
        chat_id: chatId,
        text: '📱 Pezkuwi Wallet is live on Google Play:\nhttps://play.google.com/store/apps/details?id=io.pezkuwichain.wallet',
      });
    }
  }
}

// ── Help & App commands ─────────────────────────────────────────────
async function sendHelpMessage(token: string, chatId: number) {
  const helpText = `
<b>PezkuwiChain Bot Commands:</b>

/start - Show welcome message
/help - Show this help message
/app - Open the PezkuwiChain app

<b>Links:</b>
🌐 Website: pezkuwichain.io
📱 App: ${MINI_APP_URL}
💱 Buy/Sell Crypto: pex.network
📢 Channel: https://t.me/+DUWJ8wtt5qI4Njgy
📱 Android App: https://play.google.com/store/apps/details?id=io.pezkuwichain.wallet
💬 Discord: discord.gg/Y3VyEC6h8W
`;

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: helpText,
    parse_mode: 'HTML',
  });
}

async function sendAppLink(token: string, chatId: number) {
  const appUrl = MINI_APP_URL;
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
    const botToken = BOT_TOKEN;
    const update: TelegramUpdate = await req.json();
    console.log('[Bot] Received update:', JSON.stringify(update));

    // Handle message
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === '/start' || text.startsWith('/start ')) {
        await sendWelcome(botToken, chatId);
      } else if (text === '/help') {
        await sendHelpMessage(botToken, chatId);
      } else if (text === '/app') {
        await sendAppLink(botToken, chatId);
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
