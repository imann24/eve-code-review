import { AUTH_ATTRIBUTES, parseInstanceConfig } from "@eve-code-review/config";
import { describe, expect, it } from "vitest";
import { orgMemoryScope, repoMemoryScope } from "./scope.js";

const env = {
  PRBOT_INSTANCE_ID: "acme",
  PRBOT_GITHUB_OWNER: "acme",
  PRBOT_GITHUB_BOT_NAME: "acme-reviewer",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token",
};
const perOrg = parseInstanceConfig(env);
const perRepo = parseInstanceConfig({ ...env, PRBOT_GITHUB_REPOS: "api", PRBOT_MEMORY_ORG_SLOT: "false" });

const ctx = (attributes: Record<string, string> | null) =>
  ({ session: { auth: { current: attributes === null ? null : { attributes } } } }) as never;

const turn = (repository: string, instanceId = "acme") =>
  ctx({ [AUTH_ATTRIBUTES.repository]: repository, [AUTH_ATTRIBUTES.instanceId]: instanceId });

describe("memory scopes", () => {
  it("scopes repo memory to [owner, repo] and org memory to [owner]", () => {
    expect(repoMemoryScope(turn("Acme/API"), perOrg)).toEqual(["acme", "api"]);
    expect(orgMemoryScope(turn("Acme/API"), perOrg)).toEqual(["acme"]);
  });

  it("disables memory when the turn doesn't belong to this instance", () => {
    expect(repoMemoryScope(ctx(null), perOrg)).toBeNull();
    expect(repoMemoryScope(turn("other/api"), perOrg)).toBeNull();
    expect(repoMemoryScope(turn("acme/api", "acme-web"), perOrg)).toBeNull();
    expect(repoMemoryScope(turn("acme/web"), perRepo)).toBeNull();
  });

  it("honours the org slot switch", () => {
    expect(repoMemoryScope(turn("acme/api"), perRepo)).toEqual(["acme", "api"]);
    expect(orgMemoryScope(turn("acme/api"), perRepo)).toBeNull();
  });
});
