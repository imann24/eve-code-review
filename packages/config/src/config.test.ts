import { describe, expect, it } from "vitest";
import { InstanceConfigError, parseInstanceConfig } from "./config.js";
import { isMaintainerRole, isRepoInScope, mentionsBot, parseRepositoryFullName } from "./scope.js";

const base = {
  PRBOT_INSTANCE_ID: "acme",
  PRBOT_GITHUB_OWNER: "acme",
  PRBOT_GITHUB_BOT_NAME: "acme-reviewer",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};

describe("parseInstanceConfig", () => {
  it("applies per-org defaults", () => {
    const config = parseInstanceConfig(base);
    expect(config.github).toEqual({
      owner: "acme",
      repos: "*",
      connector: "github/prbot-acme",
      toolsConnector: "github/prbot-acme",
      botName: "acme-reviewer",
    });
    expect(config.review.approveMode).toBe("auto");
    expect(config.maintainers.roles).toEqual(["maintain", "admin"]);
    expect(config.memory).toEqual({ backend: "agentkit", orgSlot: true, namespace: "prbot:acme" });
    expect(config.wiki).toEqual({ provider: "none" });
  });

  it("parses a per-repo Linear instance", () => {
    const config = parseInstanceConfig({
      ...base,
      PRBOT_INSTANCE_ID: "acme-api",
      PRBOT_GITHUB_REPOS: "api, web ",
      PRBOT_GITHUB_CONNECTOR: "github/shared-reviewer",
      PRBOT_APPROVE_MODE: "never",
      PRBOT_MEMORY_ORG_SLOT: "false",
      PRBOT_WIKI_PROVIDER: "linear",
      PRBOT_LINEAR_TEAMS: "ENG,PLAT",
      LINEAR_API_KEY: "lin_api_x",
    });
    expect(config.github.repos).toEqual(["api", "web"]);
    expect(config.github.connector).toBe("github/shared-reviewer");
    expect(config.github.toolsConnector).toBe("github/shared-reviewer");
    expect(config.memory.orgSlot).toBe(false);
    expect(config.wiki).toEqual({ provider: "linear", teams: ["ENG", "PLAT"] });
  });

  it("never copies secrets into the parsed config", () => {
    const config = parseInstanceConfig({
      ...base,
      PRBOT_WIKI_PROVIDER: "linear",
      PRBOT_LINEAR_TEAMS: "ENG",
      LINEAR_API_KEY: "lin_api_secret",
    });
    expect(JSON.stringify(config)).not.toContain("secret");
    expect(JSON.stringify(config)).not.toContain("token");
  });

  it("fails closed when required values are missing", () => {
    expect(() => parseInstanceConfig({})).toThrow(InstanceConfigError);
    expect(() => parseInstanceConfig({ ...base, UPSTASH_REDIS_REST_TOKEN: undefined })).toThrow(
      /UPSTASH_REDIS_REST_TOKEN/,
    );
    expect(() => parseInstanceConfig({ ...base, PRBOT_WIKI_PROVIDER: "linear" })).toThrow(
      /PRBOT_LINEAR_TEAMS[\s\S]*LINEAR_API_KEY/,
    );
    expect(() =>
      parseInstanceConfig({ ...base, PRBOT_WIKI_PROVIDER: "confluence", PRBOT_CONFLUENCE_SPACES: "ENG" }),
    ).toThrow(/ATLASSIAN_EMAIL/);
  });

  it("rejects instance IDs that are unsafe as keys", () => {
    for (const bad of ["Acme", "acme_api", "-acme", "acme-", "acme/api", ""]) {
      expect(() => parseInstanceConfig({ ...base, PRBOT_INSTANCE_ID: bad })).toThrow(/PRBOT_INSTANCE_ID/);
    }
  });
});

describe("scope helpers", () => {
  const perOrg = parseInstanceConfig(base);
  const perRepo = parseInstanceConfig({ ...base, PRBOT_INSTANCE_ID: "acme-api", PRBOT_GITHUB_REPOS: "api" });

  it("parses repository full names", () => {
    expect(parseRepositoryFullName("acme/api")).toEqual({ owner: "acme", repo: "api" });
    expect(parseRepositoryFullName("acme")).toBeNull();
    expect(parseRepositoryFullName("acme/api/extra")).toBeNull();
    expect(parseRepositoryFullName(undefined)).toBeNull();
  });

  it("scopes repos to the owner and allowlist, case-insensitively", () => {
    expect(isRepoInScope(perOrg, { owner: "ACME", repo: "anything" })).toBe(true);
    expect(isRepoInScope(perOrg, { owner: "other", repo: "api" })).toBe(false);
    expect(isRepoInScope(perRepo, { owner: "acme", repo: "API" })).toBe(true);
    expect(isRepoInScope(perRepo, { owner: "acme", repo: "web" })).toBe(false);
  });

  it("treats only configured roles as maintainers", () => {
    expect(isMaintainerRole(perOrg, "admin")).toBe(true);
    expect(isMaintainerRole(perOrg, "Maintain")).toBe(true);
    expect(isMaintainerRole(perOrg, "write")).toBe(false);
    expect(isMaintainerRole(perOrg, undefined)).toBe(false);
  });

  it("matches whole @mentions only", () => {
    expect(mentionsBot("@acme-reviewer can you look?", "acme-reviewer")).toBe(true);
    expect(mentionsBot("thanks @Acme-Reviewer!", "acme-reviewer")).toBe(true);
    expect(mentionsBot("(@acme-reviewer)", "acme-reviewer")).toBe(true);
    expect(mentionsBot("@acme-reviewer-2 please", "acme-reviewer")).toBe(false);
    expect(mentionsBot("mail bot@acme-reviewer.dev", "acme-reviewer")).toBe(false);
    expect(mentionsBot("acme-reviewer without at", "acme-reviewer")).toBe(false);
  });
});
