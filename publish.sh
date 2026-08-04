#!/usr/bin/env bash
#
# publish.sh — Maana marketing dashboards
#
#   bash publish.sh
#   bash publish.sh "Added GEO and PR to Discover"
#
# Rebuilds the encrypted hub, commits it, pushes it. That's the whole job.
#
# To add a dashboard: drop the .html in this folder, add a line to PAGES at the
# top of publish-maana-marketing.mjs, add the filename to .gitignore, re-run.
#
set -euo pipefail
cd "$(dirname "$0")"

MSG="${1:-Update marketing dashboards}"
SITE="https://viola-creator.github.io/maana-marketing/"

say() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# ── 1. Clear a stale lock, but only if git really isn't running ──────────────
if [ -f .git/index.lock ]; then
  if pgrep -x git >/dev/null 2>&1; then
    echo "✖ A git process is actually running right now."
    echo "  Wait for it to finish (or close any open git/editor window), then re-run."
    exit 1
  fi
  echo "· Clearing a stale .git/index.lock"
  rm -f .git/index.lock
fi

# ── 2. Sanity checks ─────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "✖ Node isn't on your PATH. Install it, or open a new terminal window."
  exit 1
fi

# Refuse to run if a source file would be published in the clear.
for f in maana-journey-map.html "annex-list-all_0803.html" "Weekly Sales Report.html"; do
  if [ -f "$f" ] && ! git check-ignore -q "$f"; then
    echo "✖ \"$f\" is NOT gitignored — it would be pushed to GitHub as readable text."
    echo "  Add this line to .gitignore, then re-run:"
    echo "      $f"
    exit 1
  fi
done

# ── 3. Rebuild the encrypted hub ─────────────────────────────────────────────
say "Encrypting"
export MAANA_IN_WRAPPER=1
node publish-maana-marketing.mjs

# ── 4. Stage only what belongs to this job ───────────────────────────────────
say "Committing"
git add maana-marketing/ journey/ .gitignore publish-maana-marketing.mjs redactions.mjs publish.sh

if git diff --cached --quiet; then
  echo "· Nothing to commit — already up to date."
  exit 0
fi

git -c core.hooksPath=/dev/null commit -q -m "$MSG"
echo "· $MSG"

# ── 5. Push ──────────────────────────────────────────────────────────────────
say "Pushing"
git push -q
echo "· Done."

printf "\n  Live in 2–5 minutes at:\n    %s\n\n" "$SITE"
printf "  Send the team that link plus the passphrase, separately.\n\n"
