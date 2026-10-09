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

`_cloud_hosted` lists functions that live on the **cloud** Supabase project
(`vbhftvdayqfmcgmzdxfv`), not on vps3: `telegram-bot` and `ask`. Both Telegram
bots reach the cloud project by webhook, and news.pex.mom's assistant calls `ask`
there. Stale copies of both sit in the vps3 volume from before that split and
serve no traffic — deploying them here updates a dead copy while the live one
keeps running whatever was last pushed by hand.

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
| `MINIAPP_FUNCTIONS_DEPLOY_KEY` | `miniapp-functions-ssh` → sudo `miniapp-functions-deploy` | `gate-sha`, or `deploy` with functions.tgz on stdin |

Install (root, on vps3):

```bash
install -o root -g root -m 755 ops/host/miniapp-* /usr/local/sbin/
useradd --system --create-home --shell /bin/bash miniapp-deploy
chown -R miniapp-deploy:miniapp-deploy /var/www/telegram.pezkiwi.app
# /etc/sudoers.d/miniapp-functions-deploy
miniapp-deploy ALL=(root) NOPASSWD: /usr/local/sbin/miniapp-functions-deploy deploy, /usr/local/sbin/miniapp-functions-deploy gate-sha
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
