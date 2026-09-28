#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

compose_dir=/home/sebastian/mocca
compose_file="$compose_dir/compose.production.yaml"
production_env="$compose_dir/.env.production"
image_repository=ghcr.io/sebastianamartinez/mocca-api
health_timeout_seconds=180

fail() {
	printf 'Deployment failed: %s\n' "$1" >&2
	exit 1
}

if [[ $EUID -ne 0 ]]; then
	fail 'run as root'
fi
if [[ $# -ne 0 ]]; then
	fail 'this command accepts its commit SHA on stdin and does not accept arguments'
fi

for command_name in docker flock; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		fail "required command not found: $command_name"
	fi
done

if [[ ! -r "$production_env" || ! -r "$compose_file" ]]; then
	fail "production Compose files are not readable under $compose_dir"
fi

if ! IFS= read -r commit_sha; then
	fail 'provide one full 40-character commit SHA on stdin'
fi
if [[ ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
	fail 'commit SHA must contain exactly 40 lowercase hexadecimal characters'
fi
if IFS= read -r extra_input; then
	fail 'expected exactly one input line'
fi

exec 9>/run/lock/mocca-api-deploy.lock
if ! flock -n 9; then
	fail 'another API deployment is already running'
fi

compose=(docker compose --project-directory "$compose_dir" --env-file "$production_env" -f "$compose_file")
current_container=$("${compose[@]}" ps -q api)
if [[ -z "$current_container" ]]; then
	fail 'the current API container is missing; refusing deployment without a rollback target'
fi

previous_image=$(docker inspect --format='{{.Config.Image}}' "$current_container")
previous_status=$(docker inspect --format='{{.State.Status}}' "$current_container")
previous_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$current_container")
if [[ "$previous_status" != running || "$previous_health" != healthy ]]; then
	fail 'the current API must be running and healthy before deployment'
fi
if ! docker image inspect "$previous_image" >/dev/null 2>&1; then
	fail 'the current API image is unavailable for rollback'
fi

wait_for_healthy() {
	local container_id=$1
	local deadline=$((SECONDS + health_timeout_seconds))
	local container_state health_status

	while (( SECONDS < deadline )); do
		if ! docker inspect "$container_id" >/dev/null 2>&1; then
			return 1
		fi
		read -r container_state health_status < <(docker inspect --format='{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")
		if [[ "$container_state" == running && "$health_status" == healthy ]]; then
			return 0
		fi
		sleep 2
	done
	return 1
}

rollback_api() {
	local failed_container=$1
	export MOCCA_API_IMAGE=$previous_image
	if ! "${compose[@]}" up --detach --no-deps --no-build --pull never api; then
		printf 'Automatic API rollback command failed; inspect the production stack immediately.\n' >&2
		return 1
	fi

	local rollback_container
	rollback_container=$("${compose[@]}" ps -q api)
	if [[ -z "$rollback_container" ]] || ! wait_for_healthy "$rollback_container"; then
		printf 'Automatic API rollback did not become healthy.\n' >&2
		if [[ -n "$rollback_container" ]]; then
			docker logs --tail 60 "$rollback_container" >&2 || true
		fi
		return 1
	fi

	printf 'Rolled the API back to %s.\n' "$previous_image" >&2
	if [[ -n "$failed_container" ]]; then
		docker logs --tail 60 "$failed_container" >&2 || true
	fi
	return 0
}

new_image="$image_repository:sha-$commit_sha"
export MOCCA_API_IMAGE=$new_image

printf 'Pulling %s...\n' "$new_image"
if ! "${compose[@]}" pull api; then
	fail 'could not pull the requested API image'
fi

if ! "${compose[@]}" up --detach --no-deps --no-build --pull never api; then
	rollback_api '' || fail 'deployment failed and automatic rollback needs operator attention'
	fail 'API rollout command failed; previous API image was restored'
fi

new_container=$("${compose[@]}" ps -q api)
if [[ -z "$new_container" ]] || ! wait_for_healthy "$new_container"; then
	rollback_api "$new_container" || fail 'new API was unhealthy and automatic rollback needs operator attention'
	fail 'new API did not become healthy; previous API image was restored'
fi

printf 'Deployed and health-checked %s.\n' "$new_image"