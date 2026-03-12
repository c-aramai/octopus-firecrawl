/**
 * Firecrawl Researcher — Patent Prior Art Discovery + Competitor Intelligence.
 *
 * UC-4: Patent Prior Art Discovery
 *   - Uses Firecrawl search/scrape to find patent prior art on Google Patents, USPTO, EPO
 *   - Extracts structured claim data
 *   - Creates nodes in NOUS graph (ZETESIS prospect pipeline)
 *
 * UC-5: Competitor Intelligence
 *   - Monitors schema-related company blogs/repos
 *   - Extracts announcements
 *   - Posts to Signal Gate with structured data + domain routing
 */

import { callMcpTool } from "../mcp-client.js";
import type {
  FirecrawlConfig,
  PatentResult,
  CompetitorResult,
  ResearcherResult,
} from "../types.js";

// --- Patent search targets ---

const PATENT_QUERIES = [
  "schema validation interoperability semantic",
  "knowledge graph schema mapping automated",
  "ontology alignment cross-domain data validation",
  "semantic schema registry federation",
  "graph-native content pipeline publishing",
];

// --- Competitor intelligence targets ---

const COMPETITOR_URLS = [
  // Schema registries / validation companies
  "https://www.confluent.io/blog/",
  "https://buf.build/blog",
  "https://json-schema.org/blog",
  "https://www.asyncapi.com/blog",
  // Knowledge graph / ontology companies
  "https://www.ontotext.com/blog/",
  "https://neo4j.com/blog/",
  "https://www.stardog.com/blog/",
];

// --- UC-4: Patent Prior Art Discovery ---

async function searchPatents(
  config: FirecrawlConfig,
): Promise<PatentResult[]> {
  const results: PatentResult[] = [];

  // Rotate through queries — pick one per run to avoid rate limiting
  const queryIndex =
    Math.floor(Date.now() / (24 * 60 * 60 * 1000)) % PATENT_QUERIES.length;
  const query = PATENT_QUERIES[queryIndex];

  // Google Patents search URL
  const searchUrl = `https://patents.google.com/?q=${encodeURIComponent(query)}&oq=${encodeURIComponent(query)}`;

  try {
    const scrapeResult = await callMcpTool({
      url: config.firecrawlMcpUrl,
      tool: "firecrawl_scrape",
      params: {
        url: searchUrl,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 3000, // Google Patents is JS-rendered
      },
    });

    if (!scrapeResult.success || !scrapeResult.data) {
      return results;
    }

    const data = scrapeResult.data as {
      data?: { markdown?: string };
    };
    const markdown = data.data?.markdown ?? "";

    if (!markdown) return results;

    // Extract patent links and titles from the search results page
    const patentLinks =
      markdown.match(
        /\[([^\]]+)\]\(\/patent\/([A-Z]{2}\d+[A-Z]?\d*)[^\)]*\)/g,
      ) ?? [];

    for (const link of patentLinks.slice(0, 5)) {
      const match = link.match(
        /\[([^\]]+)\]\(\/patent\/([A-Z]{2}\d+[A-Z]?\d*)/,
      );
      if (!match) continue;

      const [, title, patentId] = match;

      const patent: PatentResult = {
        title: title.trim(),
        url: `https://patents.google.com/patent/${patentId}`,
        patentId,
        relevanceScore: 0.5,
      };

      // Relevance scoring based on title keywords
      const keywords = [
        "schema",
        "validation",
        "ontology",
        "interoperab",
        "semantic",
        "graph",
        "knowledge",
      ];
      const lower = title.toLowerCase();
      const hits = keywords.filter((k) => lower.includes(k)).length;
      patent.relevanceScore = Math.min(1, 0.3 + hits * 0.2);

      if (patent.relevanceScore >= 0.25) {
        results.push(patent);
      }
    }

    // If we found patents, scrape the first one for detailed claims
    if (results.length > 0) {
      try {
        const detailResult = await callMcpTool({
          url: config.firecrawlMcpUrl,
          tool: "firecrawl_scrape",
          params: {
            url: results[0].url,
            formats: ["markdown"],
            onlyMainContent: true,
          },
        });

        if (detailResult.success && detailResult.data) {
          const detail = detailResult.data as {
            data?: { markdown?: string };
          };
          const detailMd = detail.data?.markdown ?? "";

          // Extract abstract
          const abstractMatch = detailMd.match(
            /Abstract[:\s]*\n([\s\S]{50,500}?)(?:\n\n|\n#)/i,
          );
          if (abstractMatch) results[0].abstract = abstractMatch[1].trim();

          // Extract claims (first 3)
          const claimMatches = detailMd.match(
            /(?:^|\n)\d+\.\s+(.{20,300})/g,
          );
          if (claimMatches) {
            results[0].claims = claimMatches.slice(0, 3).map((c) => c.trim());
          }
        }
      } catch {
        // Detail scrape is best-effort
      }
    }
  } catch (err) {
    console.error("[FIRECRAWL_RESEARCHER] Patent search error:", err);
  }

  return results;
}

