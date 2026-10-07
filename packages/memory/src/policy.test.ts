import { AUTH_ATTRIBUTES, parseInstanceConfig } from "@eve-code-review/config";
import type { MemoryProvider, MemoryToolDefinition, MemoryToolsContext } from "eve/memory";
import { defineTool } from "eve/tools";
import { describe, expect, it, vi } from "vitest";
import { agentkitKeyspace } from "./adapters/agentkit.js";
import { decideWrite, withReviewPolicy, writeApprovalStatus } from "./policy.js";
import type { MemoryAdapter, WriteRules } from "./types.js";

const config = parseInstanceConfig({
  PRBOT_INSTANCE_ID: "acme",
  PRBOT_GITHUB_OWNER: "acme",
  PRBOT_GITHUB_BOT_NAME: "acme-reviewer",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
});
const rules: WriteRules = { instanceId: "acme", roles: ["maintain", "admin"] };

const maintainer = {
  [AUTH_ATTRIBUTES.instanceId]: "acme",
  [AUTH_ATTRIBUTES.userLogin]: "octocat",
  [AUTH_ATTRIBUTES.repoRole]: "maintain",
  [AUTH_ATTRIBUTES.repository]: "acme/api",
};

const sessionWith = (attributes: Record<string, string> | null) =>
  ({ session: { auth: { current: attributes === null ? null : { attributes } } } }) as never;

describe("decideWrite", () => {
  it("allows maintainers", () => {
    expect(decideWrite(rules, maintainer)).toEqual({
      allowed: true,
      login: "octocat",
      role: "maintain",
      repository: "acme/api",
    });
  });

  it("refuses non-maintainers, unauthenticated turns and other instances", () => {
    expect(decideWrite(rules, { ...maintainer, [AUTH_ATTRIBUTES.repoRole]: "write" }).allowed).toBe(false);
    expect(decideWrite(rules, { ...maintainer, [AUTH_ATTRIBUTES.repoRole]: "" }).allowed).toBe(false);
    expect(decideWrite(rules, undefined).allowed).toBe(false);
    expect(decideWrite(rules, { ...maintainer, [AUTH_ATTRIBUTES.instanceId]: "other" }).allowed).toBe(false);
  });

  it("maps to approval statuses", () => {
    expect(writeApprovalStatus(rules, sessionWith(maintainer))).toBe("not-applicable");
    expect(writeApprovalStatus(rules, sessionWith(null))).toMatchObject({ type: "denied" });
  });
});

describe("withReviewPolicy", () => {
  const save = vi.fn(async () => ({ saved: true }));
  const innerTools: Record<string, MemoryToolDefinition> = {
    save_memory: defineTool({ description: "Save.", inputSchema: { type: "object" }, execute: save }) as never,
    search_memory: defineTool({
      description: "Search.",
      inputSchema: { type: "object" },
      execute: async () => ({ results: [] }),
    }) as never,
  };
  const inner: MemoryProvider = {
    recall: { "turn.started": () => ({ messages: [{ content: "recalled" }] }) },
    tools: async () => innerTools,
  };
  const adapter: MemoryAdapter = {
    id: "fake",
    writeTools: ["save_memory"],
    createProvider: vi.fn(() => inner),
  };
  const provider = withReviewPolicy({ adapter, slot: "repo", getConfig: () => config });

  it("builds the inner provider lazily, once, for this instance and slot", async () => {
    expect(adapter.createProvider).not.toHaveBeenCalled();
    await provider.recall["turn.started"]({} as never);
    await provider.recall["turn.started"]({} as never);
    expect(adapter.createProvider).toHaveBeenCalledTimes(1);
    expect(adapter.createProvider).toHaveBeenCalledWith({ instanceId: "acme", slot: "repo" });
  });

  it("adds a maintainer approval gate to write tools only", async () => {
    const tools = (await provider.tools!({} as MemoryToolsContext))!;
    const approval = tools.save_memory!.approval as (ctx: unknown) => unknown;
    expect(typeof approval).toBe("function");
    expect(approval(sessionWith(maintainer))).toBe("not-applicable");
    expect(approval(sessionWith({ ...maintainer, [AUTH_ATTRIBUTES.repoRole]: "read" }))).toMatchObject({
      type: "denied",
    });
    // The provider's own execute is reused, not wrapped.
    expect(tools.save_memory!.execute).toBe(innerTools.save_memory!.execute);
    expect(tools.search_memory).toBe(innerTools.search_memory);
  });
});

describe("agentkitKeyspace", () => {
  it("separates instances and slots", () => {
    expect(agentkitKeyspace("acme-api", "repo")).toEqual({
      prefix: "prbot:acme-api:repo",
      indexName: "prbot_acme_api_repo",
    });
    expect(agentkitKeyspace("acme-api", "org").prefix).not.toBe(agentkitKeyspace("acme-api", "repo").prefix);
    expect(agentkitKeyspace("acme", "repo").prefix).not.toBe(agentkitKeyspace("acme-web", "repo").prefix);
  });
});
