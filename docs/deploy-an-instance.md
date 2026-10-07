# Deploy an instance

One instance reviews repositories belonging to one GitHub organization or personal account, optionally restricted to a list of repo names. Repeat this checklist per instance. Pick an instance ID using lowercase letters, digits and hyphens, for example `imann24-test`.

## 1. Memory database

Create a new Upstash Redis database for this instance only. Copy its REST URL and token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 2. Vercel project

Create a Vercel project from this repository and set its root directory to the **repository root** (leave the dashboard Root Directory field empty), with Node.js 24. If this project previously used `apps/reviewer` as its root, clear that setting. Run these commands from the repository root:

```sh
pnpm dlx vercel link --project <vercel-project-name>
```

The root [`vercel.json`](../vercel.json) owns the Services configuration:

- `reviewer` is the only deployable service, rooted at `apps/reviewer`. Its build command runs the existing app build script, which builds all shared packages before `eve build`.
- `/` serves eve's existing JSON health check at `/eve/v1/health` without a browser redirect. The service route also transforms the request path so eve receives the health endpoint path. This reports agent runtime readiness; it does not test GitHub, Redis, or wiki credentials.
- Public requests under `/eve/v1` go to the reviewer, including `/eve/v1/github` (Connect webhooks), `/eve/v1/health`, sessions, streams and callbacks. The original request path is preserved; there is no `/reviewer` prefix to add to clients or Connect.
- `/.well-known/workflow/*` also routes to the reviewer for eve's generated Workflow endpoints. Other public paths have no matching service rewrite.
- The existing eve OIDC and GitHub webhook authentication still apply to routed requests.
- `config`, `memory`, and `wiki` are imported workspace libraries with no HTTP entrypoints. They are not separate public or internal services. There are no calls between Vercel services and therefore no service bindings or bound URL variables. Upstash, GitHub/Connect, Linear and Confluence remain external integrations with their existing configuration.

Build/runtime overrides belong to the service, not the top level. See [Vercel Services](https://vercel.com/docs/services) and [routing](https://vercel.com/docs/services/routing).

## 3. GitHub App

The channel needs a GitHub App created through Vercel Connect. Run the guided setup from the agent directory and select the **same Vercel project** linked at the repository root. It also writes its own `agent/channels/github.ts`, so preserve any local edits and restore this project's channel afterwards. Starting from the repository root:

```sh
cd apps/reviewer
pnpm exec eve add channel/github
git checkout -- agent/channels/github.ts   # keep this project's channel
cd ../..
```

Note the connector UID the setup printed. If it isn't `github/prbot-<instance id>`, set `PRBOT_GITHUB_CONNECTOR` to it. Set `PRBOT_GITHUB_BOT_NAME` to the App's slug (what people will @mention).

In the GitHub App settings, make sure it has:

- **Repository permissions:** Pull requests (read and write), Issues (read and write; PR timeline comments use the Issues API), Contents (read), Metadata (read), Checks (read)
- **Events:** Pull request, Issue comment, Pull request review comment

Install the App on the organization or personal account (or only the repos in `PRBOT_GITHUB_REPOS`) from the Vercel Connect dashboard. Confirm its trigger destination is `/eve/v1/github` on this project's deployment.

## 4. Wiki credentials

**Linear:** in the Linear workspace this instance reviews, go to Settings → Account → Security & Access, create an API key with only the Read permission, and set `LINEAR_API_KEY` and `PRBOT_LINEAR_TEAMS` (team keys, e.g. `ENG`). For a small team, a personal key from an admin works; it can see what that person can see, so the team list does real work.

**Confluence:** an org admin enables API token authentication for the Rovo MCP server (Atlassian Administration → Rovo → Rovo MCP server → Authentication). Create an API token for an account that can see only the spaces in `PRBOT_CONFLUENCE_SPACES`; a dedicated bot user is best. Set `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, and ideally `PRBOT_CONFLUENCE_CLOUD_ID`.

## 5. Environment and deploy

Use [`apps/reviewer/.env.example`](../apps/reviewer/.env.example) to configure the Vercel project's Production and Development environment variables (mark secrets as sensitive). Omit unused optional credentials. For a first personal-repo test, use `PRBOT_GITHUB_OWNER=imann24`, a single repo name in `PRBOT_GITHUB_REPOS`, `PRBOT_APPROVE_MODE=auto`, and `PRBOT_WIKI_PROVIDER=none`. Automatic approval is the default; existing deployments with an explicit `hitl` or `never` value must change it to `auto` to approve without confirmation. The App needs Pull requests write permission to submit approvals and Issues write permission for the start comment.

Deploy the complete Services project from the repository root:

```sh
pnpm dlx vercel deploy --prod
```

For local Services testing, also run from the repository root:

```sh
pnpm build
pnpm dlx vercel dev
```

`vercel dev` loads the linked project's development environment and runs its services together. Use `--local` to test without linking, supplying the required credentials yourself. This does not remove eve's sandbox requirements: the default local provider requires a working microsandbox installation, while hosted builds use Vercel Sandbox. A local missing-sandbox error is not a successful deployment check. The direct `pnpm dev` agent workflow still uses `apps/reviewer/.env.local`.

## 6. Smoke test

1. Open a small, clean PR in a repo the App is installed on. The bot should immediately post `starting review...` in the PR feed, then submit one `APPROVE` review in `auto` mode. A PR with blockers should get `REQUEST_CHANGES` instead.
2. Comment `@<bot-name> we allow console.log in scripts/` as a maintainer. It should confirm it saved the rule. The same comment from someone with only write access should be refused.
3. In `hitl` mode, make a clean PR. The bot should ask in the thread for a maintainer to confirm its approval; confirm from a different maintainer account.

## Tearing an instance down

Delete the Vercel project, uninstall and delete the GitHub App, delete the Upstash database, and revoke the wiki credentials. Nothing is shared with other instances, so nothing else needs cleaning up.
