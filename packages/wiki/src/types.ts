import type { WikiConfig } from "@eve-code-review/config";
import type { McpClientConnectionDefinition } from "eve/connections";

export type WikiProviderConfig<P extends WikiConfig["provider"]> = Extract<WikiConfig, { provider: P }>;

/**
 * A wiki source the docs researcher can read. Adding a provider means implementing this,
 * registering it in `index.ts`, and adding its settings to the config schema.
 *
 * Isolation is layered:
 * 1. Credentials: each instance uses its own read-only credentials, issued from an account that
 *    can only see that instance's spaces or teams. This is the hard boundary.
 * 2. Endpoint and tool filter: read-only endpoints and an allowlist of read tools.
 * 3. Guidance: the subagent is told which spaces or teams are in scope.
 */
export interface WikiPlugin<P extends Exclude<WikiConfig["provider"], "none">> {
  readonly id: P;
  /** The MCP connection for this instance. Secrets are read from env when a request is made. */
  connection(config: WikiProviderConfig<P>, instanceId: string): McpClientConnectionDefinition;
  /** A short instructions fragment for the docs researcher: what lives here and how to search it. */
  guidance(config: WikiProviderConfig<P>): string;
}
