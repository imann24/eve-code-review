import { parseInstanceConfig } from "@eve-code-review/config";
import { afterEach, describe, expect, it } from "vitest";
import { ATLASSIAN_MCP_URL, LINEAR_READONLY_MCP_URL, wikiConnectionFor, wikiGuidanceFor } from "./index.js";

const base = {
  PRBOT_INSTANCE_ID: "acme",
  PRBOT_GITHUB_OWNER: "acme",
  PRBOT_GITHUB_BOT_NAME: "acme-reviewer",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

const linear = parseInstanceConfig({
  ...base,
  PRBOT_WIKI_PROVIDER: "linear",
  PRBOT_LINEAR_TEAMS: "ENG",
  LINEAR_API_KEY: "lin_api_x",
});

const confluence = (extra: Record<string, string> = {}) =>
  parseInstanceConfig({
    ...base,
    PRBOT_WIKI_PROVIDER: "confluence",
    PRBOT_CONFLUENCE_SPACES: "ENG,ARCH",
    ATLASSIAN_EMAIL: "bot@acme.dev",
    ATLASSIAN_API_TOKEN: "atl",
    ...extra,
  });

afterEach(() => {
  delete process.env.LINEAR_API_KEY;
  delete process.env.ATLASSIAN_EMAIL;
  delete process.env.ATLASSIAN_API_TOKEN;
});

describe("wikiConnectionFor", () => {
  it("returns no connection when the instance has no wiki", () => {
    expect(wikiConnectionFor(parseInstanceConfig(base))).toBeNull();
    expect(wikiGuidanceFor(parseInstanceConfig(base))).toMatch(/no wiki/);
  });

  it("uses Linear's read-only endpoint with a per-instance key and a Bearer API key", async () => {
    const connection = wikiConnectionFor(linear)!;
    expect(connection.url).toBe(LINEAR_READONLY_MCP_URL);
    expect(connection.instanceKey).toBe("acme:linear");

    process.env.LINEAR_API_KEY = "lin_api_secret";
    const auth = connection.auth as { getToken: () => Promise<{ token: string }> };
    await expect(auth.getToken()).resolves.toEqual({ token: "lin_api_secret" });
    expect(wikiGuidanceFor(linear)).toContain("ENG");
  });

  it("filters Confluence to read tools and sends Basic auth", () => {
    const connection = wikiConnectionFor(confluence())!;
    expect(connection.url).toBe(ATLASSIAN_MCP_URL);
    expect(connection.instanceKey).toBe("acme:confluence");
    const allow = (connection.tools as { allow: string[] }).allow;
    expect(allow).toContain("searchConfluence");
    expect(allow).toContain("getAccessibleAtlassianResources");
    expect(allow.some((tool) => /create|update|execute/i.test(tool))).toBe(false);
    expect(connection.toolCall).toBeUndefined();

    process.env.ATLASSIAN_EMAIL = "bot@acme.dev";
    process.env.ATLASSIAN_API_TOKEN = "atl";
    const headers = (connection.headers as () => Record<string, string>)();
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("bot@acme.dev:atl").toString("base64")}`);
  });

  it("pins cloudId when configured and drops the discovery tool", () => {
    const connection = wikiConnectionFor(confluence({ PRBOT_CONFLUENCE_CLOUD_ID: "cloud-123" }))!;
    expect(connection.toolCall?.providedArguments).toEqual({ cloudId: "cloud-123" });
    expect((connection.tools as { allow: string[] }).allow).not.toContain("getAccessibleAtlassianResources");
  });
});
