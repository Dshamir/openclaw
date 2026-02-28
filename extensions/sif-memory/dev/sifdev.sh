#!/usr/bin/env bash
# sifdev.sh — SIF Memory Dev Orchestrator
# A mini devops toolkit for containerized SIF memory development.
#
# Usage: ./sifdev.sh <command> [options]
# Run ./sifdev.sh help for full command list.
set -euo pipefail

# ---------------------------------------------------------------------------
# Constants & paths
# ---------------------------------------------------------------------------
SIFDEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SIFDEV_DIR/../../.." && pwd)"
CONTAINER_NAME="openclaw-sifdev"
IMAGE_BASE="openclaw:local"
IMAGE_SIFDEV="openclaw-sifdev:local"
COMPOSE_FILE="$SIFDEV_DIR/docker-compose.sifdev.yml"
BACKUP_DIR="$SIFDEV_DIR/backups"
WATCHDOG_PID_FILE="$SIFDEV_DIR/.watchdog.pid"
WATCHDOG_LOG="$SIFDEV_DIR/watchdog.log"

# Compose override for dev hot-reload mode
COMPOSE_DEV_OVERRIDE="$SIFDEV_DIR/.docker-compose.dev-override.yml"

# ---------------------------------------------------------------------------
# Colors (with tput fallback)
# ---------------------------------------------------------------------------
if command -v tput >/dev/null 2>&1 && [ -t 1 ]; then
  GREEN=$(tput setaf 2)
  RED=$(tput setaf 1)
  YELLOW=$(tput setaf 3)
  BLUE=$(tput setaf 4)
  BOLD=$(tput bold)
  RESET=$(tput sgr0)
else
  GREEN=""
  RED=""
  YELLOW=""
  BLUE=""
  BOLD=""
  RESET=""
fi

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()  { echo "${BLUE}[sifdev]${RESET} $*"; }
ok()    { echo "${GREEN}[sifdev]${RESET} $*"; }
warn()  { echo "${YELLOW}[sifdev]${RESET} $*" >&2; }
err()   { echo "${RED}[sifdev]${RESET} $*" >&2; }
die()   { err "$@"; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is not installed"
  docker info >/dev/null 2>&1 || die "Docker daemon is not running"
}

# Check if a Docker image exists locally
image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

# Check if the container is running
container_running() {
  docker inspect --format='{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null | grep -q "true"
}

# Check if the container exists (running or stopped)
container_exists() {
  docker inspect "$CONTAINER_NAME" >/dev/null 2>&1
}

# Build compose command with optional dev override
compose_cmd() {
  local args=("-f" "$COMPOSE_FILE")
  if [ "${SIFDEV_DEV_MODE:-}" = "1" ] && [ -f "$COMPOSE_DEV_OVERRIDE" ]; then
    args+=("-f" "$COMPOSE_DEV_OVERRIDE")
  fi
  docker compose "${args[@]}" "$@"
}

# Generate the dev override compose file for hot-reload
generate_dev_override() {
  cat > "$COMPOSE_DEV_OVERRIDE" <<YAML
services:
  sifdev-gateway:
    volumes:
      - $REPO_ROOT/extensions/sif-memory:/app/extensions/sif-memory
YAML
}

