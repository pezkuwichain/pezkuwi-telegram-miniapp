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

`.github/workflows/deploy.yml` copies both to the host on every deploy, so the
server copy is replaced from version control rather than edited in place. Before
this, the script existed only at `/usr/local/bin/supabase-deploy-functions` — one
copy, no history, no review, and gone with the server. The mechanism built to
stop silent drift was itself drifting.

## `apply-repo-settings.sh`

This repo's branch protection, as code. See the header in that file; run
`--check` to report drift without changing anything.

Note: every CI job is listed individually because this repo has no aggregate gate
job, so a renamed job silently drops a requirement. An aggregate job (as pwap-web
has with `CI Gate ✅`) would be sturdier.
