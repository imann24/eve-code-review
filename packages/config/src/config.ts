import { InstanceEnvSchema, type InstanceEnv } from "./schema.js";

export type ApproveMode = "never" | "hitl" | "auto";

/** One wiki per instance. `none` runs the bot without a docs source. */
export type WikiConfig =
  | { readonly provider: "none" }
  | { readonly provider: "linear"; readonly teams: readonly string[] }
  | {
      readonly provider: "confluence";
      readonly spaces: readonly string[];
      readonly cloudId: string | undefined;
    };

/**
 * Parsed, non-secret instance configuration. Secrets stay in `process.env` and are read at call
 * time by the code that needs them, so this object is safe to log.
 */
export interface InstanceConfig {
  readonly instanceId: string;
  readonly github: {
    readonly owner: string;
    readonly repos: "*" | readonly string[];
    /** Vercel Connect connector for the channel (webhooks, replies). */
    readonly connector: string;
    /** Vercel Connect connector for the github-tools extension (reviews, inline comments). */
    readonly toolsConnector: string;
    readonly botName: string;
  };
  readonly review: {
    readonly approveMode: ApproveMode;
  };
  readonly maintainers: {
    /** Lowercase GitHub repository role names, e.g. `maintain`, `admin`. */
    readonly roles: readonly string[];
  };
  readonly memory: {
    readonly backend: "agentkit";
    readonly orgSlot: boolean;
    /** eve memory namespace shared by every slot in this instance. */
    readonly namespace: string;
  };
  readonly wiki: WikiConfig;
}

export class InstanceConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid eve-code-review instance config:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "InstanceConfigError";
  }
}

/** Parses an environment into an {@link InstanceConfig}, throwing on anything missing or invalid. */
export function parseInstanceConfig(env: Readonly<Record<string, string | undefined>>): InstanceConfig {
  const result = InstanceEnvSchema.safeParse(env);
  if (!result.success) {
    throw new InstanceConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(env)"}: ${issue.message}`),
    );
  }
  return toConfig(result.data);
}

function toConfig(env: InstanceEnv): InstanceConfig {
  const instanceId = env.PRBOT_INSTANCE_ID;
  const repos = env.PRBOT_GITHUB_REPOS.trim();
  const connector = env.PRBOT_GITHUB_CONNECTOR ?? defaultGitHubConnector(instanceId);

  return {
    instanceId,
    github: {
      owner: env.PRBOT_GITHUB_OWNER,
      repos:
        repos === "*"
          ? "*"
          : repos
              .split(",")
              .map((repo) => repo.trim())
              .filter((repo) => repo.length > 0),
      connector,
      toolsConnector: env.PRBOT_GITHUB_TOOLS_CONNECTOR ?? connector,
      botName: env.PRBOT_GITHUB_BOT_NAME,
    },
    review: { approveMode: env.PRBOT_APPROVE_MODE },
    maintainers: { roles: env.PRBOT_MAINTAINER_ROLES.map((role) => role.toLowerCase()) },
    memory: {
      backend: env.PRBOT_MEMORY_BACKEND,
      orgSlot: env.PRBOT_MEMORY_ORG_SLOT,
      namespace: `prbot:${instanceId}`,
    },
    wiki: toWikiConfig(env),
  };
}

function toWikiConfig(env: InstanceEnv): WikiConfig {
  switch (env.PRBOT_WIKI_PROVIDER) {
    case "linear":
      return { provider: "linear", teams: env.PRBOT_LINEAR_TEAMS ?? [] };
    case "confluence":
      return {
        provider: "confluence",
        spaces: env.PRBOT_CONFLUENCE_SPACES ?? [],
        cloudId: env.PRBOT_CONFLUENCE_CLOUD_ID,
      };
    case "none":
      return { provider: "none" };
  }
}

/** Default Vercel Connect connector UID for an instance's GitHub App. */
export function defaultGitHubConnector(instanceId: string): string {
  return `github/prbot-${instanceId}`;
}

/**
 * The channel's connector UID, read directly from env. `connectGitHubCredentials()` needs a string
 * when the channel module loads, before the full config is parsed. If the instance ID is missing,
 * this returns a placeholder; every inbound hook parses the full config first and refuses to
 * dispatch, so a misconfigured deployment never acts.
 */
export function githubConnectorFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.PRBOT_GITHUB_CONNECTOR) return env.PRBOT_GITHUB_CONNECTOR;
  return defaultGitHubConnector(env.PRBOT_INSTANCE_ID || "unconfigured");
}

let cached: InstanceConfig | undefined;

/**
 * The instance config for this deployment, parsed once from `process.env`. Call it inside hooks,
 * resolvers and handlers rather than at module top level, so builds that evaluate agent modules
 * without runtime env don't fail.
 */
export function getInstanceConfig(): InstanceConfig {
  cached ??= parseInstanceConfig(process.env);
  return cached;
}

/** Test seam: forget the cached config. */
export function resetInstanceConfigForTests(): void {
  cached = undefined;
}
