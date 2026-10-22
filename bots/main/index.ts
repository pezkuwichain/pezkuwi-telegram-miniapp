// Router for the bots runtime on vps3 (container pezkuwi-bots, /opt/pezkuwi-bots).
//
// It serves exactly two functions: telegram-bot (the webhook of all three
// Telegram bots) and ask (the assistant behind news.pex.mom and ick.pezkiwi.app).
// They live apart from the shared Supabase functions runtime for two reasons:
// that runtime verifies a JWT on every request and Telegram cannot send one, and
// it holds the platform's wallet keys, which a public bot that feeds user text
// to a language model has no business sitting next to. Each function
// authenticates its own callers: telegram-bot by Telegram's secret-token header,
// ask by its per-IP limit and proxy key.

const SERVED = new Set(['telegram-bot', 'ask']);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  const name = new URL(req.url).pathname.split('/')[1] || '';
  if (!SERVED.has(name)) return json({ msg: 'not found' }, 404);

  const env = Deno.env.toObject();
  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath: `/home/deno/functions/${name}`,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.keys(env).map((k) => [k, env[k]]),
    });
    return await worker.fetch(req);
  } catch (e) {
    console.error(`[bots] ${name} failed to start:`, e);
    return json({ msg: 'internal error' }, 500);
  }
});
