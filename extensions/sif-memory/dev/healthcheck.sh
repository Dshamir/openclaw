#!/usr/bin/env bash
# SIF Memory container health probe
# Used by Docker HEALTHCHECK instruction
set -euo pipefail

# 1. Gateway TCP check — verify the gateway port is listening
node -e "
  const net = require('net');
  const socket = net.createConnection({ host: '127.0.0.1', port: 18789 });
  const timeout = setTimeout(() => { socket.destroy(); process.exit(1); }, 3000);
  socket.on('connect', () => { clearTimeout(timeout); socket.end(); process.exit(0); });
  socket.on('error', () => { clearTimeout(timeout); process.exit(1); });
" || exit 1

# 2. SIF graph file exists and is valid JSON
GRAPH_PATH="/home/node/.openclaw/sif/pointer-graph.json"
if [ -f "$GRAPH_PATH" ]; then
  node -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync('$GRAPH_PATH', 'utf8'));
      if (!data.pointers || !Array.isArray(data.pointers)) process.exit(1);
    } catch { process.exit(1); }
  " || exit 1
fi
# Graph file not existing yet is OK (first boot, no data yet)

exit 0
