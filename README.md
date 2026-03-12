# @octopus/firecrawl

Firecrawl integration for the OCTOPUS ecosystem. Provides self-hosted web scraping, schema collection, patent research, and competitor intelligence.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  OCTOPUS Bridge                                     │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │ schema_collect   │   │ firecrawl_research     │  │
│  │ (every 6h)       │   │ (daily)                │  │
│  └────────┬─────────┘   └────────┬───────────────┘  │
│           │                      │                  │
│           └──────────┬───────────┘                  │
│                      │                              │
│              registerHandlers()                     │
└──────────────────────┼──────────────────────────────┘
                       │
           ┌───────────┼───────────┐
           │           │           │
      Firecrawl     LOGOS MCP   Signal Gate
      (scrape)      (store)     (post intel)
```

## Quick Start

### AXON-01 (Edge Deploy)

```bash
# Deploy Docker stack + MCP server + Caddy config
./scripts/deploy-axon.sh

# Or step by step:
./scripts/deploy-axon.sh --skip-mcp --skip-caddy   # Docker only
./scripts/deploy-axon.sh --skip-docker --skip-caddy # MCP server only
```

### Fly.io (Cloud Deploy)

```bash
# First deploy
./scripts/deploy-fly.sh --create

# Set secrets
fly -a octopus-firecrawl secrets set \
  FIRECRAWL_API_KEY=fc-... \
  LOGOS_MCP_URL=https://logos-mcp.octo.ad \
  LOGOS_MCP_TOKEN=... \
  GATE_URL=https://gate.livingcoherence.org \
  GATE_AGENT_TOKEN=sg_agent_...

# Subsequent deploys
./scripts/deploy-fly.sh
```

### As a Library

```typescript
import { registerHandlers, configFromEnv } from "@octopus/firecrawl";

// Register with bridge
const config = configFromEnv();
const handlers = registerHandlers(config);

// Or run handlers directly
import { runSchemaCollector, runFirecrawlResearch } from "@octopus/firecrawl";

const schemaResult = await runSchemaCollector(config);
const researchResult = await runFirecrawlResearch(config);
```

## Handlers

### schema_collect (every 6 hours)

Crawls schema documentation sites, extracts structured definitions via Firecrawl LLM extraction, and stores results in LOGOS file store under `schemas/{domain}/`.

**Use cases:**
- UC-1: Healthcare (FHIR profiles from HL7)
- UC-2: API Schema Discovery (OpenAPI/JSON Schema)
- UC-3: Standards Monitoring (W3C, IETF)

### firecrawl_research (daily)

Patent prior art discovery + competitor intelligence.

**Use cases:**
- UC-4: Patent Prior Art — scrapes Google Patents, stores in NOUS graph
- UC-5: Competitor Intelligence — monitors schema/graph company blogs, posts to Signal Gate

## Adding Custom Targets

Edit `src/targets/seeds.json` to add schema scraping targets:

```json
{
  "name": "My API Docs",
  "domain": "custom",
  "url": "https://docs.example.com/api",
  "mode": "scrape",
  "extractPrompt": "Extract the API schema including all endpoints, parameters, and response types."
}
```

Supported modes:
- `scrape` — single page extraction
- `crawl` — follow links (use `maxPages` to limit)

## Configuration

All config is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `FIRECRAWL_API_URL` | `http://localhost:3002` | Firecrawl API base URL |
| `FIRECRAWL_MCP_URL` | `http://localhost:3010` | Firecrawl MCP server URL |
| `LOGOS_MCP_URL` | `https://logos-mcp.octo.ad` | LOGOS MCP server URL |
| `LOGOS_MCP_TOKEN` | *(empty)* | LOGOS MCP auth token |
| `GATE_URL` | `https://gate.livingcoherence.org` | Signal Gate URL |
| `GATE_AGENT_TOKEN` | *(empty)* | Signal Gate agent token |

## Docker Stack

The `docker/` directory contains a complete self-hosted Firecrawl deployment:

- **firecrawl-api** — Main Firecrawl server (port 3002)
- **firecrawl-playwright** — Headless browser for JS-rendered pages
- **firecrawl-redis** — Job queue backend
- **firecrawl-rabbitmq** — Message broker
- **firecrawl-postgres** — Persistent storage with pg_cron for job management

Resource limits are tuned for shared edge servers (AXON-01: 4GB API, 2GB Playwright).

## Development

```bash
npm install
npm run build    # Compile TypeScript
npm run dev      # Watch mode
```
