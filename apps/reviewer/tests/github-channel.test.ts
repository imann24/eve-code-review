import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetInstanceConfigForTests } from "@eve-code-review/config";
import { githubChannel, type GitHubInboundContext, type GitHubPullRequestEvent } from "eve/channels/github";
import "../agent/channels/github.js";

vi.mock("@eve-code-review/config", () => import("../../../packages/config/src/index.js"));
vi.mock("@vercel/connect/eve", () => ({ connectGitHubCredentials: vi.fn(() => ({})) }));
vi.mock("eve/channels/github", () => ({
  githubChannel: vi.fn((config) => config),
  defaultGitHubAuth: vi.fn(() => ({ attributes: {} })),
}));

const onPullRequest = vi.mocked(githubChannel).mock.calls[0][0]!.onPullRequest!;
const onComment = vi.mocked(githubChannel).mock.calls[0][0]!.onComment!;

function fixture(action = "opened", draft = false, owner = "acme") {
  const post = vi.fn().mockResolvedValue({ id: 123 });
  const request = vi.fn().mockResolvedValue({ ok: true, body: { role_name: "write" } });
  const ctx = {
    repository: { owner, name: "api", fullName: `${owner}/api` },
    sender: { login: "author", type: "User" },
    thread: { kind: "pull_request", post },
    github: { request },
  } as unknown as GitHubInboundContext;
  const pr = { action, pullRequestNumber: 42, headSha: "abc123", raw: { pull_request: { draft } } } as GitHubPullRequestEvent;
  return { ctx, pr, post, request };
}

beforeEach(() => {
  vi.stubEnv("PRBOT_INSTANCE_ID", "acme");
  vi.stubEnv("PRBOT_GITHUB_OWNER", "acme");
  vi.stubEnv("PRBOT_GITHUB_REPOS", "*");
  vi.stubEnv("PRBOT_GITHUB_BOT_NAME", "acme-reviewer");
  vi.stubEnv("PRBOT_WIKI_PROVIDER", "none");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
  resetInstanceConfigForTests();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetInstanceConfigForTests();
});

describe("review start notification", () => {
  it.each(["opened", "reopened", "ready_for_review", "synchronize"])("posts before auth lookup and dispatch for %s", async (action) => {
    const { ctx, pr, post, request } = fixture(action);
    request.mockImplementation(async () => {
      expect(post).toHaveBeenCalledExactlyOnceWith("starting review...");
      return { ok: true, body: { role_name: "write" } };
    });
    expect(await onPullRequest(ctx, pr)).toMatchObject({ title: "Review acme/api#42" });
    expect(request).toHaveBeenCalledOnce();
  });

  it.each([
    ["closed", false, "acme"],
    ["opened", true, "acme"],
    ["opened", false, "other"],
  ])("ignores %s, draft=%s, owner=%s without posting", async (action, draft, owner) => {
    const { ctx, pr, post } = fixture(action, draft, owner);
    expect(await onPullRequest(ctx, pr)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("does not post when instance configuration is invalid", async () => {
    vi.stubEnv("PRBOT_INSTANCE_ID", "");
    const { ctx, pr, post } = fixture();
    expect(await onPullRequest(ctx, pr)).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("still dispatches the review if the progress comment fails", async () => {
    const { ctx, pr, post } = fixture();
    post.mockRejectedValue(new Error("GitHub unavailable"));
    expect(await onPullRequest(ctx, pr)).toMatchObject({ title: "Review acme/api#42" });
    expect(console.error).toHaveBeenCalled();
  });

  it("does not start a review in response to its own bot comment", async () => {
    const { ctx, post } = fixture();
    expect(await onComment(ctx, {
      author: { login: "acme-reviewer[bot]", type: "Bot" },
      body: "starting review...",
    } as Parameters<typeof onComment>[1])).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
