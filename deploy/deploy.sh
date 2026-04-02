#!/bin/bash
# ============================================================
# Firefly IoT one-click deployment script
# Usage: cd deploy && bash deploy.sh [command]
#
# Commands:
#   infra    Start infrastructure only
#   build    Build application images
#   up       Build and start the full stack
#   release  Pull prebuilt application images and start the full stack
#   down     Stop all containers
#   restart  Restart application services
#   logs     Tail logs
#   status   Show container status
#   clean    Stop and remove containers plus volumes
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
RELEASE_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.github.yml"
ENV_FILE="$SCRIPT_DIR/.env"
BUILD_STATE_DIR="$SCRIPT_DIR/runtime/build-state"
DOCKER_ACCESS_CHECKED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

INFRA_SERVICES=(postgres redis kafka nacos minio sentinel zlmediakit)
BACKEND_BUILD_SERVICES=(gateway system device rule media data support connector)
APPLICATION_SERVICES=(gateway system device rule media data support connector web)
MANAGED_SERVICES=("${INFRA_SERVICES[@]}" "${APPLICATION_SERVICES[@]}")
HOST_LOG_SERVICES=(gateway system device rule media data support connector web)
BACKEND_FINGERPRINT_PATHS=(
    .dockerignore
    deploy/Dockerfile
    pom.xml
    firefly-common
    firefly-api
    firefly-plugin-api
    firefly-system
    firefly-device
    firefly-rule
    firefly-data
    firefly-support
    firefly-media
    firefly-connector
    firefly-gateway
)
WEB_FINGERPRINT_PATHS=(
    .dockerignore
    deploy/Dockerfile.web
    deploy/nginx/default.conf
    firefly-web
)
BUILDKIT_EXECUTOR_PATTERN="/var/lib/docker/buildkit/executor/"

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $1"; }

docker_group_configured_for_user() {
    local current_user
    current_user="$(id -un)"

    if ! command -v getent >/dev/null 2>&1; then
        return 1
    fi

    getent group docker 2>/dev/null | awk -F: '{print $4}' | tr ',' '\n' | grep -qx "$current_user"
}

docker_group_active_in_shell() {
    id -nG | tr ' ' '\n' | grep -qx "docker"
}

require_docker_access() {
    if [ "$DOCKER_ACCESS_CHECKED" -eq 1 ]; then
        return 0
    fi

    if ! command -v docker >/dev/null 2>&1; then
        log_error "Docker CLI not found in PATH."
        log_info "Install Docker Engine / Docker Compose v2, then rerun deploy.sh."
        exit 1
    fi

    local docker_error
    if docker_error="$(docker info 2>&1 >/dev/null)"; then
        DOCKER_ACCESS_CHECKED=1
        return 0
    fi

    if printf '%s' "$docker_error" | grep -qi "permission denied while trying to connect to the Docker daemon socket"; then
        if docker_group_active_in_shell; then
            log_error "Current shell still cannot access the Docker daemon."
            log_info "Check that the Docker service is healthy and /var/run/docker.sock permissions are correct."
        elif docker_group_configured_for_user; then
            log_error "Docker group membership exists, but this shell has not picked it up yet."
            log_info "Open a new SSH session or run 'newgrp docker', then rerun deploy.sh."
        else
            log_error "Current user cannot access the Docker daemon socket."
            log_info "Run: sudo usermod -aG docker $(id -un)"
            log_info "Then open a new SSH session and rerun deploy.sh."
        fi
        exit 1
    fi

    if printf '%s' "$docker_error" | grep -qi "Cannot connect to the Docker daemon"; then
        log_error "Docker daemon is not reachable."
        log_info "Start Docker first, then rerun deploy.sh."
        exit 1
    fi

    log_error "Docker is unavailable: ${docker_error}"
    exit 1
}

check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        log_warn ".env not found, copying from .env.example"
        cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
        log_info "Created $ENV_FILE. Update the values, then rerun the command."
        exit 1
    fi
}

load_env() {
    check_env
    # Parse Docker-style KEY=VALUE lines verbatim so values like
    # JAVA_OPTS=-Xms256m -Xmx512m work without shell quoting.
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        case "$line" in
            ''|\#*) continue ;;
        esac

        local key="${line%%=*}"
        local value="${line#*=}"
        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"

        if [ -n "$key" ]; then
            export "$key=$value"
        fi
    done < "$ENV_FILE"

    normalize_deploy_env
}

