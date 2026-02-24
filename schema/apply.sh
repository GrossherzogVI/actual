#!/bin/bash
set -euo pipefail

# Apply all SurrealDB schema files in order
SURREAL_URL="${SURREAL_URL:-http://localhost:8000}"
SURREAL_NS="${SURREAL_NS:-finance}"
SURREAL_DB="${SURREAL_DB:-main}"
SURREAL_USER="${SURREAL_USER:-root}"
SURREAL_PASS="${SURREAL_PASS:-root}"

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
