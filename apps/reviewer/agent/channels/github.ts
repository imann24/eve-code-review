import {
  AUTH_ATTRIBUTES,
  getInstanceConfig,
  githubConnectorFromEnv,
  isRepoInScope,
  mentionsBot,
  type InstanceConfig,
} from "@eve-code-review/config";
import { connectGitHubCredentials } from "@vercel/connect/eve";
import {
  defaultGitHubAuth,
  githubChannel,
  type GitHubComment,
  type GitHubInboundContext,
  type GitHubInboundResult,
  type GitHubPullRequestEvent,
} from "eve/channels/github";

/** Pull request actions that start a review. */
const REVIEW_ACTIONS = new Set(["opened", "reopened", "ready_for_review", "synchronize"]);

/**
 * Loads the instance config and checks the event's repo against it. Returns `null` (ignore the
 * event) when the deployment is misconfigured or the repo isn't this instance's: the GitHub App's
 * installation is the real boundary, and this catches an App installed somewhere it shouldn't be.
 */
function configFor(ctx: GitHubInboundContext): InstanceConfig | null {
  let config: InstanceConfig;
  try {
    config = getInstanceConfig();
  } catch (error) {
    console.error("[eve-code-review] refusing GitHub event: instance config is invalid", error);
    return null;
  }
  if (!isRepoInScope(config, { owner: ctx.repository.owner, repo: ctx.repository.name })) {
    console.warn(`[eve-code-review] ignoring event for ${ctx.repository.fullName}: outside instance ${config.instanceId}`);
    return null;
  }
  return config;
}

/**
 * The sender's role on the repository (`admin`, `maintain`, `write`, `triage`, `read`), from
 * GitHub. Anything unexpected becomes `none`, so failures can only take permissions away.
 */
async function repoRole(ctx: GitHubInboundContext): Promise<string> {
  if (ctx.sender.type === "Bot") return "none";
  try {
    const response = await ctx.github.request<{ role_name?: string; permission?: string }>({
      method: "GET",
      path: `/repos/${ctx.repository.owner}/${ctx.repository.name}/collaborators/${encodeURIComponent(ctx.sender.login)}/permission`,
    });
    if (!response.ok) return "none";
    return (response.body.role_name ?? response.body.permission ?? "none").toLowerCase();
  } catch {
    return "none";
  }
}

/** eve's default GitHub auth plus the sender's repo role and this instance's ID. */
async function reviewerAuth(ctx: GitHubInboundContext, config: InstanceConfig) {
  const base = defaultGitHubAuth(ctx);
  return {
    ...base,
    attributes: {
      ...base.attributes,
      [AUTH_ATTRIBUTES.repoRole]: await repoRole(ctx),
      [AUTH_ATTRIBUTES.instanceId]: config.instanceId,
    },
  };
}

async function onPullRequest(ctx: GitHubInboundContext, pr: GitHubPullRequestEvent): Promise<GitHubInboundResult> {
  if (!REVIEW_ACTIONS.has(pr.action)) return null;
  const config = configFor(ctx);
  if (config === null) return null;

  const draft = (pr.raw.pull_request as { draft?: unknown } | undefined)?.draft === true;
  if (draft) return null;

  // Acknowledge on the PR timeline before auth lookup, checkout or model work.
  // A failed progress comment must not prevent the review itself from starting.
  try {
    await ctx.thread.post("starting review...");
  } catch (error) {
    console.error("[eve-code-review] could not post review-start comment", error);
  }

  return {
    auth: await reviewerAuth(ctx, config),
    title: `Review ${ctx.repository.fullName}#${pr.pullRequestNumber}`,
    context: [
      `Review trigger: pull request #${pr.pullRequestNumber} was ${pr.action.replace("_", " ")} at head commit ${pr.headSha ?? "unknown"}. Review it now.`,
    ],
  };
}

async function onComment(ctx: GitHubInboundContext, comment: GitHubComment): Promise<GitHubInboundResult> {
  const config = configFor(ctx);
  if (config === null) return null;
  // Never respond to bots, including this one, so two bots can't loop.
  if (comment.author === undefined || comment.author.type === "Bot") return null;
  if (!mentionsBot(comment.body, config.github.botName)) return null;
  return { auth: await reviewerAuth(ctx, config) };
}

export default githubChannel({
  // Read at module load from env; the hooks above validate the full config before acting.
  credentials: connectGitHubCredentials(githubConnectorFromEnv()),
  botName: process.env.PRBOT_GITHUB_BOT_NAME,
  onPullRequest,
  onComment,
});
