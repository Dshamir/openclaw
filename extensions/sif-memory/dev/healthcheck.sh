#!/usr/bin/env bash
# SIF Memory container health probe
# Used by Docker HEALTHCHECK instruction
set -euo pipefail

# 1. Gateway HTTP check — verify the gateway is serving
if command -v curl >/dev/null 2>&1; then
  curl -sf --max-time 3 http://localhost:18789/_bootstrap.json >/dev/null || exit 1
else
  node -e "
    const http = require('http');
    const req = http.get('http://localhost:18789/_bootstrap.json', { timeout: 3000 }, (res) => {
      process.exit(res.statusCode >= 200 && res.statusCode < 400 ? 0 : 1);
    });
    req.on('error', () => process.exit(1));
    req.on('timeout', () => { req.destroy(); process.exit(1); });
  " || exit 1
fi

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