# Wait for health check to pass (up to $1 seconds, default 30)
wait_healthy() {
  local timeout="${1:-30}"
  local elapsed=0
  info "Waiting for container to become healthy (${timeout}s timeout)..."
  while [ "$elapsed" -lt "$timeout" ]; do
    local health
    health=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "missing")
    case "$health" in
      healthy)
        ok "Container is healthy"
        return 0
        ;;
      unhealthy)
        warn "Container reported unhealthy"
        return 1
        ;;
    esac
    sleep 2
    elapsed=$((elapsed + 2))
  done
  warn "Health check timed out after ${timeout}s"
  return 1
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_launch() {
  local dev_mode=0
  for arg in "$@"; do
    case "$arg" in
      --dev) dev_mode=1 ;;
    esac
  done

  require_docker

  # Build base image if missing
  if ! image_exists "$IMAGE_BASE"; then
    info "Base image $IMAGE_BASE not found, building from repo root..."
    docker build -t "$IMAGE_BASE" -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT"
    ok "Base image built"
  fi

  # Build SIF layer
  info "Building SIF dev image..."
  docker build \
    -t "$IMAGE_SIFDEV" \
    --build-arg "BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -f "$SIFDEV_DIR/Dockerfile.sifdev" \
    "$REPO_ROOT"
  ok "SIF dev image built"

  # Dev hot-reload mode
  if [ "$dev_mode" = "1" ]; then
    export SIFDEV_DEV_MODE=1
    generate_dev_override
    info "Dev hot-reload mode enabled (extension bind-mounted)"
  fi

  # Start services
  compose_cmd up -d
  ok "Container started"

  # Wait for health
  if wait_healthy 30; then
    local port="${SIFDEV_PORT:-18789}"
    echo ""
    ok "SIF dev environment is ready!"
    echo "  ${BOLD}Gateway:${RESET}  http://localhost:${port}"
    echo "  ${BOLD}Web UI:${RESET}   http://localhost:${port}/ui/"
    [ "$dev_mode" = "1" ] && echo "  ${BOLD}Mode:${RESET}     DEV (hot-reload, restart to pick up changes)"
    echo ""
  else
    warn "Container started but health check did not pass"
    warn "Check logs: ./sifdev.sh logs"
  fi
}

cmd_stop() {
  require_docker
  if ! container_exists; then
    warn "Container $CONTAINER_NAME not found"
    return 0
  fi
  info "Stopping SIF dev environment..."
  compose_cmd down -t 10
  ok "Stopped"
}

cmd_restart() {
  cmd_stop
  cmd_launch "$@"
}

cmd_rebuild() {
  local sif_only=0
  local passthrough=()
  for arg in "$@"; do
    case "$arg" in
      --sif-only) sif_only=1 ;;
      *) passthrough+=("$arg") ;;
    esac
  done

  require_docker

  if [ "$sif_only" = "1" ]; then
    info "Rebuilding SIF layer only..."
    docker build \
      -t "$IMAGE_SIFDEV" \
      --build-arg "BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      -f "$SIFDEV_DIR/Dockerfile.sifdev" \
      "$REPO_ROOT"
    ok "SIF layer rebuilt"
  else
    info "Full rebuild (base + SIF layer)..."
    docker build -t "$IMAGE_BASE" -f "$REPO_ROOT/Dockerfile" "$REPO_ROOT"
    ok "Base image rebuilt"
    docker build \
      -t "$IMAGE_SIFDEV" \
      --build-arg "BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      -f "$SIFDEV_DIR/Dockerfile.sifdev" \
      "$REPO_ROOT"
    ok "SIF layer rebuilt"
  fi

  # Restart
  cmd_stop
  cmd_launch "${passthrough[@]}"
}

