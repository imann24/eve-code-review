import { describe, expect, it } from "vitest";
import { AUTH_ATTRIBUTES } from "./auth-attributes.js";
import { parseInstanceConfig } from "./config.js";
import { approvalResponseDecision, reviewApprovalStatus } from "./review-policy.js";

const configWith = (mode?: "never" | "hitl" | "auto") =>
  parseInstanceConfig({
    PRBOT_INSTANCE_ID: "acme",
    PRBOT_GITHUB_OWNER: "acme",
    PRBOT_GITHUB_BOT_NAME: "acme-reviewer",
    PRBOT_APPROVE_MODE: mode,
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "token",
  });

const person = (login: string, role: string, instanceId = "acme") => ({
  [AUTH_ATTRIBUTES.instanceId]: instanceId,
  [AUTH_ATTRIBUTES.userLogin]: login,
  [AUTH_ATTRIBUTES.repoRole]: role,
});

describe("reviewApprovalStatus", () => {
  it("allows APPROVE without human confirmation by default", () => {
    expect(reviewApprovalStatus(configWith(), { event: "APPROVE" })).toBe("not-applicable");
  });

  it("never gates COMMENT or REQUEST_CHANGES", () => {
    for (const mode of ["never", "hitl", "auto"] as const) {
      expect(reviewApprovalStatus(configWith(mode), { event: "COMMENT" })).toBe("not-applicable");
      expect(reviewApprovalStatus(configWith(mode), { event: "REQUEST_CHANGES" })).toBe("not-applicable");
    }
  });

  it("applies the instance's approve mode to APPROVE", () => {
    expect(reviewApprovalStatus(configWith("never"), { event: "APPROVE" })).toMatchObject({ type: "denied" });
    expect(reviewApprovalStatus(configWith("hitl"), { event: "APPROVE" })).toBe("user-approval");
    expect(reviewApprovalStatus(configWith("auto"), { event: "APPROVE" })).toBe("not-applicable");
  });
});

describe("approvalResponseDecision", () => {
  const config = configWith("hitl");
  const author = person("author", "write");

  it("lets a maintainer other than the requester confirm", () => {
    expect(approvalResponseDecision(config, person("lead", "admin"), author)).toEqual({ status: "allowed" });
  });

  it("rejects non-maintainers, self-confirmation and other instances", () => {
    expect(approvalResponseDecision(config, person("dev", "write"), author).status).toBe("rejected");
    expect(approvalResponseDecision(config, person("author", "maintain"), author).status).toBe("rejected");
    expect(approvalResponseDecision(config, person("lead", "admin", "other"), author).status).toBe("rejected");
    expect(approvalResponseDecision(config, undefined, author).status).toBe("rejected");
  });
});
