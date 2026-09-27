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
	printf 'Run this script as root so it can access the backup credentials.\n' >&2
	exit 1
fi

for tag in postgres seaweedfs; do
	restic forget \
		--tag "$tag" \
		--keep-daily 7 \
		--keep-weekly 4 \
		--keep-monthly 12
done

restic prune
restic check --read-data-subset=10%