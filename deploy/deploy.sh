#!/bin/bash
# ============================================================
# Firefly IoT one-click deployment script
# Usage: cd deploy && bash deploy.sh [command]
#
# Commands:
#   infra    Start infrastructure only
#   build    Build application images
#   up       Build and start the full stack
#   down     Stop all containers
#   restart  Restart application services
#   logs     Tail logs
#   status   Show container status
#   clean    Stop and remove containers plus volumes
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env"
DOCKER_ACCESS_CHECKED=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"

BACKEND_BUILD_SERVICES=(gateway system device rule media data support connector)

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

    local compose_project
    compose_project="$(compose_project_name)"

    for volume_key in postgres_data redis_data kafka_data minio_data connector_mqtt_data; do
        local volume_name
        volume_name="$(volume_name_for "$volume_key")"

        if docker volume inspect "$volume_name" >/dev/null 2>&1; then
            continue
        fi

        log_info "Creating volume ${volume_name}"
        docker volume create \
            --label "com.docker.compose.project=${compose_project}" \
            --label "com.docker.compose.volume=${volume_key}" \
            "$volume_name" >/dev/null
    done
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

build_application_images() {
    load_env
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    log_step "Building application images from source..."
    build_backend_images
    build_web_image
    log_info "Application images are ready"
}

build_backend_images() {
    local service
    for service in "${BACKEND_BUILD_SERVICES[@]}"; do
        log_step "Building backend image: ${service}"
        dc build "${service}"
    done
}

build_web_image() {
    log_step "Building frontend image: web"
    dc build web
}

dc() {
    require_docker_access
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

cmd_infra() {
    load_env
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    ensure_named_volumes
    prepare_zlm_config
    check_container_conflicts postgres redis kafka nacos minio sentinel zlmediakit
    log_step "Starting infrastructure services..."
    dc up -d --build postgres redis kafka nacos minio sentinel zlmediakit
    log_info "Waiting for PostgreSQL to become ready..."
    dc exec postgres sh -c 'until pg_isready -U firefly; do sleep 2; done' 2>/dev/null
    log_info "Waiting for ZLMediaKit API to become ready..."
    until curl -fsS "http://localhost:${ZLM_PORT:-18080}/index/api/getServerConfig?secret=${ZLM_SECRET:-035c73f7bb6b4889a715d9eb2d1925cc}" >/dev/null 2>&1; do
        sleep 2
    done
    log_info "Infrastructure services are ready"
}

cmd_build() {
    build_application_images
}

cmd_up() {
    load_env
    log_info "Using deploy environment '${DEPLOY_ENV}' with Nacos namespace '${NACOS_NAMESPACE}'"
    ensure_named_volumes
    prepare_zlm_config
    check_container_conflicts postgres redis kafka nacos minio sentinel zlmediakit gateway system device rule media data support connector web
    log_step "=== Firefly IoT full deployment ==="

    log_step "[1/4] Starting infrastructure..."
    dc up -d --build postgres redis kafka nacos minio sentinel zlmediakit
    log_info "Waiting for infrastructure health checks..."
    sleep 15

    log_step "[2/4] Building backend images..."
    build_backend_images

    log_step "[3/4] Starting backend services..."
    dc up -d gateway system device rule media data support connector

    log_step "[4/4] Building and starting frontend..."
    build_web_image
    dc up -d web

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
    dc logs -f --tail=100 "$@"
}

cmd_status() {
    dc ps -a
}

cmd_clean() {
    log_warn "This will remove containers and volumes, and data will be lost."
    read -p "Continue? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        dc down -v --remove-orphans
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
    down)    cmd_down ;;
    restart) cmd_restart ;;
    logs)    shift; cmd_logs "$@" ;;
    status)  cmd_status ;;
    clean)   cmd_clean ;;
    *)
        echo "Usage: $0 {infra|build|up|down|restart|logs|status|clean}"
        echo ""
        echo "  infra    Start PostgreSQL, Redis, Kafka, Nacos, MinIO, Sentinel, ZLMediaKit"
        echo "  build    Build application images"
        echo "  up       Full deployment (default)"
        echo "  down     Stop all services"
        echo "  restart  Restart application services"
        echo "  logs     Tail logs, optionally pass service names"
        echo "  status   Show container status"
        echo "  clean    Remove containers and volumes"
        exit 1
        ;;
esac
