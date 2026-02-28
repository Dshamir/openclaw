# SIF Memory Dev Environment

Containerized development environment for the SIF memory extension. Provides a full devops command set for launching, monitoring, rebuilding, and managing the SIF dev gateway.

## Quick Start

```bash
cd extensions/sif-memory/dev

# Launch (builds images if needed, starts container, waits for health)
./sifdev.sh launch

# Verify everything is working
./sifdev.sh health

# Open the web UI
open http://localhost:18789/ui/
```

## Prerequisites

- **Docker** (with Docker Compose v2)
- **Node 22+** (for local backup stats parsing)
- **pnpm** (only needed for building the base image from source)

## Command Reference

| Command                        | Description                                          |
| ------------------------------ | ---------------------------------------------------- |
| `launch [--dev]`               | Build images and start the SIF dev container         |
| `stop`                         | Stop the container                                   |
| `restart [--dev]`              | Stop then launch                                     |
| `rebuild [--sif-only] [--dev]` | Rebuild image(s) and restart                         |
| `health`                       | Three-layer health check (container, gateway, graph) |
| `status`                       | Detailed environment status                          |
| `logs [-f] [-n N]`             | View container logs (`-f` to follow)                 |
| `shell`                        | Open a bash shell in the container                   |
| `config [key] [value]`         | Get/set OpenClaw config inside the container         |
| `backup [name]`                | Backup SIF graph data to local directory             |
| `restore <name>`               | Restore SIF graph from a backup                      |
| `port-forward <port>`          | Restart with a different host port                   |
| `watch`                        | Start auto-restart watchdog (background)             |
| `watch stop`                   | Stop the watchdog                                    |
| `clean`                        | Remove container and SIF image                       |
| `clean --all`                  | Also remove data volume and backups                  |
| `info`                         | Architecture diagram and useful links                |
| `help`                         | Print command summary                                |

## Architecture

```
+--------------------------+
|  openclaw-sifdev:local   |   Docker container
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
```

**Image layering:**

1. `openclaw:local` — full OpenClaw build from repo root `Dockerfile`
2. `openclaw-sifdev:local` — layers SIF extension, pre-configures `memory.backend=sif`, adds healthcheck

**Named volume** `openclaw-sifdev-data` persists the SIF graph across container restarts and image rebuilds.

## Dev Hot-Reload Workflow

When using `--dev`, the SIF extension source directory is bind-mounted into the container. Since the gateway uses jiti for TypeScript loading, source changes take effect on gateway restart without rebuilding the image.

```bash
# Start in dev mode
./sifdev.sh launch --dev

# Edit extension source files
vim extensions/sif-memory/tools.ts

# Restart to pick up changes (no image rebuild needed)
./sifdev.sh restart --dev

# Verify changes
./sifdev.sh health
```

For changes that require a full rebuild (e.g., new npm dependencies):

```bash
./sifdev.sh rebuild --dev
```

For changes only to the SIF extension layer (skips the slow base image rebuild):

```bash
./sifdev.sh rebuild --sif-only --dev
```

## Backup and Restore

```bash
# Create a named backup
./sifdev.sh backup my-experiment

# List backups
ls -la extensions/sif-memory/dev/backups/

# Restore from backup (stops container, copies data, restarts)
./sifdev.sh restore my-experiment

# Verify after restore
./sifdev.sh health
```

Backups are stored in `extensions/sif-memory/dev/backups/<name>/` and contain the full SIF data directory including `pointer-graph.json` and any archives.

## Auto-Restart Watchdog

The watchdog runs health checks every 30 seconds and auto-restarts the container after 3 consecutive failures (90s total).

```bash
# Start watchdog in background
./sifdev.sh watch

# View watchdog events
tail -f extensions/sif-memory/dev/watchdog.log

# Stop watchdog
./sifdev.sh watch stop
```

The container also has Docker-level `restart: unless-stopped` policy for crash recovery independent of the watchdog.

## Troubleshooting

### Container fails to start

```bash
# Check logs for errors
./sifdev.sh logs -n 50

# Open a shell to inspect
docker run --rm -it openclaw-sifdev:local bash
```

### Health check fails on gateway

The gateway may take 10-15 seconds to initialize. The health check has a 15s start period before it begins probing. If it still fails:

```bash
# Check if the port is listening
./sifdev.sh shell
# Inside container:
node -e "require('net').createConnection({host:'127.0.0.1',port:18789}).on('connect',()=>{console.log('ok');process.exit(0)}).on('error',e=>console.log(e.message))"
```

### Base image build fails

Ensure you have enough disk space and that the repo builds cleanly:

```bash
cd /path/to/openclaw
pnpm install
pnpm build
```

### "Permission denied" on sifdev.sh

```bash
chmod +x extensions/sif-memory/dev/sifdev.sh
```

### Graph data lost after rebuild

Graph data is stored in the named Docker volume `openclaw-sifdev-data`, which persists across image rebuilds and container restarts. Data is only lost if you run `./sifdev.sh clean --all`. Use `./sifdev.sh backup` before destructive operations.

## Environment Variables

| Variable                 | Default | Description                     |
| ------------------------ | ------- | ------------------------------- |
| `SIFDEV_PORT`            | `18789` | Host port mapped to the gateway |
| `SIFDEV_MEM_LIMIT`       | `512m`  | Container memory limit          |
| `OPENCLAW_GATEWAY_TOKEN` | (none)  | Gateway authentication token    |
