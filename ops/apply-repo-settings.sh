#!/usr/bin/env bash
#
# apply-repo-settings.sh — this repo's GitHub protections, as code.
#
# Branch protection is configured through the GitHub API, so nothing in the
# repository reflects it: invisible here, unversioned, and gone without a trace
# if someone removes it. It exists so that nothing reaches main unreviewed, which
# is exactly why it should not live as undocumented clicks in a settings page.
#
# Idempotent — each call PUTs the full desired state, so repeated runs converge.
#
#   ./ops/apply-repo-settings.sh          # apply
#   ./ops/apply-repo-settings.sh --check  # report drift, change nothing
#
# Requires gh authenticated with admin rights on the repo.
set -euo pipefail

REPO="${REPO:-pezkuwichain/pezkuwi-telegram-miniapp}"
BRANCH="${BRANCH:-main}"

CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

ok()  { printf '  \033[32m✔\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✗\033[0m %s\n' "$*"; }

# Every CI job is listed individually because this repo has no aggregate gate
# job. That means renaming a job here silently drops a requirement — if the CI
# workflow gains or renames a job, this list must be updated with it. An
# aggregate job (as pwap has) would be sturdier; until then, --check is what
# catches the mismatch.
read -r -d '' PROTECTION <<'JSON' || true
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Test", "ESLint", "TypeScript", "Build", "Secret Scan"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

# enforce_admins stays false deliberately: an admin needs a way through during a
# real incident. Escape hatch, not the normal path.

echo "▶ repo settings: $REPO"

if [[ $CHECK_ONLY -eq 1 ]]; then
  cur="$(gh api "repos/$REPO/branches/$BRANCH/protection" 2>/dev/null || echo '{}')"
  if [[ "$cur" == "{}" ]]; then
    bad "branch '$BRANCH' is NOT protected"
    exit 1
  fi
  python3 - "$cur" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
checks = d.get('required_status_checks') or {}
rev = d.get('required_pull_request_reviews') or {}
expected_checks = ["Test", "ESLint", "TypeScript", "Build", "Secret Scan"]
want = {
    'required checks': (sorted(checks.get('contexts') or []), sorted(expected_checks)),
    'strict': (checks.get('strict'), True),
    'approvals': (rev.get('required_approving_review_count'), 1),
    'dismiss stale': (rev.get('dismiss_stale_reviews'), True),
    'force pushes blocked': (not (d.get('allow_force_pushes') or {}).get('enabled'), True),
    'deletions blocked': (not (d.get('allow_deletions') or {}).get('enabled'), True),
    'conversation resolution': ((d.get('required_conversation_resolution') or {}).get('enabled'), True),
}
drift = 0
for label, (got, exp) in want.items():
    if got == exp:
        print(f'  \033[32m✔\033[0m {label}')
    else:
        drift += 1
        print(f'  \033[31m✗\033[0m {label}  (expected {exp}, got {got})')
raise SystemExit(1 if drift else 0)
PY
  exit $?
fi

gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - <<<"$PROTECTION" >/dev/null
ok "protected: 1 approval, 5 required checks, no force push, no deletion"
echo "✔ done — verify with: $0 --check"
