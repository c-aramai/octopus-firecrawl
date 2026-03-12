#!/usr/bin/env bash
set -euo pipefail

# deploy-fly.sh — One-command deploy of Firecrawl MCP server to Fly.io.
#
# Usage: ./scripts/deploy-fly.sh [--create]
#
# Prerequisites:
#   - flyctl installed and authenticated
#   - FLY_API_TOKEN set (or `fly auth login`)
#
# Secrets to set after first deploy:
#   fly -a octopus-firecrawl secrets set \
#     FIRECRAWL_API_KEY=fc-... \
#     LOGOS_MCP_URL=https://logos-mcp.octo.ad \
#     LOGOS_MCP_TOKEN=... \
#     GATE_URL=https://gate.livingcoherence.org \
#     GATE_AGENT_TOKEN=sg_agent_...

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"
FLY_DIR="$PKG_DIR/fly"
APP_NAME="octopus-firecrawl"

CREATE=false
for arg in "$@"; do
  case "$arg" in
    --create) CREATE=true ;;
    *)        echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

echo "=== Deploying Firecrawl MCP to Fly.io ==="

# 1. Create app if requested
if [ "$CREATE" = true ]; then
  echo "[1/3] Creating Fly app..."
  fly apps create "$APP_NAME" --org personal 2>/dev/null || echo "  App already exists"
else
  echo "[1/3] Skipping app creation (use --create for first deploy)"
fi

# 2. Deploy
echo "[2/3] Deploying..."
cd "$PKG_DIR"
fly deploy \
  --app "$APP_NAME" \
  --config "$FLY_DIR/fly.toml" \
  --dockerfile "$FLY_DIR/Dockerfile"

# 3. Show status
echo "[3/3] Deployment status:"
fly status --app "$APP_NAME"

echo ""
echo "=== Deployment complete ==="
echo "MCP URL: https://$APP_NAME.fly.dev"
echo ""
echo "Set secrets if not already configured:"
echo "  fly -a $APP_NAME secrets set FIRECRAWL_API_KEY=fc-..."
echo "  fly -a $APP_NAME secrets set LOGOS_MCP_URL=https://logos-mcp.octo.ad"
echo "  fly -a $APP_NAME secrets set LOGOS_MCP_TOKEN=..."
echo "  fly -a $APP_NAME secrets set GATE_URL=https://gate.livingcoherence.org"
echo "  fly -a $APP_NAME secrets set GATE_AGENT_TOKEN=sg_agent_..."