async function storePatentInNous(
  config: FirecrawlConfig,
  patent: PatentResult,
): Promise<boolean> {
  try {
    const nodeId = `NOUS-PA-${patent.patentId || Date.now().toString(36)}`;
    const resp = await callMcpTool(
      {
        url: config.logosMcpUrl,
        tool: "logos_create",
        params: {
          layer: "fragment",
          id: nodeId,
          label: patent.title,
          definition: [
            patent.abstract ||
              "Prior art discovery — pending detailed extraction.",
            "",
            `URL: ${patent.url}`,
            patent.patentId ? `Patent ID: ${patent.patentId}` : "",
            patent.assignee ? `Assignee: ${patent.assignee}` : "",
            patent.filingDate ? `Filing Date: ${patent.filingDate}` : "",
            `Relevance Score: ${patent.relevanceScore.toFixed(2)}`,
            `Discovered: ${new Date().toISOString()}`,
          ]
            .filter(Boolean)
            .join("\n"),
          graph: "https://aramai.io/graphs/nous",
          relationships: {
            relatedKernels: ["K-Firecrawl-NOUS"],
          },
        },
      },
      config.logosMcpToken,
    );

    return resp.success;
  } catch (err) {
    console.error(
      `[FIRECRAWL_RESEARCHER] Failed to store patent ${patent.patentId}:`,
      err,
    );
    return false;
  }
}

// --- UC-5: Competitor Intelligence ---

async function scanCompetitors(
  config: FirecrawlConfig,
): Promise<CompetitorResult[]> {
  const results: CompetitorResult[] = [];

  // Rotate through competitor URLs — 2 per run
  const dayIndex = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const startIdx = (dayIndex * 2) % COMPETITOR_URLS.length;
  const urlsToScan = [
    COMPETITOR_URLS[startIdx],
    COMPETITOR_URLS[(startIdx + 1) % COMPETITOR_URLS.length],
  ];

  for (const url of urlsToScan) {
    try {
      const scrapeResult = await callMcpTool({
        url: config.firecrawlMcpUrl,
        tool: "firecrawl_scrape",
        params: {
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        },
      });

      if (!scrapeResult.success || !scrapeResult.data) continue;

      const data = scrapeResult.data as {
        data?: { markdown?: string; metadata?: { title?: string } };
      };
      const markdown = data.data?.markdown ?? "";

      // Extract recent blog post entries matching our keywords
      const postPatterns = markdown.match(
        /#+\s+(.{10,100})\n[\s\S]{0,200}?(?:schema|api|graph|ontology|validation|interoperab)/gi,
      );

      if (postPatterns) {
        for (const match of postPatterns.slice(0, 3)) {
          const titleMatch = match.match(/#+\s+(.{10,100})/);
          if (!titleMatch) continue;

          const domain = inferDomain(url);
          results.push({
            title: titleMatch[1].trim(),
            url,
            summary: match.slice(0, 300).trim(),
            source: new URL(url).hostname,
            domain,
            tags: inferTags(match, domain),
          });
        }
      }
    } catch (err) {
      console.error(
        `[FIRECRAWL_RESEARCHER] Competitor scan error for ${url}:`,
        err,
      );
    }
  }

  return results;
}

function inferDomain(url: string): string {
  if (
    url.includes("confluent") ||
    url.includes("asyncapi") ||
    url.includes("buf.build")
  )
    return "schema";
  if (
    url.includes("neo4j") ||
    url.includes("ontotext") ||
    url.includes("stardog")
  )
    return "knowledge-graph";
  if (url.includes("json-schema")) return "schema";
  return "competitive";
}

function inferTags(text: string, domain: string): string[] {
  const tags: string[] = [domain, "firecrawl-researcher"];
  const lower = text.toLowerCase();
  if (lower.includes("schema")) tags.push("schema");
  if (lower.includes("api")) tags.push("api");
  if (lower.includes("graph")) tags.push("knowledge-graph");
  if (lower.includes("validation")) tags.push("validation");
  if (lower.includes("ontology")) tags.push("ontology");
  return [...new Set(tags)];
}

async function postToSignalGate(
  config: FirecrawlConfig,
  result: CompetitorResult,
): Promise<boolean> {
  if (!config.gateToken) {
    console.error(
      "[FIRECRAWL_RESEARCHER] No gate token configured, skipping Signal Gate post",
    );
    return false;
  }

  try {
    const resp = await fetch(`${config.gateUrl}/signal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.gateToken}`,
      },
      body: JSON.stringify({
        source: "firecrawl-researcher",
        domain: result.domain,
        title: result.title,
        body: result.summary,
        confidence: 0.6,
        tags: result.tags,
        sourceRef: result.url,
        metadata: {
          source_hostname: result.source,
          use_case: "UC-5",
          discovered_at: new Date().toISOString(),
        },
      }),
    });

    return resp.ok;
  } catch (err) {
    console.error("[FIRECRAWL_RESEARCHER] Signal Gate post error:", err);
    return false;
  }
}

// --- Main orchestrator ---

/**
 * Run the Firecrawl Researcher — patent search + competitor intelligence.
 * @param config Service URLs and auth tokens
 */
export async function runFirecrawlResearch(
  config: FirecrawlConfig,
): Promise<ResearcherResult> {
  const errors: string[] = [];
  let patentsFound = 0;
  let patentsStored = 0;
  let competitorSignals = 0;

  // UC-4: Patent Prior Art Discovery
  try {
    const patents = await searchPatents(config);
    patentsFound = patents.length;

    for (const patent of patents) {
      const stored = await storePatentInNous(config, patent);
      if (stored) patentsStored++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Patent search: ${msg}`);
    console.error("[FIRECRAWL_RESEARCHER] Patent search failed:", err);
  }

  // UC-5: Competitor Intelligence
  try {
    const competitors = await scanCompetitors(config);

    for (const result of competitors) {
      const posted = await postToSignalGate(config, result);
      if (posted) competitorSignals++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Competitor scan: ${msg}`);
    console.error("[FIRECRAWL_RESEARCHER] Competitor scan failed:", err);
  }

  return { patentsFound, patentsStored, competitorSignals, errors };
}
