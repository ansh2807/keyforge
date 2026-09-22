#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

project_dir="$(realpath -m "${KEYFORGE_PROJECT_DIR:-/home/deploy/keyforge}")"
backup_dir="$(realpath -m "${KEYFORGE_BACKUP_DIR:-/home/deploy/keyforge-backups}")"
retention_days="${KEYFORGE_BACKUP_RETENTION_DAYS:-14}"

if [[ ! "$retention_days" =~ ^[0-9]+$ ]] || (( retention_days < 1 )); then
  echo "KEYFORGE_BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 1
fi

install -d -m 700 "$backup_dir"
cd "$project_dir"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
temporary_dir="$(mktemp -d "$backup_dir/.keyforge-$timestamp-XXXXXX")"
cleanup() {
  case "$temporary_dir" in
    "$backup_dir"/.keyforge-*) rm -rf -- "$temporary_dir" ;;
    *) echo "Refusing to remove unexpected temporary path: $temporary_dir" >&2 ;;
  esac
}
trap cleanup EXIT

database_file="$temporary_dir/keyforge-$timestamp.dump"
files_file="$temporary_dir/keyforge-files-$timestamp.tar.gz"
manifest_file="$temporary_dir/keyforge-$timestamp.sha256"

docker compose exec -T postgres pg_dump -Fc -U keyforge -d keyforge > "$database_file"
docker compose exec -T postgres pg_restore --list < "$database_file" > /dev/null

docker compose exec -T app tar -czf - -C /app/data/files . > "$files_file"
tar -tzf "$files_file" > /dev/null

(
  cd "$temporary_dir"
  sha256sum "$(basename "$database_file")" "$(basename "$files_file")" > "$(basename "$manifest_file")"
)

mv -- "$database_file" "$files_file" "$manifest_file" "$backup_dir/"
rmdir "$temporary_dir"
trap - EXIT

find "$backup_dir" -maxdepth 1 -type f -name 'keyforge-*' -mtime "+$retention_days" -delete

echo "Keyforge backup completed: $backup_dir/keyforge-$timestamp.dump"
