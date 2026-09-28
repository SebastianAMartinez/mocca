#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! "${SSH_ORIGINAL_COMMAND:-}" =~ ^deploy[[:space:]]([0-9a-f]{40})$ ]]; then
	printf 'Only deploy <full-commit-sha> is allowed.\n' >&2
	exit 64
fi

commit_sha=${BASH_REMATCH[1]}
printf '%s\n' "$commit_sha" | /usr/bin/sudo -n /usr/local/sbin/mocca-deploy-production-api