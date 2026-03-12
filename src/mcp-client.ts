/**
 * Standalone MCP HTTP client for Firecrawl handlers.
 * No dependency on bridge internals — self-contained fetch-based client.
 */

import type { McpTarget, McpCallResult } from "./types.js";

/**
 * Call a single MCP tool via HTTP POST (JSON-RPC 2.0).
 */
export async function callMcpTool(
  target: McpTarget,
  authToken?: string,
): Promise<McpCallResult> {
  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(`${target.url}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `fc-${Date.now()}`,
        method: "tools/call",
        params: {
          name: target.tool,
          arguments: target.params,
        },
      }),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const text = await response.text();
      return {
        url: target.url,
        tool: target.tool,
        success: false,
        error: `HTTP ${response.status}: ${text.slice(0, 200)}`,
        durationMs,
      };
    }

    const data = (await parseResponse(response)) as {
      result?: { content?: Array<{ type: string; text: string }> };
      error?: { message: string };
    };

    if (data.error) {
      return {
        url: target.url,
        tool: target.tool,
        success: false,
        error: data.error.message,
        durationMs,
      };
    }

    // Extract text content from MCP result
    const textContent = data.result?.content?.find((c) => c.type === "text");
    let parsed: unknown = textContent?.text;
    try {
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
    } catch {
      // Keep as string if not JSON
    }

    return {
      url: target.url,
      tool: target.tool,
      success: true,
      data: parsed,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    return {
      url: target.url,
      tool: target.tool,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs,
    };
  }
}

/**
 * Parse MCP response — handles both JSON and SSE (Streamable HTTP) content types.
 */
async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (contentType.includes("text/event-stream")) {
    const dataLines = text
      .split("\n")
      .filter((line) => line.startsWith("data: ") || line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, ""));
    if (dataLines.length === 0)
      throw new Error("SSE response contained no data lines");
    return JSON.parse(dataLines[dataLines.length - 1]);
  }

  return JSON.parse(text);
}