cmd_health() {
  require_docker

  local exit_code=0

  # 1. Container check
  if container_running; then
    local restarts oom uptime_raw
    restarts=$(docker inspect --format='{{.RestartCount}}' "$CONTAINER_NAME" 2>/dev/null || echo "?")
    oom=$(docker inspect --format='{{.State.OOMKilled}}' "$CONTAINER_NAME" 2>/dev/null || echo "?")
    echo "${GREEN}CONTAINER .. UP${RESET}   (restarts: $restarts, oom: $oom)"
  else
    echo "${RED}CONTAINER .. DOWN${RESET}"
    exit_code=1
  fi

  # 2. Gateway check (TCP socket probe)
  local port="${SIFDEV_PORT:-18789}"
  if container_running && docker exec "$CONTAINER_NAME" node --input-type=module -e "
    import net from 'node:net';
    const socket = net.createConnection({ host: '127.0.0.1', port: $port });
    const timeout = setTimeout(() => { socket.destroy(); process.exit(1); }, 3000);
    socket.on('connect', () => { clearTimeout(timeout); socket.end(); process.exit(0); });
    socket.on('error', () => { clearTimeout(timeout); process.exit(1); });
  " >/dev/null 2>&1; then
    echo "${GREEN}GATEWAY .... UP${RESET}   ws://localhost:${port}"
  else
    echo "${RED}GATEWAY .... DOWN${RESET}"
    exit_code=1
  fi

  # 3. SIF graph check
  if container_running; then
    local graph_info
    graph_info=$(docker exec "$CONTAINER_NAME" node -e "
      const fs = require('fs');
      const path = '/home/node/.openclaw/sif/pointer-graph.json';
      try {
        const data = JSON.parse(fs.readFileSync(path, 'utf8'));
        const pointers = data.pointers || [];
        const count = pointers.length;
        const avgWeight = count > 0 ? (pointers.reduce((s,p) => s + (p.weight||0), 0) / count).toFixed(2) : '0.00';
        console.log('OK|' + count + '|' + avgWeight);
      } catch (e) {
        if (e.code === 'ENOENT') console.log('EMPTY|0|0.00');
        else console.log('ERR|0|0.00');
      }
    " 2>/dev/null || echo "ERR|0|0.00")

    local status count avg
    IFS='|' read -r status count avg <<< "$graph_info"
    case "$status" in
      OK)    echo "${GREEN}SIF GRAPH .. OK${RESET}   ${count} pointers | avg weight ${avg}" ;;
      EMPTY) echo "${YELLOW}SIF GRAPH .. EMPTY${RESET} (no graph file yet, first boot)" ;;
      *)     echo "${RED}SIF GRAPH .. ERR${RESET}"; exit_code=1 ;;
    esac
  fi

  # 4. Uptime
  if container_running; then
    local started_at uptime_str
    started_at=$(docker inspect --format='{{.State.StartedAt}}' "$CONTAINER_NAME" 2>/dev/null || echo "")
    if [ -n "$started_at" ]; then
      # Calculate uptime from container start time
      local start_epoch now_epoch diff_s
      start_epoch=$(date -d "$started_at" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%S" "${started_at%%.*}" +%s 2>/dev/null || echo "0")
      now_epoch=$(date +%s)
      diff_s=$((now_epoch - start_epoch))
      local hours=$((diff_s / 3600))
      local mins=$(( (diff_s % 3600) / 60 ))
      echo "${GREEN}UPTIME ..... ${hours}h ${mins}m${RESET}"
    fi

    # Memory usage
    local mem_usage
    mem_usage=$(docker stats --no-stream --format '{{.MemUsage}}' "$CONTAINER_NAME" 2>/dev/null || echo "?")
    local mem_limit="${SIFDEV_MEM_LIMIT:-512m}"
    echo "${GREEN}MEMORY ..... ${mem_usage}${RESET}"
  fi

  return $exit_code
}

