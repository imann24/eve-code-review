# Architecture

## The flow

1. GitHub sends a webhook (PR opened/updated, or a comment mentioning the bot) to the instance's Vercel deployment at `/eve/v1/github`. Vercel Connect verifies it.
2. `channels/github.ts` loads the instance config, drops anything outside the instance's scope, looks up the sender's role on the repo, and dispatches a turn. The session's auth carries the repo, the sender, their role and the instance ID.
3. eve checks out the PR head into the sandbox, puts the diff in context, and recalls memories for the repo and org.
4. The reviewer reads code, asks `docs_researcher` for relevant docs, and submits one review through `github__createPullRequestReview`.
5. When a maintainer mentions the bot with feedback, it saves a rule with `repo__save_memory` or `org__save_memory`.

## Instances and isolation

An instance is one Vercel project from this repo, configured by env vars (`packages/config/src/schema.ts` is the full contract). The default is one instance per org (`PRBOT_GITHUB_REPOS=*`); a per-repo instance lists its repos. Instance IDs follow `<org>` or `<org>-<repo>`.

| Layer | Hard boundary | Defense in depth |
|---|---|---|
| Runtime | Separate Vercel project: own env, sessions, sandbox, Connect connectors | — |
| GitHub | The instance's GitHub App is installed only on its org or repos | Channel hooks ignore repos outside `PRBOT_GITHUB_OWNER` / `PRBOT_GITHUB_REPOS` |
| Memory | One Upstash database per instance | Namespace `prbot:<id>:<slot>`, Redis prefix and index per instance and slot, scope `[owner, repo]` / `[owner]`, and every slot disables itself unless the turn carries this instance's ID |
| Wiki | Read-only credentials from an account that only sees the instance's teams or spaces | Read-only endpoint (Linear) or read-tool allowlist (Confluence), `instanceKey` per instance, scope guidance in the subagent's instructions |

Config is parsed lazily, inside hooks and resolvers, so `eve build` works without env. At runtime a missing or invalid variable throws `InstanceConfigError`, and the channel refuses to dispatch. A misconfigured instance does nothing rather than something wrong.

## Trust model

Everything the model reads (diff, PR text, comments, wiki pages, recalled memories) is treated as untrusted. Decisions that matter don't depend on the model:

- **Memory writes** are gated by an approval policy on the provider's write tools (`packages/memory/src/policy.ts`). It reads the sender's GitHub role from the session's auth attributes, which the channel set from GitHub's API. A denied write never runs.
- **Approvals** are gated by `reviewApprovalStatus` / `approvalResponseDecision` (`packages/config/src/review-policy.ts`). In `hitl` mode, an APPROVE review is held until a maintainer who didn't trigger the review confirms it in the PR thread.
- **Destructive GitHub tools** (merge, push, branch and repo writes, PR edits) are excluded from the extension entirely.

## Memory: the plug-in point

```
memory/repo.ts ─┐
memory/org.ts  ─┴─> reviewMemoryProvider(slot)
                       └─> withReviewPolicy(adapter)     maintainer gate on write tools, lazy init
                              └─> MemoryAdapter          picked by PRBOT_MEMORY_BACKEND
                                     └─> agentkitAdapter -> redisMemory() from @upstash/agentkit-eve
```

The interface is eve's own `MemoryProvider` contract, plus a `MemoryAdapter` that names which tools write. To add a backend (Supermemory, Arcana, or a custom provider over Azure Managed Redis or pgvector):

1. Implement `MemoryAdapter` in `packages/memory/src/adapters/`. `createProvider` must keep instances and slots in separate keyspaces.
2. Register it in `memoryAdapters` (`packages/memory/src/index.ts`).
3. Add its name to `PRBOT_MEMORY_BACKEND` in the config schema.

Nothing else changes: slot files, scopes, instructions and the write gate are backend-neutral.

The AgentKit adapter sets `rememberMessages: false`, so nothing is captured automatically. Webhook payloads and anyone's comments arrive as user messages, so only explicit, maintainer-gated saves are stored.

**Provenance isn't stored yet.** eve requires provider tool callbacks to be durable, so the policy layer can add an approval gate to AgentKit's `save_memory` but can't rewrite its input to stamp who taught it. A custom backend that owns its save tool can store structured provenance (login, role, PR); see [spikes](spikes.md).

## Wiki: the plug-in point

`packages/wiki` exports one plugin per provider. A plugin returns an eve MCP connection definition and a short guidance string for the docs researcher. The subagent's `connections/wiki.ts` resolves the instance's plugin per session; with `PRBOT_WIKI_PROVIDER=none` there's no connection.

| | Linear | Confluence |
|---|---|---|
| Endpoint | `https://mcp.linear.app/mcp/readonly` | `https://mcp.atlassian.com/v1/mcp` |
| Auth | Read-only API key, sent as Bearer | Personal API token over Basic auth (admin must enable API token auth for Rovo MCP) |
| Tools | Read-only by endpoint | Allowlist of six read tools; writes, Jira and `execute*` passthroughs filtered out |
| Scope | Team guidance; key from the right workspace | `cloudId` pinned as a hidden argument when set; CQL space guidance |

To add a provider, implement `WikiPlugin`, add it to `wikiConnectionFor` and `wikiGuidanceFor`, and add its settings to the config schema.
