#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

backup_env_file=${MOCCA_BACKUP_ENV_FILE:-/etc/mocca-backup.env}
if [[ -f "$backup_env_file" ]]; then
	set -a
	. "$backup_env_file"
	set +a
fi

: "${RESTIC_REPOSITORY:?Set RESTIC_REPOSITORY in /etc/mocca-backup.env}"
: "${RESTIC_PASSWORD:?Set RESTIC_PASSWORD in /etc/mocca-backup.env}"
: "${AWS_ACCESS_KEY_ID:?Set AWS_ACCESS_KEY_ID in /etc/mocca-backup.env}"
: "${AWS_SECRET_ACCESS_KEY:?Set AWS_SECRET_ACCESS_KEY in /etc/mocca-backup.env}"
: "${AWS_DEFAULT_REGION:?Set AWS_DEFAULT_REGION in /etc/mocca-backup.env}"

compose_dir=${COMPOSE_DIR:-/home/sebastian/mocca}
compose=(docker compose --project-directory "$compose_dir" --env-file "$compose_dir/.env.production" -f "$compose_dir/compose.production.yaml")

for command_name in docker restic flock; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		printf 'Required command not found: %s\n' "$command_name" >&2
		exit 1
	fi
done

if [[ $EUID -ne 0 ]]; then
	printf 'Run this script as root so it can access Docker and the production env file.\n' >&2
	exit 1
fi

if [[ ! -r "$compose_dir/.env.production" ]]; then
	printf 'Production env file is not readable: %s/.env.production\n' "$compose_dir" >&2
	exit 1
fi

exec 9>/run/lock/mocca-backup.lock
if ! flock -n 9; then
	printf 'Another Mocca backup is already running.\n' >&2
	exit 1
fi

restic snapshots >/dev/null

postgres_container=$("${compose[@]}" ps -q postgres)

if [[ -z "$postgres_container" ]]; then
	printf 'PostgreSQL must be running before backup.\n' >&2
	exit 1
fi

restic backup \
	--stdin-from-command \
	--stdin-filename mocca-postgres.dump \
	--tag postgres \
	-- "${compose[@]}" exec -T postgres sh -ec 'exec pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"'