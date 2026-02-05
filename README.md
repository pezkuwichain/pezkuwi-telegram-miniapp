# Pezkuwi Telegram Mini App

Telegram Mini App for Pezkuwichain - Forum, Announcements, Rewards, and Wallet integration.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui patterns
- **State**: TanStack Query (React Query)
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Testing**: Vitest + Testing Library
- **CI/CD**: GitHub Actions

## Getting Started

### Prerequisites

- Node.js >= 18
- npm >= 9
- Supabase account

### Installation

```bash
# Clone the repo
git clone https://github.com/pezkuwichain/pezkuwi-telegram-miniapp.git
cd pezkuwi-telegram-miniapp

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Add your Supabase credentials to .env
```

### Development

```bash
# Start dev server
npm run dev

# Run tests
npm run test

# Type check
npm run typecheck

# Lint
npm run lint

# Format code
npm run format

# Full validation (typecheck + lint + test + build)
npm run validate
```

### Build

```bash
npm run build
```

Output will be in `dist/` directory.

## Project Structure

```
src/
├── contexts/       # React contexts (Auth)
├── hooks/          # Custom hooks (Supabase, Telegram)
├── lib/            # Utilities (env, supabase client)
├── sections/       # Main app sections
│   ├── Announcements.tsx
│   ├── Forum.tsx
│   ├── Rewards.tsx
│   └── Wallet.tsx
├── test/           # Test setup
├── types/          # TypeScript types
├── App.tsx         # Main app component
└── main.tsx        # Entry point
```

## Database Schema

Tables (prefixed with `tg_` to avoid conflicts):

- `tg_users` - Telegram users
- `tg_announcements` - Admin announcements
- `tg_announcement_reactions` - Like/dislike reactions
- `tg_threads` - Forum threads
- `tg_thread_likes` - Thread likes
- `tg_replies` - Thread replies
- `tg_reply_likes` - Reply likes

## Environment Variables

| Variable                 | Description              |
| ------------------------ | ------------------------ |
| `VITE_SUPABASE_URL`      | Supabase project URL     |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |

## Telegram Setup

1. Create bot via @BotFather
2. Enable Mini App in bot settings
3. Set Mini App URL to deployment URL
4. Deploy `telegram-auth` Edge Function to Supabase

## License

MIT
