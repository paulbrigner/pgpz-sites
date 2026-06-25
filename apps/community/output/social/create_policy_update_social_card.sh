#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate_weekly_social_card.py"

usage() {
  cat <<'EOF'
Generate a PGPZ policy update social card.

Usage:
  output/social/create_policy_update_social_card.sh \
    --category weekly \
    --platform x \
    --week-label "Week of Month D, YYYY" \
    --summary "One-sentence card summary." \
    --output output/social/pgpz-x-article-weekly-policy-memo-YYYY-MM-DD.png

  output/social/create_policy_update_social_card.sh \
    --category special \
    --platform linkedin \
    --headline "U.S. Digital Asset Policy: H1 2026" \
    --display-label "H1 2026 Special Update" \
    --document-title "U.S. Digital Asset Policy Developments in 2026 and Zcash implications" \
    --summary "Developments in 2026 and implications for the Zcash ecosystem." \
    --output output/social/pgpz-linkedin-special-1h-2026-update.png

Options:
  --category        weekly or special. Defaults to weekly.
  --platform        x or linkedin. Defaults to x.
                    x renders 1600x640; linkedin renders 1200x627 with a safe
                    inset for LinkedIn's cover-image crop preview.
  --week-label      Weekly date label shown in the strip and mini document.
  --display-label   Label shown in the cream date/report strip.
                    For weekly cards this defaults to --week-label.
  --headline        Main card headline. Required for custom special reports.
  --document-title  Optional mini document title. Defaults to the headline for
                    special cards.
  --summary         One-sentence summary shown under the headline.
  --output          PNG output path. Relative paths are resolved from the repo root.

Examples:
  output/social/create_policy_update_social_card.sh \
    --week-label "Week of June 19, 2026" \
    --summary "FinCEN AML rulemaking, Illinois crypto tax, and stablecoin customer-identification requirements." \
    --output output/social/pgpz-x-article-weekly-policy-memo-2026-06-19.png

  output/social/create_policy_update_social_card.sh \
    --category special \
    --headline "U.S. Digital Asset Policy: H1 2026" \
    --display-label "H1 2026 Special Update" \
    --document-title "U.S. Digital Asset Policy Developments in 2026 and Zcash implications" \
    --summary "Developments in 2026 and implications for the Zcash ecosystem." \
    --output output/social/pgpz-x-article-special-1h-2026-update.png
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || "$#" -eq 0 ]]; then
  usage
  exit 0
fi

python3 "$GENERATOR" "$@"
