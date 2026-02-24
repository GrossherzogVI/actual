#!/bin/bash
set -euo pipefail

# Apply all SurrealDB schema files in order
SURREAL_URL="${SURREAL_URL:-http://localhost:8000}"
SURREAL_NS="${SURREAL_NS:-finance}"
SURREAL_DB="${SURREAL_DB:-main}"
if [ -z "${SURREAL_USER:-}" ]; then
  echo "Error: SURREAL_USER is not set. Export it before running this script." >&2
  exit 1
fi
if [ -z "${SURREAL_PASS:-}" ]; then
  echo "Error: SURREAL_PASS is not set. Export it before running this script." >&2
  exit 1
fi
if [ "$SURREAL_USER" = "root" ] || [ "$SURREAL_PASS" = "root" ]; then
  echo "Warning: You are using 'root' as the SurrealDB username or password. Change this before deploying to production." >&2
fi

SCHEMA_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Applying schema to ${SURREAL_URL} (ns=${SURREAL_NS}, db=${SURREAL_DB})..."

for f in "${SCHEMA_DIR}"/*.surql; do
  [ -f "$f" ] || continue
  echo "  $(basename "$f")..."
  surreal import \
    --endpoint "$SURREAL_URL" \
    --namespace "$SURREAL_NS" \
    --database "$SURREAL_DB" \
    --username "$SURREAL_USER" \
    --password "$SURREAL_PASS" \
    "$f"
done

echo "Schema applied."