normalize_deploy_env() {
    DEPLOY_ENV="${DEPLOY_ENV:-dev}"

    case "$DEPLOY_ENV" in
        dev|prod) ;;
        *)
            log_error "DEPLOY_ENV must be 'dev' or 'prod', got '${DEPLOY_ENV}'"
            exit 1
            ;;
    esac

    export DEPLOY_ENV

    if [ -z "${NACOS_NAMESPACE:-}" ]; then
        NACOS_NAMESPACE="firefly-${DEPLOY_ENV}"
        export NACOS_NAMESPACE
    fi
}

compose_project_name() {
    echo "${COMPOSE_PROJECT_NAME:-firefly-iot}"
}

volume_name_for() {
    case "$1" in
        postgres_data) echo "${POSTGRES_VOLUME_NAME:-firefly-postgres-data}" ;;
        redis_data) echo "${REDIS_VOLUME_NAME:-firefly-redis-data}" ;;
        kafka_data) echo "${KAFKA_VOLUME_NAME:-firefly-kafka-data}" ;;
        minio_data) echo "${MINIO_VOLUME_NAME:-firefly-minio-data}" ;;
        connector_mqtt_data) echo "${CONNECTOR_MQTT_VOLUME_NAME:-firefly-connector-mqtt-data}" ;;
        *)
            log_error "Unsupported managed volume key: $1"
            exit 1
            ;;
    esac
}

ensure_named_volumes() {
    require_docker_access

    for volume_key in postgres_data redis_data kafka_data minio_data connector_mqtt_data; do
        local volume_name
        volume_name="$(volume_name_for "$volume_key")"

        if docker volume inspect "$volume_name" >/dev/null 2>&1; then
            continue
        fi

        log_info "Creating volume ${volume_name}"
        docker volume create \
            --label "firefly.managed=true" \
            --label "firefly.volume=${volume_key}" \
            "$volume_name" >/dev/null
    done
}

remove_managed_volumes() {
    require_docker_access

    for volume_key in postgres_data redis_data kafka_data minio_data connector_mqtt_data; do
        local volume_name
        volume_name="$(volume_name_for "$volume_key")"

        if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
            continue
        fi

        log_info "Removing volume ${volume_name}"
        docker volume rm -f "$volume_name" >/dev/null
    done
}

require_release_image_config() {
    APP_IMAGE_REGISTRY="${APP_IMAGE_REGISTRY:-ghcr.io}"
    APP_IMAGE_TAG="${APP_IMAGE_TAG:-latest}"

    if [ -z "${APP_IMAGE_NAMESPACE:-}" ]; then
        log_error "APP_IMAGE_NAMESPACE is required for release deployment."
        log_info "Export APP_IMAGE_NAMESPACE=<owner>/<repo> before running 'bash deploy.sh release'."
        exit 1
    fi

    export APP_IMAGE_REGISTRY
    export APP_IMAGE_TAG
}

registry_login_if_configured() {
    local username="${APP_IMAGE_REGISTRY_USERNAME:-}"
    local password="${APP_IMAGE_REGISTRY_PASSWORD:-}"

    if [ -z "$username" ] && [ -z "$password" ]; then
        return 0
    fi

    if [ -z "$username" ] || [ -z "$password" ]; then
        log_error "APP_IMAGE_REGISTRY_USERNAME and APP_IMAGE_REGISTRY_PASSWORD must be provided together."
        exit 1
    fi

    require_docker_access
    log_step "Logging in to image registry ${APP_IMAGE_REGISTRY}"
    printf '%s' "$password" | docker login "$APP_IMAGE_REGISTRY" --username "$username" --password-stdin >/dev/null
}

check_container_conflicts() {
    require_docker_access

    local compose_project
    compose_project="$(compose_project_name)"
    local has_conflict=0

    for service in "$@"; do
        local container_name="firefly-${service}"
        local container_id
        container_id="$(docker ps -aq --filter "name=^/${container_name}$")"

        if [ -z "$container_id" ]; then
            continue
        fi

        local owner_project owner_config
        owner_project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id" 2>/dev/null || true)"
        owner_config="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.config_files" }}' "$container_id" 2>/dev/null || true)"

        if [ -n "$owner_project" ] && [ "$owner_project" = "$compose_project" ]; then
            continue
        fi

        has_conflict=1
        if [ -n "$owner_project" ]; then
            log_error "Container ${container_name} belongs to compose project '${owner_project}' (${owner_config:-unknown config}), not '${compose_project}'."
        else
            log_error "Container ${container_name} already exists and was not created by compose project '${compose_project}'."
        fi
    done

    if [ "$has_conflict" -ne 0 ]; then
        log_error "Retire the conflicting containers first, then rerun deploy.sh."
        exit 1
    fi
}

