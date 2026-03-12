/**
 * Shared types for @octopus/firecrawl handlers.
 * No dependency on bridge internals.
 */

/** Configuration passed to handlers at registration time */
export interface FirecrawlConfig {
  /** Firecrawl API URL (e.g. http://localhost:3002) */
  firecrawlUrl: string;
  /** Firecrawl MCP server URL (e.g. http://localhost:3010) */
  firecrawlMcpUrl: string;
  /** LOGOS MCP server URL */
  logosMcpUrl: string;
  /** LOGOS MCP auth token (optional) */
  logosMcpToken?: string;
  /** Signal Gate URL */
  gateUrl: string;
  /** Signal Gate agent/admin token */
  gateToken: string;
}

/** A schema target to crawl and extract from */
export interface SchemaTarget {
  /** Human-readable name (e.g. "FHIR Patient Resource") */
  name: string;
  /** Domain category (healthcare, finance, ecommerce, government, standards) */
  domain: string;
  /** URL to scrape or base URL to crawl */
  url: string;
  /** Whether to crawl (follow links) or just scrape the single URL */
  mode: "scrape" | "crawl";
  /** Max pages to crawl (only for crawl mode) */
  maxPages?: number;
  /** JSON Schema extraction prompt — tells Firecrawl what structure to extract */
  extractPrompt?: string;
}

export interface CollectorResult {
  collected: number;
  failed: number;
  schemas: CollectedSchema[];
  errors: string[];
}

export interface CollectedSchema {
  name: string;
  domain: string;
  sourceUrl: string;
  storagePath: string;
  sizeBytes: number;
}

export interface PatentResult {
  title: string;
  url: string;
  patentId?: string;
  abstract?: string;
  claims?: string[];
  assignee?: string;
  filingDate?: string;
  relevanceScore: number;
}

export interface CompetitorResult {
  title: string;
  url: string;
  summary: string;
  source: string;
  domain: string;
  tags: string[];
}

export interface ResearcherResult {
  patentsFound: number;
  patentsStored: number;
  competitorSignals: number;
  errors: string[];
}

/** MCP call target — decoupled from bridge types */
export interface McpTarget {
  url: string;
  tool: string;
  params: Record<string, unknown>;
}

export interface McpCallResult {
  url: string;
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

/** Handler descriptor for bridge registration */
export interface HandlerDescriptor {
  name: string;
  description: string;
  intervalMs: number;
  execute: () => Promise<unknown>;
}
