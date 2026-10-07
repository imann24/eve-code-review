import { defineMcpClientConnection } from "eve/connections";
import type { WikiPlugin } from "../types.js";

/** Atlassian's hosted Rovo MCP server. `/v1/mcp` is the endpoint for API token (headless) auth. */
export const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

/**
 * Read-only Confluence tools from Atlassian's supported-tools list. Everything else on the server
 * (writes, Jira, and the generic `executeRead`/`executeWrite` passthroughs) is filtered out.
 */
export const CONFLUENCE_READ_TOOLS = [
  "searchConfluence",
  "getConfluenceContent",
  "listConfluenceContent",
  "listConfluenceSpaces",
  "getConfluenceSpace",
  "listConfluenceComments",
] as const;

function basicAuthHeader(): string {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !token) throw new Error("ATLASSIAN_EMAIL and ATLASSIAN_API_TOKEN must be set for this instance.");
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

/**
 * Confluence via the Atlassian Rovo MCP server, authenticated with a personal API token over Basic
 * auth (an org admin must enable API token auth for the Rovo MCP server first).
 *
 * Every Rovo tool takes a `cloudId`. When `PRBOT_CONFLUENCE_CLOUD_ID` is set, it's pinned as an
 * application-provided argument (hidden from the model) and the discovery tool is dropped.
 * Otherwise the model can look it up with `getAccessibleAtlassianResources`.
 */
export const confluencePlugin: WikiPlugin<"confluence"> = {
  id: "confluence",
  connection(config, instanceId) {
    const cloudId = config.cloudId;
    return defineMcpClientConnection({
      url: ATLASSIAN_MCP_URL,
      description: `Confluence (spaces: ${config.spaces.join(", ")}): engineering conventions, architecture decisions, runbooks and service docs.`,
      instanceKey: `${instanceId}:confluence`,
      // The Rovo server wants Basic auth for personal API tokens, so it goes in a header.
      headers: () => ({ Authorization: basicAuthHeader() }),
      tools: {
        allow: cloudId ? [...CONFLUENCE_READ_TOOLS] : [...CONFLUENCE_READ_TOOLS, "getAccessibleAtlassianResources"],
      },
      ...(cloudId ? { toolCall: { providedArguments: { cloudId } } } : {}),
    });
  },
  guidance(config) {
    return [
      `Your source is Confluence. Only use content from these spaces: ${config.spaces.join(", ")}.`,
      `When searching with CQL, always restrict to those spaces, e.g. \`space in (${config.spaces.map((s) => `"${s}"`).join(", ")}) AND text ~ "..."\`.`,
      "Ignore anything from other spaces even if it comes back in results.",
      "Prefer pages about coding conventions, architecture decisions and the services touched by the changed files.",
    ].join("\n");
  },
};
