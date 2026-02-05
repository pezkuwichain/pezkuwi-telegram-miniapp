# Supabase Kurulumu

## 1. Supabase Projesi Oluştur

1. https://supabase.com adresine git
2. "New Project" tıkla
3. Proje adı: `pezkuwi-telegram`
4. Database password oluştur (sakla!)
5. Region: Frankfurt (eu-central-1) - Türkiye'ye yakın

## 2. Database Schema Oluştur

Supabase Dashboard'da:

1. SQL Editor'e git
2. `supabase/migrations/001_initial_schema.sql` dosyasının içeriğini kopyala
3. "Run" tıkla
4. `supabase/migrations/002_rpc_functions.sql` dosyasının içeriğini kopyala
5. "Run" tıkla

## 3. API Keys Al

Settings > API:

- `Project URL` → VITE_SUPABASE_URL
- `anon public` key → VITE_SUPABASE_ANON_KEY

## 4. .env Dosyası Oluştur

```bash
cp .env.example .env
```

.env dosyasını düzenle:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 5. Edge Function Deploy (Telegram Auth)

```bash
# Supabase CLI yükle
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref YOUR_PROJECT_REF

# Secrets ekle
supabase secrets set TELEGRAM_BOT_TOKEN=your-bot-token

# Deploy
supabase functions deploy telegram-auth
```

## 6. Test

```bash
npm run dev
```

## Platform Entegrasyonu

Aynı Supabase projesi şu platformlarda kullanılacak:

| Platform              | Repo                     | Durum        |
| --------------------- | ------------------------ | ------------ |
| Telegram Mini App     | pezkuwi-telegram-miniapp | ✅ Hazır     |
| Web (pezkuwichain.io) | pwap                     | ⏳ Eklenecek |
| Android (pezWallet)   | pezWallet                | ⏳ Eklenecek |

Tüm platformlar aynı:

- Database
- Auth
- Real-time subscriptions
- RLS policies

kullanacak.
