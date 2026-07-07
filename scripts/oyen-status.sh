#!/usr/bin/env bash
#
# oyen-status.sh — tell Oyen what you're up to.
#
# Oyen watches ~/.oyen-status.json for a { "status": ... } field:
#   thinking -> shows a small thinking overlay
#   done     -> plays the happy-jump animation
#   idle     -> back to normal
#
# Usage:
#   ./oyen-status.sh thinking
#   ./oyen-status.sh done
#   ./oyen-status.sh idle
#
# Example: wrap a long command so Oyen reacts while it runs.
#   ./oyen-status.sh thinking
#   npm test && ./oyen-status.sh done || ./oyen-status.sh idle
#
# You can point Oyen at a different file in Settings; set OYEN_STATUS_FILE to
# match if you do.

set -euo pipefail

STATUS="${1:-idle}"
FILE="${OYEN_STATUS_FILE:-$HOME/.oyen-status.json}"

case "$STATUS" in
  thinking|done|idle) ;;
  *)
    echo "usage: $0 {thinking|done|idle}" >&2
    exit 1
    ;;
esac

printf '{ "status": "%s", "ts": %s }\n' "$STATUS" "$(date +%s)" > "$FILE"
echo "oyen: status set to '$STATUS' ($FILE)"
