-- Rate-limit ledger for the public `ask` edge function (news.pex.mom assistant).
--
-- `ask` is unauthenticated and sends `Access-Control-Allow-Origin: *`, so this
-- table is its only throttle: 8 requests per IP per minute, 120 per day. The
-- limiter counts rows here and fails open when the count cannot be read, which
-- means shipping `ask` without this table would leave a public endpoint calling
-- paid model APIs with no limit at all.

create table if not exists public.ai_chat_log (
  id         bigserial primary key,
  ip         text        not null,
  created_at timestamptz not null default now()
);

-- The limiter always filters on both columns together (ip = ? and created_at >= ?).
create index if not exists ai_chat_log_ip_created_at_idx
  on public.ai_chat_log (ip, created_at desc);

-- Only the service role touches this table; the function reaches it through
-- PostgREST with the service key, which bypasses RLS. Enabling RLS without any
-- policy therefore keeps the behaviour intact while denying anon and
-- authenticated clients, who have no reason to read a table of IP addresses.
alter table public.ai_chat_log enable row level security;

revoke all on public.ai_chat_log from anon, authenticated;

comment on table public.ai_chat_log is
  'Rate-limit ledger for the public ask endpoint. Holds IP addresses; prune rows older than the 24h window the limiter uses.';
