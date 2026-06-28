/**
 * PezkuwiChain Telegram Bot - Supabase Edge Function
 * Handles webhook updates from three separate bots:
 *   - @Pezkuwichain_Bot  (main) → telegram.pezkuwichain.io
 *   - @pezkuwichainBot   (krd)  → telegram.pezkiwi.app
 *   - @DKSKurdistanBot   (dks)  → AI assistant powered by Claude
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
  dks: Deno.env.get('TELEGRAM_BOT_TOKEN_DKS') || '',
};

const MINI_APP_URLS: Record<string, string> = {
  main: 'https://telegram.pezkuwichain.io',
  krd: 'https://telegram.pezkiwi.app',
  dks: 'https://telegram.pezkiwi.app',
};

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
// AI provider: Groq (free) is primary; Claude is fallback when it has credit.
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';

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

🤖 Dijital Kurdistan AI agentıyla sohbet etmek ve daha detaylı bilgi almak için → @DKSkurdistanBot
<i>Chat with Digital Kurdistan AI agent for more info → @DKSkurdistanBot</i>
`;

// ── DKS bot (@DKSKurdistanBot) welcome ──────────────────────────────
const DKS_WELCOME_MESSAGE = `
🤖 <b>PezkuwiChain (DijitalKurdistan)</b>

Ez alîkarê zîrek ê PezkuwiChain im. Hûn dikarin bi her zimanî ji min re bipirsin:

• PezkuwiChain çi ye?
• Token'ên HEZ û PEZ çawa dixebitin?
• TNPoS çi ye?
• Çawa dibim welatî?
• Staking çawa ye?

Eger hûn veberhêner in, an jî ji bo pêşveçûna DijitalKurdistan ramanek we heye, ez dikarim we bi kesê têkildar re têkildar bikim.

<i>I am the PezkuwiChain AI assistant. Ask me anything about PezkuwiChain in any language!

If you are an investor, or have an idea for the development of DijitalKurdistan, I can connect you with the right person.</i>
`;

// ── Claude AI System Prompt (PezkuwiChain Whitepaper Knowledge) ─────
const CLAUDE_SYSTEM_PROMPT = `You are the official PezkuwiChain AI Assistant on Telegram. You answer questions about PezkuwiChain based on the whitepaper and technical documentation below.

RULES:
- Answer in the SAME LANGUAGE the user writes in. If they write in Kurdish (Kurmancî), answer in Kurdish. If Turkish, answer in Turkish. If English, answer in English. If Arabic, answer in Arabic. If Persian, answer in Persian.
- Be concise — Telegram messages should be short and readable.
- Use plain text, no markdown headers. You can use bold with *text* sparingly.
- If you don't know something, say so honestly.
- Never make up information not in the whitepaper.
- You represent PezkuwiChain officially — be professional and helpful.
- Do not discuss other blockchain projects comparatively unless asked.
- For technical questions about source code, direct users to: github.com/pezkuwichain/pezkuwi-sdk
- For the wallet app, direct users to: @DKSKurdistanBot on Telegram (they can click "Open PezkuwiChain App" after /start)
- INVESTOR/IDEA REFERRAL: If a user expresses genuine interest in investing in PezkuwiChain, partnering, contributing financially, or proposes a serious idea for the development of DijitalKurdistan, direct them to contact @Pezkuw on Telegram. Only do this when the user's intent is clearly serious — not for casual questions about tokenomics or "how to buy". Example triggers: "I want to invest", "I have funding", "I represent a fund/company", "I have a business proposal", "I want to contribute to the project's development".

PEZKUWICHAIN WHITEPAPER v5.0 — KNOWLEDGE BASE:

PezkuwiChain is a Layer-1 blockchain built on the Pezkuwi SDK (828 crates forked from Polkadot SDK stable2512). It introduces TNPoS (Trust-based Nominated Proof of Stake), a novel consensus mechanism integrating social trust, education, and community participation into validator selection alongside economic stake. Launched mainnet in January 2026.

ARCHITECTURE — Three-Chain System:
1. Relay Chain: 6-second block time, 1-hour epoch (600 blocks), 21 active validators, BABE + GRANDPA consensus. Native token: HEZ.
2. Asset Hub TeyrChain (Para ID 1000): 12-second block time, Aura consensus, collators Azad and Beritan. Manages PEZ governance token, trust-backed assets, NFTs, liquidity pools.
3. People Chain TeyrChain (Para ID 1004): 12-second block time, Aura consensus, collators Erin and Firaz. Manages identity, citizenship, trust scoring, education, governance.

Technology: Rust (98.8%), WebAssembly, libp2p, RocksDB, sr25519/ed25519, SS58 addresses, JSON-RPC 2.0.

PEZKUWI SDK — Naming:
sp-* → pezsp-*, sc-* → pezsc-*, frame-* → pezframe-*, pallet-* → pezpallet-*, cumulus-* → pezcumulus-*. Substrate → Bizinikiwi, Parachain → TeyrChain, Westend → Zagros testnet. 7,364 Rust source files, 1,926 dependencies.

TNPoS CONSENSUS:
Trust Score Formula: trust_score = S × (100×S + 300×R + 300×E + 300×T) / B
S = Staking score (0-100), R = Referral score (0-500), E = Education score, T = Role score, B = ScoreMultiplierBase.
If S = 0, trust score = 0. Social components carry 9x the weight of pure staking.

Staking Score: Based on HEZ bonded + duration. 1-100 HEZ: 20pts, 101-250: 30pts, 251-750: 40pts, 751+: 50pts. Duration multiplier 1.0x (<1 month) to 2.0x (12+ months).
Referral Score: 0 referrals: 0pts. 1-10: count×10. 11-50: 100+(count-10)×5. 51-100: 300+(count-50)×4. 101+: 500 max.
Education Score: On-chain courses via pezpallet-perwerde. IPFS-linked content, verified completion.
Role Score: Soulbound NFT roles via pezpallet-tiki. 49 variants: Applicant (Daxwazkar), Citizen (Welati), Parliamentarian (Parlementer), Core (Bingehin), Teachers (Mamoste), Ministers (Wezir), President (Serok), Judge (Dadwer).

Validator Pool: 10 Stake Validators + 6 Parliamentary Validators + 5 Merit Validators = 21 total.

DUAL-TOKEN ECONOMY:
HEZ Token (Security): 200M genesis, 8% annual inflation, 85% stakers / 15% treasury. 12 decimals (TYR base unit).
Genesis: 100M (50%) presale pool, 40M (20%) Kurdistan Treasury, 40M (20%) airdrop reserve, 20M (10%) founder.
Fee: 80% treasury, 20% block author. Tips: 100% block author.

PEZ Token (Governance): 5 billion fixed supply, 96.25% treasury, 48-month halving.
Genesis: 4,812,500,000 PEZ (96.25%) treasury, 93,750,000 PEZ (1.875%) presale, 93,750,000 PEZ (1.875%) founder.
Halving: Cycle 1 (2026-2030): 100%, Cycle 2: 50%, Cycle 3: 25%, Cycle 4: 12.5%, Cycle 5: 6.25%.
PEZ Rewards: Monthly epochs (432,000 blocks). user_reward = (user_trust_score / total_trust_scores) × epoch_reward_pool.

Presale: 2% tx fee: 50% treasury, 25% burned, 25% staking rewards.

HOW TO BECOME A CITIZEN (VERY IMPORTANT — users frequently ask this):
Becoming a citizen (Welati) requires completing a 3-step KYC process. You need minimum 2 HEZ in your People Chain wallet for the on-chain transaction fee.

Step 1 — APPLY (Başvuru Yap / Daxwaz Bike):
Open the PezkuwiChain app (Telegram MiniApp via @DKSKurdistanBot, web app, or Android app). Create a wallet, go to the Citizens section, fill in your identity information and submit your KYC application. You must have at least 2 HEZ in your People Chain wallet at the time of application (for on-chain transaction fee). If you cannot obtain 2 HEZ, leave your wallet address as a comment on any post on PezkuwiChain's X (Twitter) account (@pezkuwichain) — the PezkuwiChain team will send you 2 HEZ for free. Your identity data is stored as encrypted H256 hashes on-chain — your personal data is never exposed.

Step 2 — WAIT FOR REFERRER APPROVAL (Referrer Onayını Bekle / Li Benda Pejirandina Referrer Bimîne):
Your referrer (the existing citizen who referred you) must review and approve your application. The referrer validates your identity off-chain and confirms on-chain. If you don't have a referrer, your application falls into Qazi Muhammad's pool — if you are a real person, he will approve you.

Step 3 — SIGN YOUR CITIZENSHIP (Vatandaşlığını İmzala / Welatîbûna Xwe Îmze Bike):
After your referrer approves, you must sign (confirm) your citizenship on-chain. Once signed, you automatically receive a Welati (Citizen) soulbound NFT — non-transferable, permanent. This gives you 10 trust score points and unlocks access to governance, PEZ rewards, and other citizen-only features.

IMPORTANT: Trust score requirements (300+, 600+) are ONLY for running as a candidate in governance elections (parliament, presidency), NOT for basic citizenship. Any person can become a citizen through the 3-step KYC process above.

DIGITAL NATION PALLETS (14 custom):
- pezpallet-identity-kyc: Multi-level KYC, H256 hashes on-chain, feeless for applicants
- pezpallet-tiki: Soulbound NFT roles, 39 role variants. Full list with trust score bonuses:
  GOVERNANCE: Serok/President (200pts, unique, elected), SerokWeziran/Prime Minister (125pts, appointed), SerokiMeclise/Speaker of Parliament (150pts, unique, elected), Parlementer/Parliament Member (100pts, elected)
  JUDICIARY: EndameDiwane/Constitutional Court Member (175pts), Dadger/Judge (150pts), Dozger/Prosecutor (120pts), Hiquqnas/Lawyer (75pts)
  MINISTERS (all 100pts, appointed): Wezir (generic), WezireDarayiye/Finance, WezireParez/Defense, WezireDad/Justice, WezireBelaw/Communications, WezireTend/Health, WezireAva/Construction, WezireCand/Culture
  SENIOR OFFICIALS: Xezinedar/Treasurer (100pts, unique), PisporêEwlehiyaSîber/Cybersecurity Expert (100pts), Mufetîs/Inspector (90pts), Balyoz/Ambassador (80pts, unique), Berdevk/Spokesperson (70pts)
  EDUCATION & COMMUNITY: Mamoste/Teacher (70pts, earned), Perwerdekar/Educator (40pts), Rewsenbîr/Intellectual (40pts, earned), Mela/Cleric (50pts), Feqî/Student Scholar (50pts)
  EXPERTS: Axa/Elder Expert (250pts, earned), RêveberêProjeyê/Project Manager (250pts), Pêseng/Pioneer (80pts), Hekem/Wise (30pts), Sêwirmend/Counselor (20pts)
  COMMUNITY: SerokêKomele/Community Leader (100pts, earned), ModeratorêCivakê/Community Moderator (200pts, earned)
  TECHNICAL: OperatorêTorê/Network Operator (60pts), GerinendeyeCavkaniye/Resource Manager (40pts), GerinendeyeDaneye/Data Manager (40pts), KalîteKontrolker/QA (30pts)
  ECONOMIC: Bazargan/Merchant (60pts), Navbeynkar/Mediator (30pts)
  ADMINISTRATIVE: Qeydkar/Registrar (25pts), Noter/Notary (50pts), Bacgir/Tax Collector (50pts), ParêzvaneÇandî/Cultural Protector (25pts)
  BASE: Welati/Citizen (10pts, automatic after KYC)
  Role assignment types: Automatic (Welati - after KYC), Elected (Serok, Parlementer, SerokiMeclise), Earned (Axa, Mamoste, Rewsenbîr, SerokêKomele, ModeratorêCivakê), Appointed (all others - by admin)
- pezpallet-trust: Central trust scoring
- pezpallet-referral: Community growth with accountability
- pezpallet-staking-score: Time-weighted reputation
- pezpallet-perwerde: On-chain education (courses, enrollment, points)
- pezpallet-welati: Governance — Parliament (201 seats), Presidency, Constitutional Court (Diwan), Cabinet (9 ministers)
- pezpallet-pez-treasury: PEZ reserves with halving
- pezpallet-presale: Token sales
- pezpallet-token-wrapper: 1:1 HEZ/wHEZ wrapping
- pezpallet-pez-rewards: Trust-based distribution
- pezpallet-validator-pool: TNPoS categorization
- pezpallet-staking-async: Async staking on Asset Hub

GOVERNANCE (for elected positions — NOT for basic citizenship):
Parliament (Meclis): 201 seats via election. Presidency (Serok): 50%+ required. Constitutional Court (Diwan). Cabinet: 9 ministers.
Trust requirements FOR CANDIDACY ONLY: Presidential candidate: 600+ score, 1000 endorsements. Parliamentary candidate: 300+ score, 100 endorsements.
These are NOT requirements for becoming a citizen. Any person can become a citizen for free.
Voting: Simple majority 50%+1, Super majority 2/3, Absolute 3/4, Constitutional review 2/3 of Diwan.

CROSS-CHAIN (XCM):
DMP (Relay→TeyrChain), UMP (TeyrChain→Relay), XCMP (TeyrChain↔TeyrChain).
Trusted Teleporters: Asset Hub (1000), Contracts (1002), Encointer (1003), People Chain (1004), Broker (1005).

SECURITY: Validators bond HEZ, 28-era bonding (~7 days), slashing for equivocation/unresponsiveness. KYC = Sybil resistance. Rust memory safety, WASM sandboxing, forkless upgrades.

ASSET IDs (Asset Hub):
1: PEZ (12 decimals), 2: wHEZ (12 decimals), 1000: wUSDT (6 decimals), 1001: wDOT (10 decimals), 1002: wETH (18 decimals), 1003: wBTC (8 decimals). Native: HEZ (12 decimals).

RPC Endpoints:
Relay Chain: wss://rpc.pezkuwichain.io
Asset Hub: wss://asset-hub-rpc.pezkuwichain.io
People Chain: wss://people-rpc.pezkuwichain.io

LINKS:
Website: pezkuwichain.io
GitHub: github.com/pezkuwichain/pezkuwi-sdk
Discord: discord.gg/Y3VyEC6h8W
Telegram Channel: t.me/dijitalkurdistan
Telegram App: @DKSKurdistanBot

PROBLEM SOLVED: Over 100 million stateless people. Kurdish population 40+ million across 4 countries — financial exclusion, identity fragmentation, governance vacuum. PezkuwiChain provides digital nation-state infrastructure.

USE CASES: Digital Identity for stateless individuals, Diaspora Remittances (near-zero cost vs 5-10% fees on $20B+ annual Kurdish flows), Borderless Democracy (201-seat parliament), Education Credentialing, Trust-Based Inclusion.

ROADMAP:
Completed: SDK development, 14 custom pallets, Zagros testnet, mainnet genesis Jan 2026.
Current: TeyrChain activation, collator configuration, HRMP channels.
Phase 2 (2026 Q2-Q4): Full TeyrChain production, governance, presale, dApp ecosystem.
Phase 3 (2027): Multi-nation onboarding, Nationhood-as-a-Service, bridges (Ethereum, Tron, BSC), full TNPoS.
Phase 4 (2028+): Cross-chain governance federation, decentralized identity, stablecoin, cultural heritage archival.

License: Apache 2.0, Copyright 2026 Kurdistan Tech Institute. Lead Architect: SatoshiQaziMuhammed.`;

// ── Claude AI chat handler ──────────────────────────────────────────
async function handleAIChat(token: string, chatId: number, userMessage: string, userName: string) {
  if (!ANTHROPIC_API_KEY) {
    await sendTelegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: 'AI assistant is being configured. Please try again later.',
    });
    return;
  }

  // Send typing indicator
  await sendTelegramRequest(token, 'sendChatAction', {
    chat_id: chatId,
    action: 'typing',
  });

  try {
    // Primary provider: Groq (free). Fallback: Claude when it has credit.
    let aiReply: string | null = null;

    if (GROQ_API_KEY) {
      try {
        const gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + GROQ_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.3,
            max_tokens: 900,
            messages: [
              { role: 'system', content: CLAUDE_SYSTEM_PROMPT },
              { role: 'user', content: userMessage },
            ],
          }),
        });
        if (gr.ok) {
          const gd = await gr.json();
          aiReply = gd.choices?.[0]?.message?.content || null;
        } else {
          console.error('[AI] Groq error:', gr.status, await gr.text());
        }
      } catch (e) {
        console.error('[AI] Groq exception:', e);
      }
    }

    if (!aiReply && ANTHROPIC_API_KEY) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: CLAUDE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        }),
      });
      if (response.ok) {
        const result = await response.json();
        aiReply = result.content?.[0]?.text || null;
      } else {
        console.error('[AI] Claude API error:', response.status, await response.text());
      }
    }

    if (!aiReply) {
      await sendTelegramRequest(token, 'sendMessage', {
        chat_id: chatId,
        text: 'Sorry, I could not process your question right now. Please try again.',
      });
      return;
    }

    // Telegram message limit is 4096 chars
    if (aiReply.length <= 4096) {
      await sendTelegramRequest(token, 'sendMessage', {
        chat_id: chatId,
        text: aiReply,
      });
    } else {
      // Split into chunks
      for (let i = 0; i < aiReply.length; i += 4000) {
        await sendTelegramRequest(token, 'sendMessage', {
          chat_id: chatId,
          text: aiReply.substring(i, i + 4000),
        });
      }
    }
  } catch (error) {
    console.error('[AI] Error:', error);
    await sendTelegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: 'An error occurred. Please try again later.',
    });
  }
}

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
          web_app: { url: `${appUrl}/citizens` },
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

// ── DKS bot: welcome ────────────────────────────────────────────────
async function sendDksWelcome(token: string, chatId: number) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: '📱 Open PezkuwiChain App',
          web_app: { url: MINI_APP_URLS.dks },
        },
      ],
      [
        {
          text: '📢 Join Channel / Kanalê Tev Bibin',
          url: 'https://t.me/dijitalkurdistan',
        },
      ],
    ],
  };

  if (WELCOME_IMAGE_URL) {
    const result = await sendTelegramRequest(token, 'sendPhoto', {
      chat_id: chatId,
      photo: WELCOME_IMAGE_URL,
      caption: DKS_WELCOME_MESSAGE,
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
    if (result.ok) return;
    console.log('[Bot] Photo failed, falling back to text');
  }

  await sendTelegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text: DKS_WELCOME_MESSAGE,
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

  if (botId === 'dks') {
    const helpText = `
<b>PezkuwiChain AI Assistant</b>

Just type your question in any language and I'll answer!

/start - Show welcome message
/help - Show this help message

<b>Links:</b>
🌐 Website: pezkuwichain.io
📢 Channel: t.me/dijitalkurdistan
💬 Discord: discord.gg/Y3VyEC6h8W
`;
    await sendTelegramRequest(token, 'sendMessage', {
      chat_id: chatId,
      text: helpText,
      parse_mode: 'HTML',
    });
    return;
  }

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
      const userName = update.message.from?.first_name || 'User';

      if (text === '/start' || text.startsWith('/start ')) {
        if (botId === 'krd') {
          await sendKrdWelcome(botToken, chatId);
        } else if (botId === 'dks') {
          await sendDksWelcome(botToken, chatId);
        } else {
          await sendMainWelcome(botToken, chatId);
        }
      } else if (text === '/help') {
        await sendHelpMessage(botToken, chatId, botId);
      } else if (text === '/app') {
        await sendAppLink(botToken, chatId, botId);
      } else if (botId === 'dks' && !text.startsWith('/')) {
        // DKS bot: forward non-command messages to Claude AI
        await handleAIChat(botToken, chatId, text, userName);
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
