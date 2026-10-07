import type { ApprovalResponseDecision, ApprovalStatus } from "eve/tools/approval";
import { AUTH_ATTRIBUTES } from "./auth-attributes.js";
import type { InstanceConfig } from "./config.js";
import { isMaintainerRole } from "./scope.js";

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

type Attributes = Readonly<Record<string, string | readonly string[]>> | undefined;

function attribute(attributes: Attributes, key: string): string | undefined {
  const value = attributes?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Request-time gate for `createPullRequestReview`, driven by `PRBOT_APPROVE_MODE`.
 *
 * - COMMENT and REQUEST_CHANGES reviews always go through.
 * - APPROVE is refused (`never`), held for a maintainer's confirmation (`hitl`), or allowed (`auto`).
 */
export function reviewApprovalStatus(config: InstanceConfig, toolInput: unknown): ApprovalStatus {
  const event = (toolInput as { event?: unknown } | undefined)?.event;
  if (event !== "APPROVE") return "not-applicable";

  switch (config.review.approveMode) {
    case "never":
      return {
        type: "denied",
        reason:
          "This instance does not let the reviewer approve pull requests. Submit the review with event COMMENT instead and say it looks ready for a human approval.",
      };
    case "hitl":
      return "user-approval";
    case "auto":
      return "not-applicable";
  }
}

/**
 * Who may confirm a held approval: a maintainer of the repository (per the instance's roles), on
 * a turn this instance dispatched, who is not the person whose turn requested the approval. That
 * last rule stops a PR author from approving their own PR through the bot.
 */
export function approvalResponseDecision(
  config: InstanceConfig,
  responder: Attributes,
  requester: Attributes,
): ApprovalResponseDecision {
  if (attribute(responder, AUTH_ATTRIBUTES.instanceId) !== config.instanceId) {
    return { status: "rejected", reason: "This confirmation did not come through this instance." };
  }
  const login = attribute(responder, AUTH_ATTRIBUTES.userLogin) ?? "unknown";
  const role = attribute(responder, AUTH_ATTRIBUTES.repoRole);
  if (!isMaintainerRole(config, role)) {
    return {
      status: "rejected",
      reason: `@${login} can't confirm approvals. Only ${config.maintainers.roles.join(" or ")} can.`,
    };
  }
  const requesterLogin = attribute(requester, AUTH_ATTRIBUTES.userLogin);
  if (requesterLogin !== undefined && requesterLogin.toLowerCase() === login.toLowerCase()) {
    return { status: "rejected", reason: `@${login} triggered this review, so someone else has to confirm the approval.` };
  }
  return { status: "allowed" };
}
