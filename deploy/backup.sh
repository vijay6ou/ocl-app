#!/usr/bin/env bash
# Snapshot the live plant data.
#
#   sudo bash deploy/backup.sh
#
# Backs up data/ — submissions, photos, users, catalogue — plus the APK the
# phones are served. data/ is gitignored and is the only copy of the plant
# record, so it is NOT covered by git.
#
# Writes to /var/backups/ocl-technician-log/ and keeps the newest KEEP files.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${OCL_BACKUP_DIR:-/var/backups/ocl-technician-log}"
KEEP="${OCL_BACKUP_KEEP:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$DEST"

OUT="$DEST/ocl-data-$STAMP.tar.gz"
tar czf "$OUT" -C "$APP_DIR" data
printf 'wrote %s (%s bytes)\n' "$OUT" "$(stat -c%s "$OUT")"

# Verify the archive actually contains the record before trusting it.
if ! tar tzf "$OUT" | grep -q 'data/submissions.json'; then
  printf '!! %s does not contain data/submissions.json — treat as failed\n' "$OUT" >&2
  exit 1
fi
printf 'verified: submissions.json present\n'

mapfile -t OLD < <(ls -1t "$DEST"/ocl-data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) || true)
if (( ${#OLD[@]} )); then
  printf 'pruning %d old snapshot(s)\n' "${#OLD[@]}"
  rm -f "${OLD[@]}"
fi

printf 'kept: %s\n' "$(ls -1 "$DEST"/ocl-data-*.tar.gz | wc -l)"
