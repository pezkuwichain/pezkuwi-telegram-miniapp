/**
 * PezkuwiChain Telegram Bot - Supabase Edge Function
 * Handles webhook updates from Telegram
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const MINI_APP_URL = 'https://telegram.pezkuwichain.io';

// Welcome image URL (hosted on GitHub)
const WELCOME_IMAGE_URL =
  'https://raw.githubusercontent.com/pezkuwichain/pezkuwi-telegram-miniapp/main/public/images/welcome.png';

const WELCOME_MESSAGE = `
🌍 <b>Welcome to PezkuwiChain!</b>

The first blockchain platform connecting Kurds worldwide — building a digital Kurdistan where borders don't limit our unity.

🔗 <b>One Chain. One Nation. One Future.</b>

Join millions of Kurds in creating a decentralized digital economy. Your wallet, your identity, your freedom.

<i>Bi hev re, em dikarin.</i>
<i>Together, we can.</i>
`;

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
    data: string;
  };
}

// Send message via Telegram API
async function sendTelegramRequest(method: string, body: Record<string, unknown>) {
  console.log(`[Telegram] Calling ${method}`, JSON.stringify(body));

  if (!BOT_TOKEN) {
    console.error('[Telegram] BOT_TOKEN is not set!');
    return { ok: false, error: 'BOT_TOKEN not configured' };
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  console.log(`[Telegram] Response:`, JSON.stringify(result));

  return result;
}

// Send welcome message with photo
async function sendWelcomeMessage(chatId: number) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Open App on Telegram',
          web_app: { url: MINI_APP_URL },
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

  // Try to send photo with caption
  if (WELCOME_IMAGE_URL) {
    const result = await sendTelegramRequest('sendPhoto', {
      chat_id: chatId,
      photo: WELCOME_IMAGE_URL,
      caption: WELCOME_MESSAGE,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    if (result.ok) return;
    console.log('[Bot] Photo failed, falling back to text');
  }

  // Send text-only message
  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: WELCOME_MESSAGE,
    parse_mode: 'HTML',
    reply_markup: keyboard,
  });
}

// Handle callback query (button clicks)
async function handleCallbackQuery(callbackQueryId: string, data: string) {
  if (data === 'playstore_coming_soon') {
    await sendTelegramRequest('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: '🚀 Android app coming soon! Stay tuned.',
      show_alert: true,
    });
  }
}

// Send help message
async function sendHelpMessage(chatId: number) {
  const helpText = `
<b>PezkuwiChain Bot Commands:</b>

/start - Show welcome message
/help - Show this help message
/app - Open the PezkuwiChain app

<b>Links:</b>
🌐 Website: pezkuwichain.io
📱 App: t.me/pezkuwichain_bot/app
🐦 Twitter: @pezkuwichain
`;

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: helpText,
    parse_mode: 'HTML',
  });
}

// Send app link
async function sendAppLink(chatId: number) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Open PezkuwiChain App',
          web_app: { url: MINI_APP_URL },
        },
      ],
    ],
  };

  await sendTelegramRequest('sendMessage', {
    chat_id: chatId,
    text: 'Click below to open the app:',
    reply_markup: keyboard,
  });
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const update: TelegramUpdate = await req.json();
    console.log('[Bot] Received update:', JSON.stringify(update));

    // Handle message
    if (update.message?.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;

      if (text === '/start' || text.startsWith('/start ')) {
        await sendWelcomeMessage(chatId);
      } else if (text === '/help') {
        await sendHelpMessage(chatId);
      } else if (text === '/app') {
        await sendAppLink(chatId);
      }
    }

    // Handle callback query (button clicks)
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query.id, update.callback_query.data);
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
