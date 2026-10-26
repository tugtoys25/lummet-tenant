#!/usr/bin/env bash
# =====================================================================
# Remove the leaked database dump (levelcasd1.sql / .zip) from the WHOLE git history
# of lummet-tenant, and drop the commit/revert noise, leaving one clean history.
#
# DESTRUCTIVE on GitHub: it rewrites history and force-pushes. It first writes a
# backup bundle (which still CONTAINS the dump -- keep it private, delete it when done).
#
# Usage:  bash purge-history.sh [path-to-repo]      (default ~/lummet/lummet-tenant)
# Optional environment variables (for testing / other repos):
#   BASE   last good commit before the noise        (default 57ee5dd = v22.9)
#   NOISE  commits to drop, space separated         (default 3eadd94 f07ebf1 fbd2cd8 0cbe16c)
#   PATTERN path regex to purge from history        (default: levelcasd1.sql / .zip anywhere)
#   ASSUME_YES=1  skip the typed confirmations
# =====================================================================
set -euo pipefail

REPO="${1:-$HOME/lummet/lummet-tenant}"
BASE="${BASE:-57ee5dd}"
NOISE="${NOISE:-3eadd94 f07ebf1 fbd2cd8 0cbe16c}"
PATTERN="${PATTERN:-(^|/)levelcasd1\.(sql|zip)\$}"
BRANCH="${BRANCH:-main}"

say()  { printf '\n== %s\n' "$*"; }
die()  { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }
ask()  { # ask WORD "question"
  [ "${ASSUME_YES:-0}" = 1 ] && return 0
  printf '%s\nType %s to continue (anything else stops): ' "$2" "$1"
  read -r a; [ "$a" = "$1" ] || die "not confirmed"
}

cd "$REPO" || die "no such folder: $REPO"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git repository"

say "1/7  Checks"
[ -z "$(git status --porcelain)" ] || die "uncommitted changes. Commit or stash them first."
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || die "you must be on $BRANCH"
ORIGIN_URL="$(git remote get-url origin)"
git fetch origin "$BRANCH" -q
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/$BRANCH)" ] || die "local $BRANCH differs from origin/$BRANCH. Push or pull first."
git cat-file -e "$BASE^{commit}" 2>/dev/null || die "base commit $BASE not found"
for c in $NOISE; do git cat-file -e "$c^{commit}" 2>/dev/null || die "commit $c not found (history changed?). Edit NOISE."; done
git merge-base --is-ancestor "$BASE" HEAD || die "$BASE is not in this branch's history"
echo "repo: $REPO   remote: $ORIGIN_URL"

say "2/7  Backup (contains the dump: keep private)"
BUNDLE="$HOME/lummet-tenant-before-purge-$(date +%Y%m%d-%H%M%S).bundle"
git bundle create "$BUNDLE" --all >/dev/null 2>&1
echo "backup written: $BUNDLE"
TREE_BEFORE="$(git rev-parse 'HEAD^{tree}')"

say "3/7  Every database/archive file ever committed (check the list)"
git log --all --diff-filter=A --name-only --format= | grep -iE '\.(sql|zip|db|sqlite|dump|bak|gz|tar)$' | sort -u || true
echo "-- will be purged (regex): $PATTERN"
echo "-- will be dropped from history: $NOISE"
ask PURGE "This rewrites ALL commit ids. Continue?"

say "4/7  Dropping apply/revert noise"
ORIG_HEAD="$(git rev-parse HEAD)"
ALT="$(echo $NOISE | sed 's/ /|/g')"
GIT_SEQUENCE_EDITOR="sed -i -E '/^pick ($ALT)/d'" GIT_EDITOR=true git rebase -i "$BASE" >/dev/null \
  || { git rebase --abort 2>/dev/null || true; git reset --hard "$ORIG_HEAD" -q; die "rebase failed, nothing changed"; }
[ "$(git rev-parse 'HEAD^{tree}')" = "$TREE_BEFORE" ] \
  || { git reset --hard "$ORIG_HEAD" -q; die "files differ after dropping the noise commits, restored. Nothing changed."; }
echo "history is shorter, files are identical."

say "5/7  Purging the dump from every commit (can take a few minutes)"
export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch --force --prune-empty --tag-name-filter cat \
  --index-filter "git ls-files -z | grep -zE '$PATTERN' | xargs -0 -r git rm -q --cached --ignore-unmatch --" \
  -- --all >/dev/null 2>&1 || die "filter-branch failed (backup: $BUNDLE)"
rm -rf .git/refs/original
git reflog expire --expire=now --all
git gc --prune=now -q
if git rev-list --all --objects | grep -iE "levelcasd1" >/dev/null; then die "the dump is still reachable (backup: $BUNDLE)"; fi
[ "$(git rev-parse 'HEAD^{tree}')" = "$TREE_BEFORE" ] || die "files changed unexpectedly (backup: $BUNDLE)"
echo "dump is gone from all local history; files are identical."

say "6/7  Force-push to GitHub"
git log --oneline -5
ask PUSH "Force-push $BRANCH (all old commit ids on GitHub are replaced)?"
git push --force origin "$BRANCH"
if git tag | grep -q .; then git push --force --tags origin; fi

say "7/7  Done. Now:"
cat <<EOM
 1. GitHub still caches old commits by id. Ask GitHub Support to remove cached views and run
    garbage collection: https://support.github.com/contact  (say: sensitive data removal,
    repo lvl-code/lummet-tenant, old commits containing docs/casinos/levelcasd1.sql).
 2. In the GitHub web page: Settings > Branches, check no other branch still holds the file;
    delete old branches or run this script again for them.
 3. Other clones of this repo (other phones/computers): run
        git fetch origin && git reset --hard origin/$BRANCH
 4. Delete the backup when you are sure: rm "$BUNDLE"
    Delete old release zips in ~/storage/downloads: they contain the dump too.
 5. The data is still exposed to anyone who already copied it: rotate passwords, sessions, keys.
EOM
