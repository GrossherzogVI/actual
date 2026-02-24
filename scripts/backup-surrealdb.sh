#!/bin/bash
set -euo pipefail

# SurrealDB backup script
# Uses `surreal export` to dump the database to a timestamped file.
# Keeps the last 7 backups and prunes older ones.
#
# Required env vars (no defaults — set these before running):
#   SURREAL_USER
#   SURREAL_PASS
#
# Optional env vars (sane defaults for local dev):
#   SURREAL_URL      — default: http://localhost:8000
#   SURREAL_NS       — default: finance
#   SURREAL_DB       — default: main
#   BACKUP_DIR       — default: <repo-root>/backups/surrealdb
#   BACKUP_KEEP      — number of backups to keep, default: 7

SURREAL_URL="${SURREAL_URL:-http://localhost:8000}"
SURREAL_NS="${SURREAL_NS:-finance}"
SURREAL_DB="${SURREAL_DB:-main}"
BACKUP_KEEP="${BACKUP_KEEP:-7}"

if [ -z "${SURREAL_USER:-}" ]; then
  echo "Error: SURREAL_USER is not set." >&2
  exit 1
fi
if [ -z "${SURREAL_PASS:-}" ]; then
  echo "Error: SURREAL_PASS is not set." >&2
  exit 1
fi
if [ "$SURREAL_USER" = "root" ] || [ "$SURREAL_PASS" = "root" ]; then
  echo "Warning: Using 'root' credentials — change before deploying to production." >&2
fi

# Resolve the repo root (parent of scripts/) to place backups next to it.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups/surrealdb}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_DIR}/finance_${TIMESTAMP}.surql"

echo "Backing up ${SURREAL_URL} (ns=${SURREAL_NS}, db=${SURREAL_DB})..."
echo "  Destination: ${BACKUP_FILE}"

surreal export \
  --endpoint "$SURREAL_URL" \
  --namespace "$SURREAL_NS" \
  --database "$SURREAL_DB" \
  --username "$SURREAL_USER" \
  --password "$SURREAL_PASS" \
  "$BACKUP_FILE"

echo "  Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

# Prune backups older than the most recent $BACKUP_KEEP files.
BACKUP_COUNT="$(ls -1t "${BACKUP_DIR}"/finance_*.surql 2>/dev/null | wc -l | tr -d ' ')"
if [ "$BACKUP_COUNT" -gt "$BACKUP_KEEP" ]; then
  TO_DELETE="$(ls -1t "${BACKUP_DIR}"/finance_*.surql | tail -n +"$((BACKUP_KEEP + 1))")"
  echo "  Pruning $((BACKUP_COUNT - BACKUP_KEEP)) old backup(s)..."
  while IFS= read -r old_file; do
    rm -f "$old_file"
    echo "    Deleted: $(basename "$old_file")"
  done <<< "$TO_DELETE"
fi

echo "Done. ${BACKUP_DIR} now holds $(ls -1 "${BACKUP_DIR}"/finance_*.surql 2>/dev/null | wc -l | tr -d ' ') backup(s)."
