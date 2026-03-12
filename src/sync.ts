/**
 * Handler sync protocol — registers Firecrawl handlers with the OCTOPUS bridge.
 *
 * Instead of static imports, the bridge calls registerHandlers() at startup
 * and periodically to pick up changes. Each handler declares its name,
 * interval, description, and execute function.
 */

import { runSchemaCollector } from "./handlers/schema-collector.js";
import { runFirecrawlResearch } from "./handlers/researcher.js";
import type { FirecrawlConfig, HandlerDescriptor } from "./types.js";

/**
 * Build a FirecrawlConfig from environment variables or explicit overrides.
 */
export function configFromEnv(
  overrides?: Partial<FirecrawlConfig>,
): FirecrawlConfig {
  return {
    firecrawlUrl:
      overrides?.firecrawlUrl ??
      process.env.FIRECRAWL_API_URL ??
      "http://localhost:3002",
    firecrawlMcpUrl:
      overrides?.firecrawlMcpUrl ??
      process.env.FIRECRAWL_MCP_URL ??
      "http://localhost:3010",
    logosMcpUrl:
      overrides?.logosMcpUrl ??
      process.env.LOGOS_MCP_URL ??
      "https://logos-mcp.octo.ad",
    logosMcpToken:
      overrides?.logosMcpToken ?? process.env.LOGOS_MCP_TOKEN ?? undefined,
    gateUrl:
      overrides?.gateUrl ??
      process.env.GATE_URL ??
      "https://gate.livingcoherence.org",
    gateToken:
      overrides?.gateToken ??
      process.env.GATE_AGENT_TOKEN ??
      process.env.GATE_ADMIN_TOKEN ??
      "",
  };
}

/**
 * Register all Firecrawl handlers with the bridge.
 *
 * @param config Service URLs and auth tokens (or call configFromEnv())
 * @returns Array of handler descriptors the bridge can schedule
 */
export function registerHandlers(
  config: FirecrawlConfig,
): HandlerDescriptor[] {
  return [
    {
      name: "schema_collect",
      description:
        "Crawl schema documentation sites, extract structured definitions, store in LOGOS",
      intervalMs: 6 * 60 * 60 * 1000, // every 6 hours
      execute: () => runSchemaCollector(config),
    },
    {
      name: "firecrawl_research",
      description:
        "Patent prior art discovery + competitor intelligence via Firecrawl",
      intervalMs: 24 * 60 * 60 * 1000, // daily
      execute: () => runFirecrawlResearch(config),
    },
  ];
}