prepare_zlm_config() {
    local runtime_dir="$SCRIPT_DIR/runtime/zlmediakit"
    local config_file="$runtime_dir/config.ini"
    local template_file="$SCRIPT_DIR/zlmediakit/config.template.ini"

    mkdir -p "$runtime_dir"

    if [ ! -f "$config_file" ]; then
        log_step "Generating ZLMediaKit config template..."
        cp "$template_file" "$config_file"
    fi

    python3 - "$config_file" "${ZLM_SECRET:-035c73f7bb6b4889a715d9eb2d1925cc}" <<'PY'
from pathlib import Path
import sys

config_path = Path(sys.argv[1])
secret = sys.argv[2]
lines = config_path.read_text().splitlines()
updated = []
in_api = False
in_rtp_proxy = False
secret_updated = False
rtp_port_updated = False

for line in lines:
    stripped = line.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        in_api = stripped == "[api]"
        in_rtp_proxy = stripped == "[rtp_proxy]"

    if in_api and stripped.startswith("secret="):
        updated.append(f"secret={secret}")
        secret_updated = True
    elif in_rtp_proxy and stripped.startswith("port="):
        # Firefly uses openRtpServer to claim the fixed receive port on demand,
        # so the default RTP proxy listener must stay disabled.
        updated.append("port=0")
        rtp_port_updated = True
    else:
        updated.append(line)

if not secret_updated:
    raise SystemExit("Failed to locate api.secret in ZLMediaKit config.ini")
if not rtp_port_updated:
    raise SystemExit("Failed to locate rtp_proxy.port in ZLMediaKit config.ini")

config_path.write_text("\n".join(updated) + "\n")
PY
}

ensure_build_state_dir() {
    mkdir -p "$BUILD_STATE_DIR"
}

force_build_requested() {
    case "${FIREFLY_FORCE_BUILD:-0}" in
        1|true|TRUE|yes|YES|on|ON) return 0 ;;
        *) return 1 ;;
    esac
}

compute_path_fingerprint() {
    # Persisting a content fingerprint lets repeated deploy.sh runs skip image
    # rebuilds when the effective Docker build inputs have not changed.
    python3 - "$REPO_ROOT" "$@" <<'PY'
from pathlib import Path
import hashlib
import os
import sys

root = Path(sys.argv[1]).resolve()
paths = sys.argv[2:]
ignore_names = {".git", ".idea", "node_modules", "target", "dist", "logs", ".DS_Store"}
digest = hashlib.sha256()


def update_bytes(prefix: str, rel_path: str, payload: bytes = b"") -> None:
    digest.update(prefix.encode("utf-8"))
    digest.update(b"\0")
    digest.update(rel_path.encode("utf-8"))
    digest.update(b"\0")
    if payload:
        digest.update(payload)
    digest.update(b"\0")


def update_file(file_path: Path) -> None:
    rel_path = file_path.relative_to(root).as_posix()
    update_bytes("FILE", rel_path)
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)


for raw_path in sorted(set(paths)):
    path = (root / raw_path).resolve()
    rel_input = Path(raw_path).as_posix()

    if not path.exists():
        update_bytes("MISSING", rel_input)
        continue

    if path.is_symlink():
        update_bytes("SYMLINK", rel_input, os.readlink(path).encode("utf-8"))
        continue

    if path.is_file():
        update_file(path)
        continue

    for current_root, dir_names, file_names in os.walk(path):
        dir_names[:] = sorted(name for name in dir_names if name not in ignore_names)
        file_names = sorted(name for name in file_names if name not in ignore_names)

        current_path = Path(current_root)
        update_bytes("DIR", current_path.relative_to(root).as_posix())

        for file_name in file_names:
            file_path = current_path / file_name
            if file_path.is_symlink():
                update_bytes(
                    "SYMLINK",
                    file_path.relative_to(root).as_posix(),
                    os.readlink(file_path).encode("utf-8"),
                )
            else:
                update_file(file_path)

