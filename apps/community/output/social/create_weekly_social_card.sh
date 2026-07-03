#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate_weekly_social_card.py"
PYTHON_BIN="${PYTHON:-python3}"

if [[ -z "${PYTHON:-}" && -x "$SCRIPT_DIR/.venv/bin/python" ]]; then
  PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python"
fi

usage() {
  cat <<'EOF'
Generate a PGPZ weekly policy social card.

Usage:
  output/social/create_weekly_social_card.sh \
    --platform x \
    --week-label "Week of Month D, YYYY" \
    --summary "One-sentence card summary." \
    --output output/social/pgpz-x-article-weekly-policy-memo-YYYY-MM-DD.png

Required options:
  --platform     Optional output platform: x or linkedin. Defaults to x.
                 x renders 1600x640; linkedin renders 1200x627 with a safe inset
                 for LinkedIn's cover-image crop preview.
  --week-label   Date label shown in the card and mini document image.
  --summary      One-sentence summary shown under "Weekly Policy Memo".
  --output       PNG output path. Relative paths are resolved from the repo root
                 by the underlying generator.

Example:
  output/social/create_weekly_social_card.sh \
    --week-label "Week of June 19, 2026" \
    --summary "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements." \
    --output output/social/pgpz-x-article-weekly-policy-memo-2026-06-19.png

  output/social/create_weekly_social_card.sh \
    --platform linkedin \
    --week-label "Week of June 19, 2026" \
    --summary "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements." \
    --output output/social/pgpz-linkedin-weekly-policy-memo-2026-06-19.png

Notes:
  - This wrapper keeps the weekly image format consistent and delegates rendering
    to output/social/generate_weekly_social_card.py.
  - For special reports, use output/social/create_policy_update_social_card.sh
    with --category special.
  - Run with --help or -h to show this message.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || "$#" -eq 0 ]]; then
  usage
  exit 0
fi

if ! "$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
from PIL import Image
PY
then
  cat >&2 <<EOF
Missing Python dependency: Pillow.

Install it for this tool with:
  python3 -m venv output/social/.venv
  output/social/.venv/bin/python -m pip install -r output/social/requirements.txt

Then rerun this command.
EOF
  exit 1
fi

"$PYTHON_BIN" "$GENERATOR" "$@"
