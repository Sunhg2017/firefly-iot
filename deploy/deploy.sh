#!/bin/bash
# ============================================================
# Firefly IoT one-click deployment script
# Usage: cd deploy && bash deploy.sh [command]
#
# Commands:
#   infra    Start infrastructure only
#   build    Build backend jars and frontend assets
#   up       Build and start the full stack
#   down     Stop all containers
#   restart  Restart application services
#   logs     Tail logs
#   status   Show container status
#   clean    Stop and remove containers plus volumes
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"
ENV_FILE="$SCRIPT_DIR/.env"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${BLUE}[STEP]${NC}  $1"; }

check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        log_warn ".env not found, copying from .env.example"
        cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
        log_info "Created $ENV_FILE. Update the values, then rerun the command."
        exit 1
    fi
}

find_mvn() {
    if [ -x "$PROJECT_ROOT/mvnw" ]; then
        echo "$PROJECT_ROOT/mvnw"
    elif command -v mvn >/dev/null 2>&1; then
        echo "mvn"
    else
        log_error "Maven not found (mvn or mvnw)"
        exit 1
    fi
}

build_backend() {
    log_step "Building backend services..."
    cd "$PROJECT_ROOT"
    MVN=$(find_mvn)
    "$MVN" clean package -DskipTests -T 4 \
        -pl firefly-gateway,firefly-system,firefly-device,firefly-rule,firefly-media,firefly-data,firefly-support,firefly-connector \
        -am
    log_info "Backend build completed"
}

build_frontend() {
    log_step "Building frontend..."
    cd "$PROJECT_ROOT/firefly-web"
    npm ci --registry=https://registry.npmmirror.com
    npm run build
    log_info "Frontend build completed"
}

dc() {
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

cmd_infra() {
    check_env
    log_step "Starting infrastructure services..."
    dc up -d postgres redis kafka nacos minio sentinel zlmediakit
    log_info "Waiting for PostgreSQL to become ready..."
    dc exec postgres sh -c 'until pg_isready -U firefly; do sleep 2; done' 2>/dev/null
    log_info "Waiting for ZLMediaKit API to become ready..."
    until curl -fsS "http://localhost:${ZLM_PORT:-18080}/index/api/getServerConfig?secret=${ZLM_SECRET:-035c73f7-bb6b-4889-a715-d9eb2d1925cc}" >/dev/null 2>&1; do
        sleep 2
    done
    log_info "Infrastructure services are ready"
}

cmd_build() {
    build_backend
    build_frontend
    log_info "Artifacts are ready. Docker images will be built during 'up'."
}

cmd_up() {
    check_env
    log_step "=== Firefly IoT full deployment ==="

    log_step "[1/4] Building backend..."
    build_backend

    log_step "[2/4] Starting infrastructure..."
    dc up -d postgres redis kafka nacos minio sentinel zlmediakit
    log_info "Waiting for infrastructure health checks..."
    sleep 15

    log_step "[3/4] Building and starting application services..."
    dc up -d --build gateway system device rule media data support connector

    log_step "[4/4] Building and starting frontend..."
    dc up -d --build web

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
        echo "  build    Build backend jars and frontend assets"
        echo "  up       Full deployment (default)"
        echo "  down     Stop all services"
        echo "  restart  Restart application services"
        echo "  logs     Tail logs, optionally pass service names"
        echo "  status   Show container status"
        echo "  clean    Remove containers and volumes"
        exit 1
        ;;
esac
