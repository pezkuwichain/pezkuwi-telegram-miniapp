#!/bin/bash
# The rc/before variables are read inside the check expressions, which
# check() runs with eval; shellcheck cannot see into those strings.
# shellcheck disable=SC2034
# Exercises miniapp-site-receive against a scratch web root: what it
# installs, with which modes, and what it must refuse. The script under test
# is copied with its web root pointed at the scratch directory.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/web" "$T/tmp/stage"
export TMPDIR="$T/tmp/stage"   # stage = $T/tmp/stage/tmp.X, so ../../.. is $T
sed -e "s#/var/www/telegram.pezkiwi.app#$T/web#" "$HERE/miniapp-site-receive" > "$T/receive"
chmod +x "$T/receive"

pass=0; fail=0
check () { if eval "$2"; then echo "ok    $1"; pass=$((pass+1)); else echo "FAIL  $1"; fail=$((fail+1)); fi; }
site () { mkdir -p "$1/assets"; echo "<html>new</html>" > "$1/index.html"; echo "x" > "$1/assets/index-NEW.js"; }
run () { ( cd "$2" && tar -cf - . ) | SSH_ORIGINAL_COMMAND="$1" "$T/receive" >/dev/null 2>&1; }

mkdir -p "$T/web/assets"; echo old > "$T/web/assets/index-OLD.js"; echo "<html>old</html>" > "$T/web/index.html"

site "$T/s1"; run deploy "$T/s1"; rc=$?
check "a valid build installs"                 '[ $rc = 0 ] && grep -q new "$T/web/index.html"'
check "recent chunks of the previous build stay" '[ -f "$T/web/assets/index-OLD.js" ]'
check "files are world-readable (644)"         '[ "$(stat -c %a "$T/web/index.html")" = 644 ] && [ "$(stat -c %a "$T/web/assets/index-NEW.js")" = 644 ]'
check "directories are traversable (755)"      '[ "$(stat -c %a "$T/web/assets")" = 755 ] && [ "$(stat -c %a "$T/web")" = 755 ]'

before=$(cat "$T/web/index.html")
mkdir -p "$T/s2/assets"; echo x > "$T/s2/assets/a.js"; run deploy "$T/s2"; rc=$?
check "a tar without index.html is refused"    '[ $rc != 0 ] && [ "$(cat "$T/web/index.html")" = "$before" ]'

site "$T/s3"; run 'deploy; id' "$T/s3"; rc1=$?; run '' "$T/s3"; rc2=$?
check "any command but deploy is refused"      '[ $rc1 = 2 ] && [ $rc2 = 2 ]'

# The cleanup: a file of the new build stays however old it is (the old
# cleanup removed lazy chunks older than two hours); a file not in the build
# stays for four hours, then goes.
site "$T/c1"; echo chunk > "$T/c1/assets/Wallet-OLD.js"; touch -d '3 days ago' "$T/c1/assets/Wallet-OLD.js"
echo prev > "$T/web/assets/prev-recent.js"; echo gone > "$T/web/assets/prev-old.js"; touch -d '1 day ago' "$T/web/assets/prev-old.js"
run deploy "$T/c1"; rc=$?
check "an old file of the new build is kept"         '[ $rc = 0 ] && [ -f "$T/web/assets/Wallet-OLD.js" ]'
check "a recent file of an earlier build is kept"    '[ -f "$T/web/assets/prev-recent.js" ]'
check "an old file of an earlier build is removed"   '[ ! -e "$T/web/assets/prev-old.js" ]'

site "$T/s4"; ln -s /etc/passwd "$T/s4/assets/passwd.js"; run deploy "$T/s4"; rc=$?
check "a symlink in the upload is not installed" '[ $rc = 0 ] && [ ! -e "$T/web/assets/passwd.js" ] && [ ! -L "$T/web/assets/passwd.js" ]'

site "$T/s5"
( cd "$T/s5" && tar -cf "$T/evil.tar" . && tar -rf "$T/evil.tar" --transform 's#^#../../../#' index.html ) 2>/dev/null
SSH_ORIGINAL_COMMAND=deploy "$T/receive" < "$T/evil.tar" >/dev/null 2>&1
check "a ../ member cannot write outside the stage" '[ ! -e "$T/index.html" ] && [ ! -e "$T/tmp/index.html" ]'

echo "RESULT: $pass passed, $fail failed"
[ "$fail" = 0 ]
