# eve-code-review

A pull request review agent built on [eve](https://eve.dev), Vercel's agent framework. It reviews PRs with inline comments, checks them against your internal docs (Linear or Confluence), and remembers what maintainers teach it.

It's designed to be deployed many times, once per GitHub org or repo, with each instance fully isolated: its own GitHub App, its own memory database, its own wiki credentials.

> **Status:** scaffold. The agent compiles (`eve build` passes with 0 diagnostics) and the policy code is unit-tested, but it hasn't reviewed a real PR yet. See [docs/spikes.md](docs/spikes.md) for what still needs validating end to end.

## What it does

- **Reviews PRs** when they're opened, reopened, marked ready, or pushed to. One review per head commit, with inline comments tagged `blocker` / `should-fix` / `nit`.
- **Reads your docs.** A docs-researcher subagent finds the Linear issue or spec a PR implements and the team conventions for the code it touches, and the review cites them.
- **Learns from maintainers.** Mention the bot with feedback ("we allow raw SQL in migrations") and it saves the rule for that repo or the whole org. Only people with `maintain` or `admin` on the repo can teach it.
- **Approves only on your terms.** Per instance: never approve, approve only after a maintainer confirms in the PR thread, or approve automatically.

## How it's built

```
eve-code-review/
├── packages/
│   ├── config/   instance config from env (fails closed), scope checks, review approval policy
│   ├── memory/   policy layer over swappable eve memory providers; Upstash AgentKit adapter
│   └── wiki/     wiki plugins: Linear and Confluence, as MCP connections
└── apps/reviewer/   the eve agent
    └── agent/
        ├── agent.ts, instructions.md
        ├── channels/github.ts         PR + @mention triggers, scope gate, repo-role lookup
        ├── channels/eve.ts            HTTP/TUI access for development
        ├── extensions/github.ts       github-tools (code-review preset) with the approval gate
        ├── memory/repo.ts, org.ts     repo- and org-scoped memory slots
        ├── skills/learn-from-feedback.md
        ├── tools/no_reply.ts
        └── subagents/docs_researcher/ read-only wiki research (dynamic `wiki` connection)
```

[docs/architecture.md](docs/architecture.md) explains the isolation model and the memory and wiki plug-in points.

## Running an instance

Each instance is one Vercel project pointing at the repository root, configured entirely by environment variables. The root [`vercel.json`](vercel.json) uses Vercel Services with one deployable service, `reviewer`, rooted at `apps/reviewer`. `packages/config`, `packages/memory`, and `packages/wiki` are shared libraries built into that service, not HTTP services, so they need no service bindings. The full checklist is in [docs/deploy-an-instance.md](docs/deploy-an-instance.md); the short version:

1. Create an Upstash Redis database for the instance.
2. Create a Vercel project from this repo with the repository root as its root directory, and run `pnpm dlx vercel link` there.
3. Create the instance's GitHub App through Vercel Connect and install it on the org or repos.
4. Create a read-only Linear API key (or an Atlassian API token).
5. Set the env vars from [`apps/reviewer/.env.example`](apps/reviewer/.env.example) and run `pnpm dlx vercel deploy --prod` from the repository root.

## Developing

Requires Node 24 and pnpm.

```sh
pnpm install
pnpm test        # unit tests for config, memory policy and wiki plugins
pnpm typecheck   # builds the packages, then typechecks everything including the agent
pnpm dev         # eve dev for the reviewer (needs a .env.local in apps/reviewer)
```

To test the Vercel Services routing locally, run `pnpm dlx vercel dev` from the repository root. See the deployment guide for credentials and local sandbox requirements.

eve is pinned to **0.71.3**: eve 0.72.0 and 0.72.1 fail to build any agent that mounts `@github-tools/eve-extension` ("Selected module binding has no compile or runtime usage"). Unpin once that's fixed upstream.

## License

[MIT](LICENSE)
