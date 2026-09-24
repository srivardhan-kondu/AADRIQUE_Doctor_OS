#!/usr/bin/env bash
# A full logical backup of the database — records and uploaded files alike,
# since file bytes live in Postgres (the FileBlob table).
#
#   DIRECT_DATABASE_URL=postgresql://… scripts/backup.sh [output-dir]
#
# Uses the direct (non-pooled) connection; pg_dump needs a real session.
# Restore into an empty database with:
#   pg_restore --no-owner --dbname "$TARGET_URL" backups/aadrique-YYYY-MM-DDTHHMM.dump
set -euo pipefail

url="${DIRECT_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$url" ]]; then
  echo "Set DIRECT_DATABASE_URL (or DATABASE_URL)." >&2
  exit 1
fi

dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/aadrique-$(date -u +%Y-%m-%dT%H%M).dump"

pg_dump --format=custom --no-owner --no-privileges --file "$file" "$url"
# A backup that cannot be read is not a backup.
pg_restore --list "$file" > /dev/null

echo "Backed up to $file ($(du -h "$file" | cut -f1))"
