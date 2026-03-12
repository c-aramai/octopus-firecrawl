/**
 * @octopus/firecrawl — Firecrawl integration for the OCTOPUS ecosystem.
 *
 * Provides:
 *   - Docker stack for self-hosted Firecrawl (AXON-01 edge deploy)
 *   - Fly.io config for cloud deploy
 *   - Bridge handlers: schema collection + research (patent/competitor)
 *   - Handler sync protocol for dynamic registration
 */

// Sync protocol
export { registerHandlers, configFromEnv } from "./sync.js";

// Handlers (for direct use without bridge)
export { runSchemaCollector } from "./handlers/schema-collector.js";
export { runFirecrawlResearch } from "./handlers/researcher.js";

// MCP client (standalone, no bridge dependency)
export { callMcpTool } from "./mcp-client.js";

// Types
export type {
  FirecrawlConfig,
  SchemaTarget,
  CollectorResult,
  CollectedSchema,
  PatentResult,
  CompetitorResult,
  ResearcherResult,
  McpTarget,
  McpCallResult,
  HandlerDescriptor,
} from "./types.js";
