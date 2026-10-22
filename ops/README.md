# ops

Infrastructure that runs on the Supabase host, kept here rather than only on the
server.

## `supabase-deploy-functions` + `functions-registry.json`

The ownership gate for the shared edge-function volume on vps3.

Two projects deploy into one volume: this repo and `pwap-web`. Before the gate
existed, pwap-web rsynced its whole tree in, so whoever deployed last silently
overwrote any function name they happened to share. On 2026-06-28 that replaced
this project's `telegram-auth` with pwap-web's login-widget handler, and sign-in
— plus every wallet screen behind it — returned 401 for a month. Nothing failed
loudly, because the name still resolved; it just resolved to the wrong project's
code.

The gate is the only supported way to write into that volume. It refuses any
directory the calling project does not own, and refuses names absent from the
registry entirely, so a new collision cannot be introduced by accident.

```bash
supabase-deploy-functions --project <name> --src <dir> [--restart] [--dry-run]
```

- Validates every incoming directory **before writing anything** — a refused
  deploy leaves the volume untouched rather than half-updated
- Writes atomically per function, so a reader never sees a partial function
- Serialises with `flock`: two projects deploy here and both restart the same
  runtime. Without it, one deploy can recreate the container while another is
  mid-restart, which is what turned a successful deploy into a failed job on
  2026-07-30
- Retries the restart, and if it still fails, checks whether the runtime is
  actually up before reporting failure — a racing restart should not be reported
  as a broken deploy
- Logs every decision to `/var/log/supabase-function-deploys.log`

`rsync --delete` and wholesale copying into that volume are not acceptable.

### The registry

`functions-registry.json` records which project owns which function name. A new
function must be added here **before** it can be deployed — that is the point:
the gate refuses unknown names so a collision is caught at deploy time rather
than discovered a month later.

Current ownership: 21 names to this project, 12 to pwap-web, 2 to the platform
(`hello`, `main`).

`_hosted_elsewhere` lists functions that are not served from this volume:
`telegram-bot` and `ask`, which run in their own runtime (next section). The gate
refuses to deploy them here, and the audit reports any copy in the volume as
stale.

## The bots runtime (`bots/`)

`telegram-bot` (the webhook of all three Telegram bots) and `ask` (the assistant
behind news.pex.mom and ick.pezkiwi.app) run in a separate edge-runtime container
on vps3, `pezkuwi-bots`, from `/opt/pezkuwi-bots`. Until 2026-10-22 they ran on
the free cloud project `vbhftvdayqfmcgmzdxfv`, which paused itself after a quiet
week and took every bot down with it.

They are not in the shared runtime for two reasons. It verifies a JWT on every
request and Telegram cannot send one; and it holds the platform's wallet keys,
which a public bot that feeds user text to a language model should not sit next
to. This runtime holds only the keys the two functions read (listed in
`bots/docker-compose.yml`), and each function checks its own callers:
`telegram-bot` refuses any update without Telegram's secret-token header
(`TELEGRAM_WEBHOOK_SECRET`, set on every webhook with `secret_token`), `ask`
keeps its per-IP limit.

nginx sends `supabase.pezkuwichain.io/functions/v1/{telegram-bot,ask}` to it
(`bots/nginx-locations.conf`), so the public URLs did not change shape.

Install (root, on vps3), once:

```bash
mkdir -p /opt/pezkuwi-bots/functions
install -m 644 bots/docker-compose.yml /opt/pezkuwi-bots/
install -m 600 /dev/null /opt/pezkuwi-bots/.env      # then fill it, values via stdin only
install -m 644 bots/nginx-locations.conf /etc/nginx/snippets/pezkuwi-bots.conf
# in the supabase.pezkuwichain.io server block, before `location /`:
#   include /etc/nginx/snippets/pezkuwi-bots.conf;
```

CI then ships the code with `bots-deploy` (below): it replaces exactly `main`,
`telegram-bot` and `ask` under `/opt/pezkuwi-bots/functions`, restarts the
container, and fails unless `telegram-bot` comes back refusing an unsigned update.

**pwap-web depends on this file too.** It is versioned here because this project
owns the larger share and the gate was built for its incident, but a pwap-web
change that adds a function needs a PR here first. That is deliberate friction:
the registry is the record of who owns what, and it should not be edited on the
server where nobody can see the change.

### Deployment

The gate and its registry guard every project's functions in the shared
volume, so no project's CI installs them; that would let one project rewrite
the rule that protects the others. Root installs them from this directory:

```bash
install -o root -g root -m 755 ops/supabase-deploy-functions /usr/local/bin/
install -o root -g root -m 644 ops/functions-registry.json /opt/supabase-self-hosted/
```

They are still versioned here, not edited in place on the server: before
2026-07 the script existed only at `/usr/local/bin` — one copy, no history, no
review. `deploy.yml` checks the host's copies against these files (`gate-sha`)
and refuses to deploy functions while they differ.

## `host/`: what the deploy keys can do

CI reaches vps3 as `miniapp-deploy`, with two keys. Neither opens a shell: each
is pinned in `authorized_keys` to one script here (`restrict,command=`).

| key (secret) | forced command | input |
|---|---|---|
| `MINIAPP_SITE_DEPLOY_KEY` | `miniapp-site-receive` | site tar on stdin → `/var/www/telegram.pezkiwi.app`; removes earlier builds' assets after four hours, never the new build's |
| `MINIAPP_FUNCTIONS_DEPLOY_KEY` | `miniapp-functions-ssh` → sudo `miniapp-functions-deploy` | `gate-sha`; `deploy` with functions.tgz on stdin; `bots-deploy` with bots.tgz on stdin |

Install (root, on vps3):

```bash
install -o root -g root -m 755 ops/host/miniapp-* /usr/local/sbin/
useradd --system --create-home --shell /bin/bash miniapp-deploy
chown -R miniapp-deploy:miniapp-deploy /var/www/telegram.pezkiwi.app
# /etc/sudoers.d/miniapp-functions-deploy
miniapp-deploy ALL=(root) NOPASSWD: /usr/local/sbin/miniapp-functions-deploy deploy, /usr/local/sbin/miniapp-functions-deploy gate-sha, /usr/local/sbin/miniapp-functions-deploy bots-deploy
# ~miniapp-deploy/.ssh/authorized_keys
restrict,command="/usr/local/sbin/miniapp-site-receive" ssh-ed25519 ... miniapp-ci-site-deploy
restrict,command="/usr/local/sbin/miniapp-functions-ssh" ssh-ed25519 ... miniapp-ci-functions-deploy
```

`host/test-site-receive.sh` runs the site script against a scratch web root,
including what it must refuse; CI runs it with shellcheck.

## `apply-repo-settings.sh`

This repo's branch protection, as code. See the header in that file; run
`--check` to report drift without changing anything.

Note: every CI job is listed individually because this repo has no aggregate gate
job, so a renamed job silently drops a requirement. An aggregate job (as pwap-web
has with `CI Gate ✅`) would be sturdier.
