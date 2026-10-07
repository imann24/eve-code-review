import { z } from "zod";

/**
 * Instance IDs name everything an instance owns: its memory namespace, its Redis key prefix,
 * its GitHub connector. Convention: `<org>` for a per-org instance, `<org>-<repo>` for a
 * per-repo instance. Lowercase so the ID is safe in Redis keys, index names and connector UIDs.
 */
export const INSTANCE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const csv = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );

const nonEmptyCsv = csv.refine((items) => items.length > 0, "must list at least one value");

const booleanFlag = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

/**
 * Raw environment contract. Every variable an instance reads is declared here, so this schema is
 * also the reference for what to set in each Vercel project (see `.env.example`).
 */
export const InstanceEnvSchema = z
  .object({
    PRBOT_INSTANCE_ID: z
      .string()
      .regex(INSTANCE_ID_PATTERN, "use lowercase letters, digits and hyphens, e.g. `acme` or `acme-api`"),

    PRBOT_GITHUB_OWNER: z.string().min(1),
    /** `*` (the default) reviews every repo the instance's GitHub App is installed on in the owner. */
    PRBOT_GITHUB_REPOS: z.string().default("*"),
    /** Vercel Connect connector UID. Defaults to `github/prbot-<instanceId>`; override to share an App. */
    PRBOT_GITHUB_CONNECTOR: z.string().min(1).optional(),
    /**
     * Connector for the github-tools extension (reviews, inline comments). Defaults to the channel's
     * connector so the bot has one GitHub identity; set it if one connector can't serve both.
     */
    PRBOT_GITHUB_TOOLS_CONNECTOR: z.string().min(1).optional(),
    /** The handle people type to summon the bot in comments, without `@` (usually the App slug). */
    PRBOT_GITHUB_BOT_NAME: z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "use the GitHub App slug, without the leading @"),

    /** never: the bot cannot approve · hitl: a maintainer confirms each approval · auto: no human gate. */
    PRBOT_APPROVE_MODE: z.enum(["never", "hitl", "auto"]).default("auto"),
    /** GitHub repository roles that count as maintainers (memory writes, approval confirmations). */
    PRBOT_MAINTAINER_ROLES: nonEmptyCsv.default(["maintain", "admin"]),

    PRBOT_MEMORY_BACKEND: z.enum(["agentkit"]).default("agentkit"),
    /** Adds a second memory slot scoped to the org, for conventions shared across repos. */
    PRBOT_MEMORY_ORG_SLOT: booleanFlag.default(true),

    PRBOT_WIKI_PROVIDER: z.enum(["none", "linear", "confluence"]).default("none"),
    PRBOT_LINEAR_TEAMS: nonEmptyCsv.optional(),
    PRBOT_CONFLUENCE_SPACES: nonEmptyCsv.optional(),
    PRBOT_CONFLUENCE_CLOUD_ID: z.string().min(1).optional(),

    // Secrets. Validated for presence only; never copied into the parsed config.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    LINEAR_API_KEY: z.string().min(1).optional(),
    ATLASSIAN_EMAIL: z.string().email().optional(),
    ATLASSIAN_API_TOKEN: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, because: string) => {
      if (env[key] === undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: `required ${because}` });
      }
    };

    if (env.PRBOT_MEMORY_BACKEND === "agentkit") {
      need("UPSTASH_REDIS_REST_URL", "when PRBOT_MEMORY_BACKEND=agentkit");
      need("UPSTASH_REDIS_REST_TOKEN", "when PRBOT_MEMORY_BACKEND=agentkit");
    }
    if (env.PRBOT_WIKI_PROVIDER === "linear") {
      need("PRBOT_LINEAR_TEAMS", "when PRBOT_WIKI_PROVIDER=linear");
      need("LINEAR_API_KEY", "when PRBOT_WIKI_PROVIDER=linear");
    }
    if (env.PRBOT_WIKI_PROVIDER === "confluence") {
      need("PRBOT_CONFLUENCE_SPACES", "when PRBOT_WIKI_PROVIDER=confluence");
      need("ATLASSIAN_EMAIL", "when PRBOT_WIKI_PROVIDER=confluence");
      need("ATLASSIAN_API_TOKEN", "when PRBOT_WIKI_PROVIDER=confluence");
    }
  });

export type InstanceEnv = z.output<typeof InstanceEnvSchema>;
