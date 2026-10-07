# Open questions and spikes

What's verified so far, and what still needs a real deployment to confirm.

## Verified while scaffolding

- **eve discovers every piece.** `eve build` and `eve info` (eve 0.71.3) find both channels, the github-tools extension, both memory slots, the skill, `no_reply`, and the docs researcher with its dynamic `wiki` connection. 0 errors, 0 warnings. The build needs no instance env.
- **The repo lives on the session.** eve's `defaultGitHubAuth()` copies the verified webhook's `repository`, `user_login` and PR number into `auth.current.attributes`; memory scopes and the write gate read them from there.
- **Review tool shape.** `createPullRequestReview` takes `event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"` plus inline `comments`; the approval gate keys on `event`.
- **AgentKit tool names.** `save_memory`, `forget_memory`, `search_memory`, `read_session`. The first two are gated.
- **Confluence tool names.** The read-tool allowlist comes from Atlassian's supported-tools list, and every Rovo tool takes `cloudId`.
- **eve 0.72 regression.** eve 0.72.0 and 0.72.1 fail `eve build` for any agent mounting `@github-tools/eve-extension` 0.8.0, reproduced in a fresh `eve init` project; 0.71.3 builds. Report upstream, then unpin.

## Needs a live deployment

1. **One connector or two.** Can the github-tools extension use the channel's Connect connector, so the bot has one GitHub identity? If not, create a second connector and set `PRBOT_GITHUB_TOOLS_CONNECTOR`.
2. **HITL replies.** When the bot asks a maintainer to confirm an approval, does a plain reply resolve it, or must the reply also @mention the bot to pass `onComment`? The response policy relies on the reply's auth carrying `prbot_repo_role`, which our hook sets.
3. **Approval semantics.** Does a denied memory write or a refused APPROVE return a readable reason to the model, so it can tell the user and fall back to COMMENT?
4. **Branch protection.** Does the GitHub App's approval count toward required reviews under your rules?
5. **Role lookup permission.** `GET /repos/{owner}/{repo}/collaborators/{user}/permission` with the App's installation token: confirm it works with the permissions in the deploy guide and returns `role_name: "maintain"` for maintainers.
6. **Linear documents over MCP.** Confirm the read-only endpoint exposes document tools (not just issues and projects), and whether API keys can be restricted to teams. If not, team scope is only enforced by guidance and by whose key it is.
7. **Confluence on the free plan.** Confirm the Rovo MCP server and the API-token toggle are available on Confluence Free, and that pinning `cloudId` doesn't break any allowed tool.
8. **Duplicate reviews.** The instructions tell the bot to skip a head commit it already reviewed. If it still double-posts on fast `synchronize` events, move the check into code (a tool or channel hook that records the last reviewed SHA).
9. **Context window metadata.** `eve build` fetches model metadata from the AI Gateway catalog. It works on Vercel; in a locked-down CI it may need `modelContextWindowTokens` set on both agents.

## Decisions made

- **Provenance.** eve requires provider tool callbacks to be durable, so the policy can gate AgentKit's `save_memory` but can't rewrite its input to record who taught a rule. v1 gates writes to maintainers and doesn't store provenance. A custom memory adapter that owns its save tool is the place to add structured provenance (login, role, PR, time).
- **GitHub App per instance.** `eve add channel/github` creates the App and webhook through Vercel Connect in one guided flow, so it's a few minutes per instance. `PRBOT_GITHUB_CONNECTOR` can point several instances at one shared App, at the cost of a weaker boundary.
- **One wiki per instance.** `PRBOT_WIKI_PROVIDER` picks Linear, Confluence or none.
