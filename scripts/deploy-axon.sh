#!/usr/bin/env bash
set -euo pipefail

# deploy-axon.sh — One-command deploy of Firecrawl stack to AXON-01.
#
# Usage: ./scripts/deploy-axon.sh [--skip-docker] [--skip-mcp] [--skip-caddy]
#
# Prerequisites:
#   - SSH access to axon-01 (ssh axon-01)
#   - Docker + Docker Compose on AXON-01
#   - prime_octopus-prime Docker network exists

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"
REMOTE="axon-01"
REMOTE_DIR="/opt/octopus/firecrawl"

SKIP_DOCKER=false
SKIP_MCP=false
SKIP_CADDY=false

for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=true ;;
    --skip-mcp)    SKIP_MCP=true ;;
    --skip-caddy)  SKIP_CADDY=true ;;
    *)             echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "=== Deploying Firecrawl to AXON-01 ==="

# 1. Copy Docker stack files
echo "[1/4] Copying Docker stack files..."
# `sudo mkdir -p` alone leaves the dir root-owned, which makes the next scp fail
# for the non-root SSH user. chown to the deploy user so scp can write.
ssh "$REMOTE" "sudo mkdir -p $REMOTE_DIR && sudo chown -R \$(id -un):\$(id -gn) $REMOTE_DIR"
scp "$PKG_DIR/docker/docker-compose.yml" "$REMOTE:$REMOTE_DIR/"
scp "$PKG_DIR/docker/Dockerfile.postgres" "$REMOTE:$REMOTE_DIR/"
scp "$PKG_DIR/docker/nuq.sql"            "$REMOTE:$REMOTE_DIR/"

# Copy .env if it exists locally, otherwise copy .env.example
if [ -f "$PKG_DIR/docker/.env" ]; then
  scp "$PKG_DIR/docker/.env" "$REMOTE:$REMOTE_DIR/"
else
  scp "$PKG_DIR/docker/.env.example" "$REMOTE:$REMOTE_DIR/.env"
  echo "  (copied .env.example as .env — edit on AXON-01 if needed)"
fi

# 2. Start Docker stack
if [ "$SKIP_DOCKER" = false ]; then
  echo "[2/4] Starting Docker stack..."
  ssh "$REMOTE" "cd $REMOTE_DIR && docker compose up -d --build"
else
  echo "[2/4] Skipping Docker stack (--skip-docker)"
fi

# 3. Install and configure Firecrawl MCP server
if [ "$SKIP_MCP" = false ]; then
  echo "[3/4] Installing Firecrawl MCP server..."
  ssh "$REMOTE" "npm install -g firecrawl-mcp 2>/dev/null || sudo npm install -g firecrawl-mcp"

  # Copy systemd service
  scp "$PKG_DIR/systemd/firecrawl-mcp.service" "$REMOTE:/tmp/"
  ssh "$REMOTE" "sudo cp /tmp/firecrawl-mcp.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now firecrawl-mcp"
  echo "  firecrawl-mcp.service enabled and started"
else
  echo "[3/4] Skipping MCP server (--skip-mcp)"
fi

# 4. Configure Caddy
if [ "$SKIP_CADDY" = false ]; then
  echo "[4/4] Configuring Caddy..."
  # Check if firecrawl block already exists in Caddyfile
  if ssh "$REMOTE" "grep -q 'firecrawl.axon.aramai.local' /opt/octopus/caddy/Caddyfile 2>/dev/null"; then
    echo "  Firecrawl block already present in Caddyfile"
  else
    # Append the firecrawl snippet to the Caddyfile
    scp "$PKG_DIR/caddy/firecrawl.snippet" "$REMOTE:/tmp/"
    ssh "$REMOTE" "cat /tmp/firecrawl.snippet | sudo tee -a /opt/octopus/caddy/Caddyfile > /dev/null"
    echo "  Appended firecrawl block to Caddyfile"
  fi
  ssh "$REMOTE" "sudo systemctl reload caddy 2>/dev/null || sudo caddy reload --config /opt/octopus/caddy/Caddyfile"
  echo "  Caddy reloaded"
else
  echo "[4/4] Skipping Caddy (--skip-caddy)"
fi

echo ""
echo "=== Deployment complete ==="
echo "Firecrawl API:  http://firecrawl.axon.aramai.local (port 3002)"
echo "Firecrawl MCP:  http://localhost:3010 on AXON-01"
echo ""
echo "Verify:"
echo "  ssh axon-01 'curl -s http://localhost:3002 | head -c 200'"
echo "  ssh axon-01 'systemctl status firecrawl-mcp'"
