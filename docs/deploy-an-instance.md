# Deploy an instance

One instance reviews one GitHub org (default) or a set of repos in it. Repeat this checklist per instance. Pick the instance ID first: `<org>` for per-org, `<org>-<repo>` for per-repo (lowercase, digits and hyphens).

## 1. Memory database

Create a new Upstash Redis database for this instance only. Copy its REST URL and token into `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

## 2. Vercel project

Create a Vercel project from this repository and set its root directory to `apps/reviewer`. Then link it locally:

```sh
cd apps/reviewer
pnpm exec eve link --project <vercel-project-name>
```

## 3. GitHub App

The channel needs a GitHub App created through Vercel Connect. eve's guided setup does this in one step, but it also writes its own `agent/channels/github.ts`, so restore ours afterwards:

```sh
cd apps/reviewer
pnpm exec eve add channel/github
git checkout -- agent/channels/github.ts   # keep this project's channel
```

Note the connector UID the setup printed. If it isn't `github/prbot-<instance id>`, set `PRBOT_GITHUB_CONNECTOR` to it. Set `PRBOT_GITHUB_BOT_NAME` to the App's slug (what people will @mention).

In the GitHub App settings, make sure it has:

- **Repository permissions:** Pull requests (read and write), Issues (read and write; PR timeline comments use the Issues API), Contents (read), Metadata (read), Checks (read)
- **Events:** Pull request, Issue comment, Pull request review comment

Install the App on the org (or only the repos in `PRBOT_GITHUB_REPOS`) from the Vercel Connect dashboard.

## 4. Wiki credentials

**Linear:** in the Linear workspace this instance reviews, go to Settings → Account → Security & Access, create an API key with only the Read permission, and set `LINEAR_API_KEY` and `PRBOT_LINEAR_TEAMS` (team keys, e.g. `ENG`). For a small team, a personal key from an admin works; it can see what that person can see, so the team list does real work.

**Confluence:** an org admin enables API token authentication for the Rovo MCP server (Atlassian Administration → Rovo → Rovo MCP server → Authentication). Create an API token for an account that can see only the spaces in `PRBOT_CONFLUENCE_SPACES`; a dedicated bot user is best. Set `ATLASSIAN_EMAIL`, `ATLASSIAN_API_TOKEN`, and ideally `PRBOT_CONFLUENCE_CLOUD_ID`.

## 5. Environment and deploy

Copy [`apps/reviewer/.env.example`](../apps/reviewer/.env.example), fill it in, and add every variable to the Vercel project (mark secrets as sensitive). Then:

```sh
cd apps/reviewer
pnpm exec eve deploy
```

## 6. Smoke test

1. Open a small PR in a repo the App is installed on. The bot should react with 👀 and post one review.
2. Comment `@<bot-name> we allow console.log in scripts/` as a maintainer. It should confirm it saved the rule. The same comment from someone with only write access should be refused.
3. In `hitl` mode, make a clean PR. The bot should ask in the thread for a maintainer to confirm its approval; confirm from a different maintainer account.

## Tearing an instance down

Delete the Vercel project, uninstall and delete the GitHub App, delete the Upstash database, and revoke the wiki credentials. Nothing is shared with other instances, so nothing else needs cleaning up.
