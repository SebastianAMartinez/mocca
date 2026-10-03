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

if [[ $EUID -ne 0 ]]; then
	printf 'Run this script as root so it can create isolated test containers.\n' >&2
	exit 1
fi

for command_name in docker restic jq; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		printf 'Required command not found: %s\n' "$command_name" >&2
		exit 1
	fi
done

run_id="$(date -u +%Y%m%d%H%M%S)-$$"
postgres_volume="mocca-restore-check-postgres-$run_id"
postgres_container="mocca-restore-check-postgres-$run_id"

cleanup() {
	local status=$?
	docker rm -f "$postgres_container" >/dev/null 2>&1 || true
	docker volume rm "$postgres_volume" >/dev/null 2>&1 || true
	exit "$status"
}
trap cleanup EXIT

postgres_snapshot=$(restic snapshots --json --tag postgres | jq -er 'sort_by(.time) | last | .id')

docker volume create "$postgres_volume" >/dev/null

docker run --detach \
	--name "$postgres_container" \
	--network none \
	--env POSTGRES_PASSWORD=restore-check-only \
	--env POSTGRES_DB=mocca_restore_check \
	--mount "type=volume,src=$postgres_volume,dst=/var/lib/postgresql" \
	postgres:18 >/dev/null

postgres_ready=0
for attempt in {1..60}; do
	if docker exec "$postgres_container" sh -ec 'test "$(cat /proc/1/comm)" = postgres' >/dev/null 2>&1 &&
		docker exec "$postgres_container" pg_isready -U postgres -d mocca_restore_check >/dev/null 2>&1; then
		postgres_ready=1
		break
	fi
	sleep 1
done
if [[ $postgres_ready -ne 1 ]]; then
	docker logs "$postgres_container" >&2
	printf 'Restore-check PostgreSQL container did not become ready.\n' >&2
	exit 1
fi

docker exec "$postgres_container" createdb -U postgres mocca_restored
restic dump "$postgres_snapshot" mocca-postgres.dump |
	docker exec -i "$postgres_container" pg_restore \
		--username=postgres \
		--dbname=mocca_restored \
		--no-owner \
		--no-acl \
		--exit-on-error

table_count=$(docker exec "$postgres_container" psql --no-psqlrc --tuples-only --no-align -U postgres -d mocca_restored -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
if [[ ! "$table_count" =~ ^[0-9]+$ || $table_count -eq 0 ]]; then
	printf 'Restored PostgreSQL database has no public tables.\n' >&2
	exit 1
fi
printf 'PostgreSQL restore passed (%s public tables).\n' "$table_count"