cmd_status() {
  require_docker

  echo "${BOLD}=== SIF Dev Environment Status ===${RESET}"
  echo ""

  # Container state
  if container_running; then
    echo "State:     ${GREEN}running${RESET}"
  elif container_exists; then
    echo "State:     ${YELLOW}stopped${RESET}"
  else
    echo "State:     ${RED}not found${RESET}"
    return 0
  fi

  # Image details
  if image_exists "$IMAGE_SIFDEV"; then
    local img_id img_size img_created
    img_id=$(docker image inspect --format='{{.Id}}' "$IMAGE_SIFDEV" 2>/dev/null | cut -c8-19)
    img_size=$(docker image inspect --format='{{.Size}}' "$IMAGE_SIFDEV" 2>/dev/null)
    img_created=$(docker image inspect --format='{{.Created}}' "$IMAGE_SIFDEV" 2>/dev/null | cut -c1-19)
    # Convert bytes to MB
    local size_mb=""
    if [ -n "$img_size" ]; then
      size_mb="$(( img_size / 1048576 ))MB"
    fi
    echo "Image:     ${IMAGE_SIFDEV} (${img_id}, ${size_mb}, built ${img_created})"
  fi

  # Port bindings
  if container_exists; then
    local ports
    ports=$(docker inspect --format='{{range $p, $conf := .NetworkSettings.Ports}}{{$p}} -> {{(index $conf 0).HostPort}}{{"\n"}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || echo "none")
    echo "Ports:     ${ports}"
  fi

  # Volume mounts
  if container_exists; then
    local vols
    vols=$(docker inspect --format='{{range .Mounts}}{{.Type}}: {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || echo "none")
    echo "Volumes:   ${vols}"
  fi

  # Mode indicator
  if container_exists; then
    local has_bind
    has_bind=$(docker inspect --format='{{range .Mounts}}{{if eq .Type "bind"}}bind{{end}}{{end}}' "$CONTAINER_NAME" 2>/dev/null || echo "")
    if [ -n "$has_bind" ]; then
      echo "Mode:      ${YELLOW}DEV${RESET} (hot-reload, extension bind-mounted)"
    else
      echo "Mode:      PROD (baked image)"
    fi
  fi

  # SIF config from container
  if container_running; then
    echo ""
    echo "${BOLD}SIF Config:${RESET}"
    docker exec "$CONTAINER_NAME" node -e "
      const fs = require('fs');
      try {
        const cfg = JSON.parse(fs.readFileSync('/home/node/.openclaw/openclaw.json', 'utf8'));
        const mem = cfg.memory || {};
        console.log('  backend:            ' + (mem.backend || 'not set'));
        const sif = mem.sif || {};
        console.log('  graphPath:          ' + (sif.graphPath || '(default)'));
        console.log('  maxContextPointers: ' + (sif.maxContextPointers || 8));
        console.log('  minContextWeight:   ' + (sif.minContextWeight || 0.2));
        console.log('  decayHalfLifeDays:  ' + (sif.decayHalfLifeDays || 30));
      } catch { console.log('  (could not read config)'); }
    " 2>/dev/null || echo "  (container not accessible)"
  fi
}

cmd_logs() {
  require_docker
  compose_cmd logs "$@"
}

cmd_shell() {
  require_docker
  if ! container_running; then
    die "Container is not running. Start it with: ./sifdev.sh launch"
  fi
  docker exec -it "$CONTAINER_NAME" bash
}

cmd_config() {
  require_docker
  if ! container_running; then
    die "Container is not running. Start it with: ./sifdev.sh launch"
  fi

  if [ $# -eq 0 ]; then
    # Dump all config
    docker exec "$CONTAINER_NAME" node openclaw.mjs config list 2>/dev/null || \
      docker exec "$CONTAINER_NAME" cat /home/node/.openclaw/openclaw.json
  elif [ $# -eq 1 ]; then
    # Get specific key
    docker exec "$CONTAINER_NAME" node openclaw.mjs config get "$1" 2>/dev/null || \
      warn "Could not read key: $1"
  else
    # Set key=value
    local key="$1" value="$2"
    docker exec "$CONTAINER_NAME" node openclaw.mjs config set "$key" "$value"
    ok "Set $key = $value"
    warn "Restart the container for changes to take effect: ./sifdev.sh restart"
  fi
}

cmd_backup() {
  require_docker
  if ! container_running; then
    die "Container is not running"
  fi

  local name="${1:-sif-backup-$(date +%Y%m%d-%H%M%S)}"
  local dest="$BACKUP_DIR/$name"
  mkdir -p "$dest"

  info "Backing up SIF data to $dest..."
  docker cp "$CONTAINER_NAME:/home/node/.openclaw/sif/." "$dest/"

  # Print stats
  if [ -f "$dest/pointer-graph.json" ]; then
    local count
    count=$(node -e "
      const data = JSON.parse(require('fs').readFileSync('$dest/pointer-graph.json', 'utf8'));
      console.log((data.pointers || []).length);
    " 2>/dev/null || echo "?")
    ok "Backup complete: $dest ($count pointers)"
  else
    ok "Backup complete: $dest (no graph file)"
  fi
}

cmd_restore() {
  require_docker
  if [ $# -eq 0 ]; then
    die "Usage: ./sifdev.sh restore <backup-name>"
  fi

  local name="$1"
  local src="$BACKUP_DIR/$name"
  if [ ! -d "$src" ]; then
    die "Backup not found: $src"
  fi

  info "Restoring SIF data from $src..."

  # Stop if running
  if container_running; then
    cmd_stop
  fi

  # Start a temporary container to copy data into the volume
  compose_cmd up -d
  sleep 2
  docker cp "$src/." "$CONTAINER_NAME:/home/node/.openclaw/sif/"
  ok "Data restored"

  # Restart and verify
  compose_cmd restart
  if wait_healthy 30; then
    ok "Restore complete and healthy"
  else
    warn "Restore complete but health check did not pass"
  fi
}

cmd_port_forward() {
  local port="${1:-}"
  if [ -z "$port" ]; then
    die "Usage: ./sifdev.sh port-forward <HOST_PORT>"
  fi

  export SIFDEV_PORT="$port"
  info "Restarting with port mapping ${port}:18789..."
  cmd_stop
  cmd_launch
}

cmd_watch() {
  if [ "${1:-}" = "stop" ]; then
    if [ -f "$WATCHDOG_PID_FILE" ]; then
      local pid
      pid=$(cat "$WATCHDOG_PID_FILE")
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid"
        rm -f "$WATCHDOG_PID_FILE"
        ok "Watchdog stopped (pid $pid)"
      else
        rm -f "$WATCHDOG_PID_FILE"
        warn "Watchdog process $pid was not running"
      fi
    else
      warn "No watchdog PID file found"
    fi
    return 0
  fi

  # Check if already running
  if [ -f "$WATCHDOG_PID_FILE" ]; then
    local pid
    pid=$(cat "$WATCHDOG_PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      warn "Watchdog already running (pid $pid). Stop with: ./sifdev.sh watch stop"
      return 1
    fi
  fi

  info "Starting watchdog (health check every 30s, restart after 3 failures)..."
  (
    local fail_count=0
    while true; do
      sleep 30
      if cmd_health >/dev/null 2>&1; then
        fail_count=0
      else
        fail_count=$((fail_count + 1))
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WARN health check failed ($fail_count/3)" >> "$WATCHDOG_LOG"
        if [ "$fail_count" -ge 3 ]; then
          echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) ACTION restarting container" >> "$WATCHDOG_LOG"
          cmd_restart 2>&1 | while read -r line; do echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) RESTART $line"; done >> "$WATCHDOG_LOG"
          fail_count=0
        fi
      fi
    done
  ) &
  local bg_pid=$!
  echo "$bg_pid" > "$WATCHDOG_PID_FILE"
  ok "Watchdog started (pid $bg_pid, log: $WATCHDOG_LOG)"
}

cmd_clean() {
  require_docker
  local clean_all=0
  for arg in "$@"; do
    case "$arg" in
      --all) clean_all=1 ;;
    esac
  done

  # Stop and remove container
  if container_exists; then
    info "Removing container..."
    compose_cmd down -t 5 2>/dev/null || true
  fi

  # Remove SIF image
  if image_exists "$IMAGE_SIFDEV"; then
    info "Removing SIF dev image..."
    docker rmi "$IMAGE_SIFDEV" 2>/dev/null || true
  fi

  if [ "$clean_all" = "1" ]; then
    # Remove data volume
    info "Removing data volume..."
    docker volume rm openclaw-sifdev-data 2>/dev/null || true

    # Remove backups
    if [ -d "$BACKUP_DIR" ]; then
      info "Removing backups..."
      rm -rf "$BACKUP_DIR"
    fi

    # Remove generated files
    rm -f "$COMPOSE_DEV_OVERRIDE"
    rm -f "$WATCHDOG_PID_FILE"
    rm -f "$WATCHDOG_LOG"
  fi

  ok "Clean complete"
}

cmd_info() {
  local port="${SIFDEV_PORT:-18789}"
  cat <<EOF

${BOLD}=== SIF Memory Dev Environment ===${RESET}

${BOLD}Architecture:${RESET}

  +--------------------------+
  |  openclaw-sifdev:local   |   (Docker container)
  |                          |
  |  OpenClaw Gateway        |
  |    + SIF Memory Plugin   |
  |                          |
  |  Port: 18789 (internal)  |
  +--------+-----------+-----+
           |           |
    +------+------+  +-+------------------+
    | Named Vol   |  | Bind Mount (--dev) |
    | sifdev-data |  | extensions/        |
    | (graph)     |  | sif-memory/        |
    +-------------+  +--------------------+

${BOLD}Port Map:${RESET}
  Host ${port} -> Container 18789 (gateway)

${BOLD}Volume Paths:${RESET}
  Graph data:  sifdev-data -> /home/node/.openclaw/sif/
  Config:      /home/node/.openclaw/openclaw.json

${BOLD}URLs:${RESET}
  Web UI:      http://localhost:${port}/ui/
  Gateway WS:  ws://localhost:${port}

${BOLD}Docs:${RESET}
  README:      $SIFDEV_DIR/README.md

EOF
}

cmd_help() {
  cat <<EOF
${BOLD}sifdev.sh${RESET} — SIF Memory Dev Orchestrator

${BOLD}Usage:${RESET} ./sifdev.sh <command> [options]

${BOLD}Lifecycle:${RESET}
  launch [--dev]          Build images and start the SIF dev container
  stop                    Stop the container
  restart [--dev]         Stop then launch
  rebuild [--sif-only] [--dev]  Rebuild image(s) and restart

${BOLD}Monitoring:${RESET}
  health                  Three-layer health check (container, gateway, graph)
  status                  Detailed environment status
  logs [-f] [-n N]        View container logs
  watch                   Start auto-restart watchdog (background)
  watch stop              Stop the watchdog

${BOLD}Interaction:${RESET}
  shell                   Open a bash shell in the container
  config [key] [value]    Get/set OpenClaw config in the container

${BOLD}Data:${RESET}
  backup [name]           Backup SIF graph data
  restore <name>          Restore from a backup

${BOLD}Network:${RESET}
  port-forward <port>     Restart with a different host port

${BOLD}Cleanup:${RESET}
  clean                   Remove container and SIF image
  clean --all             Also remove data volume and backups

${BOLD}Info:${RESET}
  info                    Architecture diagram and useful links
  help                    This message

${BOLD}Options:${RESET}
  --dev                   Hot-reload mode: bind-mount extension source
  --sif-only              Rebuild only the SIF layer (skip base image)

${BOLD}Environment Variables:${RESET}
  SIFDEV_PORT             Host port (default: 18789)
  SIFDEV_MEM_LIMIT        Container memory limit (default: 512m)
  OPENCLAW_GATEWAY_TOKEN  Gateway auth token

EOF
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
cmd="${1:-help}"
shift || true

case "$cmd" in
  launch)        cmd_launch "$@" ;;
  stop)          cmd_stop ;;
  restart)       cmd_restart "$@" ;;
  rebuild)       cmd_rebuild "$@" ;;
  health)        cmd_health ;;
  status)        cmd_status ;;
  logs)          cmd_logs "$@" ;;
  shell)         cmd_shell ;;
  config)        cmd_config "$@" ;;
  backup)        cmd_backup "$@" ;;
  restore)       cmd_restore "$@" ;;
  port-forward)  cmd_port_forward "$@" ;;
  watch)         cmd_watch "$@" ;;
  clean)         cmd_clean "$@" ;;
  info)          cmd_info ;;
  help|--help|-h) cmd_help ;;
  *)             err "Unknown command: $cmd"; cmd_help; exit 1 ;;
esac
