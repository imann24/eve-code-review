# Notes for coding agents

- The eve agent lives in `apps/reviewer/agent/`. eve's own docs ship with the package: `apps/reviewer/node_modules/eve/docs/README.md` maps tasks to pages. Read the relevant page before changing channels, tools, connections, memory or subagents.
- Shared logic belongs in `packages/*`, built to `dist/` with `tsc`, and imported by package name. Agent files should stay thin.
- Never read instance config at module top level in agent files; call `getInstanceConfig()` inside hooks, resolvers and callbacks so `eve build` works without env.
- Callbacks handed to eve from packages (tool `execute`, approval policies) must be durable: use `defineDurableCallback` with a JSON-only closure.
- eve is pinned to 0.71.3; see the README before upgrading.
- Verify with `pnpm test` and `pnpm typecheck`. To check eve discovery, run `pnpm exec eve build` in `apps/reviewer` (Node 24).
