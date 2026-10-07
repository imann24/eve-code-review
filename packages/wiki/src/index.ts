import type { InstanceConfig } from "@eve-code-review/config";
import type { McpClientConnectionDefinition } from "eve/connections";
import { confluencePlugin } from "./plugins/confluence.js";
import { linearPlugin } from "./plugins/linear.js";

export const wikiPlugins = {
  linear: linearPlugin,
  confluence: confluencePlugin,
} as const;

/** The MCP connection for this instance's wiki, or `null` when the instance has no wiki. */
export function wikiConnectionFor(config: InstanceConfig): McpClientConnectionDefinition | null {
  const wiki = config.wiki;
  switch (wiki.provider) {
    case "linear":
      return linearPlugin.connection(wiki, config.instanceId);
    case "confluence":
      return confluencePlugin.connection(wiki, config.instanceId);
    case "none":
      return null;
  }
}

/** Instructions fragment telling the docs researcher what its source is and how to search it. */
export function wikiGuidanceFor(config: InstanceConfig): string {
  const wiki = config.wiki;
  switch (wiki.provider) {
    case "linear":
      return linearPlugin.guidance(wiki);
    case "confluence":
      return confluencePlugin.guidance(wiki);
    case "none":
      return "This instance has no wiki configured. Say so, and answer only from the repository itself.";
  }
}

export { ATLASSIAN_MCP_URL, CONFLUENCE_READ_TOOLS, confluencePlugin } from "./plugins/confluence.js";
export { LINEAR_READONLY_MCP_URL, linearPlugin } from "./plugins/linear.js";
export type { WikiPlugin, WikiProviderConfig } from "./types.js";
