import { approvalResponseDecision, getInstanceConfig, reviewApprovalStatus } from "@eve-code-review/config";
import githubExtension from "@github-tools/eve-extension";
import { defineDurableCallback } from "eve/tools";
import type { ApprovalContext, ApprovalResponseContext } from "eve/tools/approval";

/**
 * Gate for submitting reviews. Request: COMMENT/REQUEST_CHANGES always run; APPROVE follows the
 * instance's PRBOT_APPROVE_MODE. Response (hitl only): a maintainer other than the requester must
 * confirm. Both are durable callbacks with an empty closure; they read the instance config when
 * they run, so they behave the same after a replay or redeploy.
 */
const reviewApproval = {
  request: defineDurableCallback({
    closure: {},
    callback: (_closure, ctx: ApprovalContext) => reviewApprovalStatus(getInstanceConfig(), ctx.toolInput),
  }),
  response: defineDurableCallback({
    closure: {},
    callback: (_closure, ctx: ApprovalResponseContext) =>
      approvalResponseDecision(getInstanceConfig(), ctx.response.principal.attributes, ctx.request.principal?.attributes),
  }),
};

// Mounted as `github`, so tools appear as `github__<name>`.
export default githubExtension({
  connector: () => getInstanceConfig().github.toolsConnector,
  preset: "code-review",
  // The code-review preset also carries PR authoring, merge, and repository write tools. A reviewer
  // only reads, comments and reviews, so those are removed outright rather than approval-gated.
  exclude: [
    "mergePullRequest",
    "createPullRequest",
    "updatePullRequest",
    "deletePullRequestComment",
    "requestReviewers",
    "createBranch",
    "deleteBranch",
    "createOrUpdateFile",
    "forkRepository",
    "createRepository",
  ],
  requireApproval: {
    createPullRequestReview: reviewApproval,
    addPullRequestComment: "never",
    updatePullRequestComment: "never",
    replyToReviewComment: "never",
    resolveReviewThread: "never",
  },
});