print(digest.hexdigest())
PY
}

compute_backend_fingerprint() {
    compute_path_fingerprint "${BACKEND_FINGERPRINT_PATHS[@]}"
}

compute_web_fingerprint() {
    compute_path_fingerprint "${WEB_FINGERPRINT_PATHS[@]}"
}

state_file_for_scope() {
    echo "$BUILD_STATE_DIR/$1.sha256"
}

image_name_for_service() {
    echo "$(compose_project_name)-$1:latest"
}

service_image_exists() {
    local service="$1"

    require_docker_access
    docker image inspect "$(image_name_for_service "$service")" >/dev/null 2>&1
}

scope_label() {
    case "$1" in
        backend) echo "Backend" ;;
        web) echo "Frontend" ;;
        *) echo "$1" ;;
    esac
}

scope_needs_build() {
    local scope="$1"
    local fingerprint="$2"
    shift 2

    ensure_build_state_dir

    local label
    label="$(scope_label "$scope")"
    local state_file
    state_file="$(state_file_for_scope "$scope")"

    if force_build_requested; then
        log_info "FIREFLY_FORCE_BUILD is enabled; rebuilding ${label} images."
        return 0
    fi

    if [ ! -f "$state_file" ]; then
        log_info "${label} build fingerprint not found; rebuilding images."
        return 0
    fi

    local saved_fingerprint
    saved_fingerprint="$(cat "$state_file" 2>/dev/null || true)"
    if [ "$saved_fingerprint" != "$fingerprint" ]; then
        log_info "${label} source fingerprint changed; rebuilding images."
        return 0
    fi

    local service
    for service in "$@"; do
        if ! service_image_exists "$service"; then
            log_info "Image $(image_name_for_service "$service") is missing; rebuilding ${label} images."
            return 0
        fi
    done

    return 1
}

write_scope_fingerprint() {
    local scope="$1"
    local fingerprint="$2"

    ensure_build_state_dir
    printf '%s\n' "$fingerprint" > "$(state_file_for_scope "$scope")"
}

list_buildkit_executor_processes() {
    ps -eo pid=,user=,args= | awk -v pattern="$BUILDKIT_EXECUTOR_PATTERN" '
        index($0, pattern) > 0 {
            pid = $1
            user = $2
            $1 = ""
            $2 = ""
            sub(/^  */, "", $0)
            if ($0 ~ /^runc( |$)/ || $0 ~ /^\/usr\/bin\/containerd-shim-runc-v2( |$)/) {
                printf "%s\t%s\t%s\n", pid, user, $0
            }
        }
    '
}

list_other_build_processes() {
    ps -eo pid=,user=,comm=,args= | awk '
        ($3 == "docker" && ($0 ~ / compose .* build/ || $0 ~ / buildx build/)) || ($3 == "buildctl" && $0 ~ / build/) {
            pid = $1
            user = $2
            $1 = ""
            $2 = ""
            $3 = ""
            sub(/^  */, "", $0)
            printf "%s\t%s\t%s\n", pid, user, $0
        }
    '
}

print_process_table() {
    local process_list="$1"
    local pid user cmd

    while IFS=$'\t' read -r pid user cmd; do
        [ -n "$pid" ] || continue
        echo "  PID ${pid} (${user}): ${cmd}"
    done <<< "$process_list"
}

