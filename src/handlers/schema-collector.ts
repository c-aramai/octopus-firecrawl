/**
 * Schematica Collector — uses Firecrawl MCP to crawl schema documentation sites,
 * extract structured schema definitions, and store them in LOGOS file store.
 *
 * Workflow: search(domain) -> crawl(docs) -> extract(JSON Schema) -> store
 *
 * Use cases:
 *   UC-1: Healthcare — FHIR profiles from HL7 documentation
 *   UC-2: API Schema Discovery — OpenAPI/JSON Schema from platform docs
 *   UC-3: Standards Monitoring — ODM, W3C, IETF schema evolution
 */

import { callMcpTool } from "../mcp-client.js";
import type {
  FirecrawlConfig,
  SchemaTarget,
  CollectorResult,
  CollectedSchema,
} from "../types.js";
import seedTargets from "../targets/seeds.json" with { type: "json" };

/**
 * Run the Schematica Collector — scrape/crawl targets and store extracted schemas.
 * @param config Service URLs and auth tokens
 * @param targets Optional override targets; uses seeds.json if omitted
 */
export async function runSchemaCollector(
  config: FirecrawlConfig,
  targets?: SchemaTarget[],
): Promise<CollectorResult> {
  const activeTargets = (targets ?? seedTargets) as SchemaTarget[];
  const result: CollectorResult = {
    collected: 0,
    failed: 0,
    schemas: [],
    errors: [],
  };

  for (const target of activeTargets) {
    try {
      const schema = await collectSchema(config, target);
      if (schema) {
        result.schemas.push(schema);
        result.collected++;
      } else {
        result.failed++;
        result.errors.push(`${target.name}: extraction returned empty`);
      }
    } catch (err) {
      result.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${target.name}: ${msg}`);
      console.error(`[SCHEMA_COLLECTOR] Failed: ${target.name}:`, msg);
    }
  }

  return result;
}

/**
 * Collect a single schema from a target URL using Firecrawl.
 */
async function collectSchema(
  config: FirecrawlConfig,
  target: SchemaTarget,
): Promise<CollectedSchema | null> {
  // Step 1: Scrape or crawl the target
  let content: string | null = null;

  if (target.mode === "crawl") {
    const crawlResult = await callMcpTool({
      url: config.firecrawlMcpUrl,
      tool: "firecrawl_crawl",
      params: {
        url: target.url,
        limit: target.maxPages ?? 5,
        scrapeOptions: { formats: ["markdown"] },
      },
    });

    if (crawlResult.success && crawlResult.data) {
      const data = crawlResult.data as {
        data?: Array<{ markdown?: string }>;
      };
      content =
        data.data?.map((d) => d.markdown ?? "").join("\n\n---\n\n") ?? null;
    } else {
      console.error(
        `[SCHEMA_COLLECTOR] Crawl failed for ${target.name}: ${crawlResult.error}`,
      );
    }
  } else {
    // Scrape single page
    const scrapeResult = await callMcpTool({
      url: config.firecrawlMcpUrl,
      tool: "firecrawl_scrape",
      params: {
        url: target.url,
        formats: ["markdown"],
      },
    });

    if (scrapeResult.success && scrapeResult.data) {
      const data = scrapeResult.data as { markdown?: string };
      content = data.markdown ?? null;
    } else {
      console.error(
        `[SCHEMA_COLLECTOR] Scrape failed for ${target.name}: ${scrapeResult.error}`,
      );
    }
  }

  if (!content) return null;

  // Step 2: Extract structured schema using Firecrawl extract (LLM-powered)
  let extracted: unknown = null;

  if (target.extractPrompt) {
    const extractResult = await callMcpTool({
      url: config.firecrawlMcpUrl,
      tool: "firecrawl_extract",
      params: {
        urls: [target.url],
        prompt: target.extractPrompt,
      },
    });

    if (extractResult.success && extractResult.data) {
      extracted = extractResult.data;
    } else {
      // Fall back to raw markdown if extraction fails
      console.error(
        `[SCHEMA_COLLECTOR] Extract failed for ${target.name}, using raw markdown: ${extractResult.error}`,
      );
    }
  }

  // Step 3: Build the schema document
  const slug = slugify(target.name);
  const storagePath = `schemas/${target.domain}/${slug}.json`;

  const schemaDoc = {
    $schema: "https://aramai.io/schemas/collected-schema/v1",
    name: target.name,
    domain: target.domain,
    sourceUrl: target.url,
    collectedAt: new Date().toISOString(),
    collector: "agent:firecrawl-collector",
    extractPrompt: target.extractPrompt ?? null,
    extracted: extracted ?? null,
    rawMarkdownLength: content.length,
    // Include truncated raw content as fallback (max 50k chars)
    rawContent:
      content.length > 50000
        ? content.slice(0, 50000) + "\n\n[TRUNCATED]"
        : content,
  };

  const jsonContent = JSON.stringify(schemaDoc, null, 2);

  // Step 4: Store in LOGOS file store under schematica path
  const storeResult = await callMcpTool(
    {
      url: config.logosMcpUrl,
      tool: "logos_file_write",
      params: {
        path: storagePath,
        content: jsonContent,
        graph: "https://aramai.io/graphs/techne",
      },
    },
    config.logosMcpToken,
  );

  if (!storeResult.success) {
    console.error(
      `[SCHEMA_COLLECTOR] File store failed for ${target.name}: ${storeResult.error}`,
    );
    return null;
  }

  return {
    name: target.name,
    domain: target.domain,
    sourceUrl: target.url,
    storagePath,
    sizeBytes: jsonContent.length,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
