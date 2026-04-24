#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DB="$REPO_ROOT/packages/server/finance-tracker.db"
BACKUP_DIR="$REPO_ROOT/backups"

if [[ ! -f "$SOURCE_DB" ]]; then
  echo "error: source database not found at $SOURCE_DB" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/finance-tracker-$TIMESTAMP.db"

sqlite3 "$SOURCE_DB" ".backup '$BACKUP_PATH'"

SIZE="$(du -h "$BACKUP_PATH" | cut -f1)"
echo "backed up to $BACKUP_PATH ($SIZE)"