ensure_buildkit_ready() {
    require_docker_access

    # The Maven cache mount is intentionally shared across sequential image builds.
    # If the previous build was interrupted, BuildKit can leave behind an executor
    # process that keeps the cache lock alive until the host clears it.
    local stale_executors
    stale_executors="$(list_buildkit_executor_processes)"
    if [ -z "$stale_executors" ]; then
        return 0
    fi

    local active_builds
    active_builds="$(list_other_build_processes)"
    if [ -n "$active_builds" ]; then
        log_error "Detected active Docker build processes; deploy.sh will not clear BuildKit state concurrently."
        print_process_table "$active_builds"
        log_error "Wait for the running build to finish or stop it first, then rerun deploy.sh."
        exit 1
    fi

    log_warn "Detected stale BuildKit executor processes from a previous interrupted build:"
    print_process_table "$stale_executors"

    local stale_pids
    stale_pids="$(printf '%s\n' "$stale_executors" | awk -F '\t' '{print $1}' | tr '\n' ' ')"

    if command -v sudo >/dev/null 2>&1; then
        if sudo -n true 2>/dev/null; then
            log_info "Clearing stale BuildKit executor lock with sudo..."
            sudo kill $stale_pids
        elif [ -t 0 ]; then
            log_warn "A one-time sudo confirmation is required to clear the stale BuildKit lock."
            sudo kill $stale_pids
        else
            log_error "Stale BuildKit executor lock detected, but sudo is not available non-interactively in this session."
            log_info "Run 'sudo kill ${stale_pids}' on the host, then rerun deploy.sh."
            exit 1
        fi
    else
        log_error "Stale BuildKit executor lock detected, but sudo is unavailable."
        log_info "Kill the above PIDs as root, then rerun deploy.sh."
        exit 1
    fi

    sleep 2

    local remaining_executors
    remaining_executors="$(list_buildkit_executor_processes)"
    if [ -n "$remaining_executors" ]; then
        log_error "BuildKit executor lock still exists after cleanup."
        print_process_table "$remaining_executors"
        exit 1
    fi

    docker builder prune -f >/dev/null 2>&1 || true
    log_info "Stale BuildKit executor lock cleared; continuing with image build."
}

service_container_name() {
    echo "firefly-$1"
}

