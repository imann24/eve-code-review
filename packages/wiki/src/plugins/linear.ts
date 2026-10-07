import { defineMcpClientConnection } from "eve/connections";
import type { WikiPlugin } from "../types.js";

/** Linear's hosted MCP server, read-only endpoint: it only ever exposes read tools. */
export const LINEAR_READONLY_MCP_URL = "https://mcp.linear.app/mcp/readonly";

/**
 * Linear as a wiki: team documents (conventions, runbooks), project specs, and the issue a PR
 * implements. Authenticate with a Linear API key created with only the Read permission, from the
 * workspace this instance reviews. Linear accepts API keys as a Bearer token on its MCP server.
 */
export const linearPlugin: WikiPlugin<"linear"> = {
  id: "linear",
  connection(config, instanceId) {
    return defineMcpClientConnection({
      url: LINEAR_READONLY_MCP_URL,
      description: `Linear workspace (teams: ${config.teams.join(", ")}): team documents with coding conventions and runbooks, project specs, and the issues pull requests implement.`,
      // Distinct per instance so approvals and cached tokens can never cross instances.
      instanceKey: `${instanceId}:linear`,
      auth: {
        credentialOwner: "app",
        getToken: async () => {
          const token = process.env.LINEAR_API_KEY;
          if (!token) throw new Error("LINEAR_API_KEY is not set for this instance.");
          return { token };
        },
      },
    });
  },
  guidance(config) {
    return [
      `Your source is Linear. Only use content from these teams: ${config.teams.join(", ")}. Ignore anything from other teams even if a search returns it.`,
      "Look in this order:",
      "1. The issue the pull request implements. Find it from an issue ID (like ENG-123) in the PR title, branch name or body. Read its description and acceptance criteria.",
      "2. The parent project of that issue and the project's documents (specs, designs).",
      "3. Team documents with conventions, runbooks or architecture notes relevant to the changed files.",
    ].join("\n");
  },
};