log_root_dir() {
    local configured_root="${APP_LOG_ROOT:-$SCRIPT_DIR/runtime/logs}"

    case "$configured_root" in
        /*) echo "$configured_root" ;;
        ./*) echo "$SCRIPT_DIR/${configured_root#./}" ;;
        *) echo "$SCRIPT_DIR/$configured_root" ;;
    esac
}

service_supports_host_logs() {
    local service="$1"
    local candidate

    for candidate in "${HOST_LOG_SERVICES[@]}"; do
        if [ "$candidate" = "$service" ]; then
            return 0
        fi
    done

    return 1
}

service_host_log_dir() {
    echo "$(log_root_dir)/$1"
}

default_host_log_files_for_service() {
    local service="$1"
    local base_dir
    base_dir="$(service_host_log_dir "$service")"

    case "$service" in
        web)
            printf '%s\n' "$base_dir/access.log" "$base_dir/error.log"
            ;;
        *)
            printf '%s\n' "$base_dir/firefly-$service.log"
            ;;
    esac
}

ensure_runtime_log_dirs() {
    local root_dir
    root_dir="$(log_root_dir)"

    mkdir -p "$root_dir"

    local service
    for service in "${HOST_LOG_SERVICES[@]}"; do
        mkdir -p "$root_dir/$service"
    done
}

is_known_service() {
    local requested="$1"
    local service

    for service in "${MANAGED_SERVICES[@]}"; do
        if [ "$service" = "$requested" ]; then
            return 0
        fi
    done

    return 1
}

validate_service_names() {
    local service

    for service in "$@"; do
        if ! is_known_service "$service"; then
            log_error "Unknown service: ${service}"
            log_info "Use 'bash deploy.sh logs --list' to see supported services."
            exit 1
        fi
    done
}

print_logs_usage() {
    cat <<EOF
Usage: bash deploy.sh logs [options] [service...]

Options:
  --file, --host-file  Tail host-mounted log files instead of container stdout
  --failed             Show recent logs for unhealthy/exited services
  --snapshot           Print recent logs and exit (no follow)
  --tail N             Number of lines to show (default: 100)
  --since DURATION     Container log time range, for example 10m or 2h
  --list               Show supported services and host log locations
  -h, --help           Show this help

Examples:
  bash deploy.sh logs gateway
  bash deploy.sh logs --snapshot system
  bash deploy.sh logs --failed
  bash deploy.sh logs --file system
  bash deploy.sh logs --file --snapshot web
EOF
}

print_logs_targets() {
    load_env
    ensure_runtime_log_dirs

    local root_dir
    root_dir="$(log_root_dir)"

    echo "Managed services:"
    local service
    for service in "${MANAGED_SERVICES[@]}"; do
        if service_supports_host_logs "$service"; then
            echo "  ${service}: container stdout + host files under $(service_host_log_dir "$service")"
        else
            echo "  ${service}: container stdout only"
        fi
    done

    echo ""
    echo "Host log root: ${root_dir}"
}

collect_unhealthy_services() {
    require_docker_access

    local -a selected_services=()
    if [ "$#" -gt 0 ]; then
        selected_services=("$@")
    else
        selected_services=("${MANAGED_SERVICES[@]}")
    fi

    local service
    for service in "${selected_services[@]}"; do
        local container_name runtime_state health_state
        container_name="$(service_container_name "$service")"
        runtime_state="$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || true)"

        if [ -z "$runtime_state" ]; then
            continue
        fi

        health_state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_name" 2>/dev/null || true)"

        if [ "$runtime_state" != "running" ]; then
            printf '%s\n' "$service"
            continue
        fi

        if [ "$health_state" != "none" ] && [ "$health_state" != "healthy" ]; then
            printf '%s\n' "$service"
        fi
    done
}

tail_host_logs() {
    local follow="$1"
    local tail_lines="$2"
    shift 2

    ensure_runtime_log_dirs

    local -a selected_services=()
    if [ "$#" -gt 0 ]; then
        selected_services=("$@")
    else
        selected_services=("${HOST_LOG_SERVICES[@]}")
    fi

    local -a files=()
    local service file

    for service in "${selected_services[@]}"; do
        if ! service_supports_host_logs "$service"; then
            log_warn "Service ${service} does not expose host-mounted log files; skipping."
            continue
        fi

        while IFS= read -r file; do
            [ -n "$file" ] || continue
            mkdir -p "$(dirname "$file")"
            touch "$file"
            files+=("$file")
        done < <(default_host_log_files_for_service "$service")
    done

    if [ "${#files[@]}" -eq 0 ]; then
        log_error "No host log files are available for the selected services."
        exit 1
    fi

    log_info "Using host log files under $(log_root_dir)"

    if [ "$follow" -eq 1 ]; then
        tail -n "$tail_lines" -F "${files[@]}"
    else
        tail -n "$tail_lines" "${files[@]}"
    fi
}

wait_for_service_healthy() {
    require_docker_access

    local service="$1"
    local timeout_seconds="${2:-180}"
    local container_name
    container_name="$(service_container_name "$service")"
    local elapsed=0

    log_info "Waiting for ${service} to become healthy..."

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        local runtime_state health_state
        runtime_state="$(docker inspect -f '{{.State.Status}}' "$container_name" 2>/dev/null || true)"
        health_state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_name" 2>/dev/null || true)"

        if [ "$runtime_state" = "running" ] && [ "$health_state" = "healthy" ]; then
            return 0
        fi

        if [ "$runtime_state" = "exited" ] || [ "$runtime_state" = "dead" ]; then
            log_error "Service ${service} stopped before becoming healthy."
            dc logs --tail=50 "$service" || true
            exit 1
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_error "Timed out waiting for ${service} to become healthy."
    dc ps "$service" || true
    dc logs --tail=50 "$service" || true
    exit 1
}

wait_for_http_endpoint() {
    local name="$1"
    local url="$2"
    local timeout_seconds="${3:-120}"
    local elapsed=0

    log_info "Waiting for ${name} endpoint: ${url}"

    while [ "$elapsed" -lt "$timeout_seconds" ]; do
        if curl -fsS "$url" >/dev/null 2>&1; then
            return 0
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    log_error "Timed out waiting for ${name} endpoint: ${url}"
    exit 1
}

wait_for_infrastructure_ready() {
    wait_for_service_healthy postgres 120
    wait_for_service_healthy redis 120
    wait_for_service_healthy kafka 180
    wait_for_service_healthy nacos 180
    wait_for_service_healthy minio 120
    wait_for_http_endpoint "ZLMediaKit API" "http://localhost:${ZLM_PORT:-18080}/index/api/getServerConfig?secret=${ZLM_SECRET:-035c73f7bb6b4889a715d9eb2d1925cc}" 120
}

wait_for_application_ready() {
    local service

    for service in gateway system device rule media data support connector; do
        wait_for_service_healthy "$service" 180
    done

    wait_for_service_healthy web 120
    wait_for_http_endpoint "Gateway health" "http://localhost:8080/actuator/health" 120
    wait_for_http_endpoint "Rule health" "http://localhost:9030/actuator/health" 120
    wait_for_http_endpoint "Web" "http://localhost/" 120
}

build_application_images() {
    load_env
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    log_step "Preparing application images..."
    build_backend_images
    build_web_image
    log_info "Application images are ready"
}

build_backend_images() {
    local fingerprint
    fingerprint="$(compute_backend_fingerprint)"

    # All Java service images share the same backend source tree, so one
    # fingerprint is enough to decide whether the sequential rebuild is needed.
    if ! scope_needs_build backend "$fingerprint" "${BACKEND_BUILD_SERVICES[@]}"; then
        log_info "Backend images are unchanged; skipping rebuild."
        return 0
    fi

    ensure_buildkit_ready

    local service
    for service in "${BACKEND_BUILD_SERVICES[@]}"; do
        log_step "Building backend image: ${service}"
        dc build "${service}"
    done

    write_scope_fingerprint backend "$fingerprint"
}

build_web_image() {
    local fingerprint
    fingerprint="$(compute_web_fingerprint)"

    if ! scope_needs_build web "$fingerprint" web; then
        log_info "Frontend image is unchanged; skipping rebuild."
        return 0
    fi

    log_step "Building frontend image: web"
    dc build web
    write_scope_fingerprint web "$fingerprint"
}

dc() {
    require_docker_access
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

dc_release() {
    require_docker_access
    docker compose -f "$RELEASE_COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

cmd_infra() {
    load_env
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    ensure_named_volumes
    prepare_zlm_config
    check_container_conflicts postgres redis kafka nacos minio sentinel zlmediakit
    log_step "Starting infrastructure services..."
    dc up -d postgres redis kafka nacos minio sentinel zlmediakit
    wait_for_infrastructure_ready
    log_info "Infrastructure services are ready"
}

cmd_build() {
    build_application_images
}

cmd_up() {
    load_env
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    ensure_named_volumes
    ensure_runtime_log_dirs
    prepare_zlm_config
    check_container_conflicts postgres redis kafka nacos minio sentinel zlmediakit gateway system device rule media data support connector web
    log_step "=== Firefly IoT full deployment ==="

    log_step "[1/4] Starting infrastructure..."
    dc up -d postgres redis kafka nacos minio sentinel zlmediakit
    wait_for_infrastructure_ready

    log_step "[2/4] Preparing backend images..."
    build_backend_images

    log_step "[3/4] Starting backend services..."
    dc up -d gateway system device rule media data support connector

    log_step "[4/4] Preparing and starting frontend..."
    build_web_image
    dc up -d web
    wait_for_application_ready

    echo ""
    log_info "=== Deployment completed ==="
    echo ""
    echo "  Frontend:            http://localhost"
    echo "  Gateway API:         http://localhost:8080"
    echo "  Connector HTTP:      http://localhost:9070"
    echo "  MQTT endpoint:       mqtt://localhost:1883"
    echo "  CoAP endpoint:       coap://localhost:5683"
    echo "  Nacos console:       http://localhost:8848/nacos"
    echo "  MinIO console:       http://localhost:9001"
    echo "  Sentinel dashboard:  http://localhost:8858"
    echo "  ZLMediaKit HTTP:     http://localhost:${ZLM_PORT:-18080}"
    echo ""
    dc ps
}

cmd_release() {
    load_env
    require_release_image_config
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    log_info "Using application images ${APP_IMAGE_REGISTRY}/${APP_IMAGE_NAMESPACE}: ${APP_IMAGE_TAG}"
    ensure_named_volumes
    ensure_runtime_log_dirs
    prepare_zlm_config
    check_container_conflicts postgres redis kafka nacos minio sentinel zlmediakit gateway system device rule media data support connector web
    log_step "=== Firefly IoT GitHub release deployment ==="

    log_step "[1/4] Starting infrastructure..."
    dc_release up -d postgres redis kafka nacos minio sentinel zlmediakit
    wait_for_infrastructure_ready

    log_step "[2/4] Pulling application images..."
    registry_login_if_configured
    dc_release pull gateway system device rule media data support connector web

    log_step "[3/4] Starting backend services..."
    dc_release up -d --no-build gateway system device rule media data support connector

    log_step "[4/4] Starting frontend..."
    dc_release up -d --no-build web
    wait_for_application_ready

    echo ""
    log_info "=== Release deployment completed ==="
    echo ""
    echo "  Frontend:            http://localhost"
    echo "  Gateway API:         http://localhost:8080"
    echo "  Connector HTTP:      http://localhost:9070"
    echo "  MQTT endpoint:       mqtt://localhost:1883"
    echo "  CoAP endpoint:       coap://localhost:5683"
    echo "  Nacos console:       http://localhost:8848/nacos"
    echo "  MinIO console:       http://localhost:9001"
    echo "  Sentinel dashboard:  http://localhost:8858"
    echo "  ZLMediaKit HTTP:     http://localhost:${ZLM_PORT:-18080}"
    echo ""
    dc_release ps
}

cmd_down() {
    log_step "Stopping all services..."
    dc down
    log_info "All services stopped"
}

cmd_restart() {
    log_step "Restarting application services..."
    dc restart gateway system device rule media data support connector web
    log_info "Application services restarted"
}

cmd_logs() {
    load_env

    local follow=1
    local tail_lines=100
    local since=""
    local failed_only=0
    local file_mode=0
    local list_mode=0
    local -a services=()

    while [ "$#" -gt 0 ]; do
        case "$1" in
            --file|--host-file)
                file_mode=1
                ;;
            --failed)
                failed_only=1
                follow=0
                ;;
            --snapshot|--no-follow)
                follow=0
                ;;
            --tail)
                shift
                if [ "$#" -eq 0 ]; then
                    log_error "--tail requires a numeric value."
                    exit 1
                fi
                tail_lines="$1"
                ;;
            --since)
                shift
                if [ "$#" -eq 0 ]; then
                    log_error "--since requires a duration value."
                    exit 1
                fi
                since="$1"
                ;;
            --list)
                list_mode=1
                follow=0
                ;;
            -h|--help)
                print_logs_usage
                return 0
                ;;
            --)
                shift
                while [ "$#" -gt 0 ]; do
                    services+=("$1")
                    shift
                done
                break
                ;;
            -*)
                log_error "Unknown logs option: $1"
                print_logs_usage
                exit 1
                ;;
            *)
                services+=("$1")
                ;;
        esac
        shift
    done

    if [ "$list_mode" -eq 1 ]; then
        print_logs_targets
        return 0
    fi

    validate_service_names "${services[@]}"

    if [ "$failed_only" -eq 1 ]; then
        local failed_services_raw
        failed_services_raw="$(collect_unhealthy_services "${services[@]}")"

        services=()
        while IFS= read -r service; do
            [ -n "$service" ] || continue
            services+=("$service")
        done <<< "$failed_services_raw"

        if [ "${#services[@]}" -eq 0 ]; then
            log_info "All selected services are running and healthy."
            return 0
        fi

        log_info "Showing recent logs for unhealthy services: ${services[*]}"
    fi

    if [ "$file_mode" -eq 1 ]; then
        if [ -n "$since" ]; then
            log_error "--since is only supported for container stdout logs."
            exit 1
        fi
        tail_host_logs "$follow" "$tail_lines" "${services[@]}"
        return 0
    fi

    local -a log_args=(logs "--tail=$tail_lines")
    if [ "$follow" -eq 1 ]; then
        log_args+=(-f)
    fi
    if [ -n "$since" ]; then
        log_args+=("--since=$since")
    fi

    dc "${log_args[@]}" "${services[@]}"
}

cmd_status() {
    dc ps -a
}

cmd_clean() {
    log_warn "This will remove containers and volumes, and data will be lost."
    read -p "Continue? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        dc down -v --remove-orphans
        remove_managed_volumes
        rm -rf "$BUILD_STATE_DIR"
        docker image prune -f --filter "label=app=firefly-iot"
        log_info "Cleanup completed"
    else
        log_info "Cleanup cancelled"
    fi
}

case "${1:-up}" in
    infra)   cmd_infra ;;
    build)   cmd_build ;;
    up)      cmd_up ;;
    release) cmd_release ;;
    down)    cmd_down ;;
    restart) cmd_restart ;;
    logs)    shift; cmd_logs "$@" ;;
    status)  cmd_status ;;
    clean)   cmd_clean ;;
    *)
        echo "Usage: $0 {infra|build|up|release|down|restart|logs|status|clean}"
        echo ""
        echo "  infra    Start PostgreSQL, Redis, Kafka, Nacos, MinIO, Sentinel, ZLMediaKit"
        echo "  build    Build application images"
        echo "  up       Full deployment (default)"
        echo "  release  Pull GHCR application images and deploy the full stack"
        echo "  down     Stop all services"
        echo "  restart  Restart application services"
        echo "  logs     Tail container logs or host-mounted log files"
        echo "  status   Show container status"
        echo "  clean    Remove containers and volumes"
        exit 1
        ;;
esac
