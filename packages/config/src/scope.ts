import type { InstanceConfig } from "./config.js";

export interface RepoRef {
  readonly owner: string;
  readonly repo: string;
}

/** Parses `owner/name` (the GitHub channel's `repository` auth attribute). */
export function parseRepositoryFullName(fullName: string | undefined): RepoRef | null {
  if (fullName === undefined) return null;
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(fullName.trim());
  if (match === null) return null;
  return { owner: match[1]!, repo: match[2]! };
}

/**
 * True when this instance is allowed to act on the repo. GitHub owner and repo names are
 * case-insensitive, so the comparison is too.
 */
export function isRepoInScope(config: InstanceConfig, ref: RepoRef): boolean {
  if (ref.owner.toLowerCase() !== config.github.owner.toLowerCase()) return false;
  if (config.github.repos === "*") return true;
  const repo = ref.repo.toLowerCase();
  return config.github.repos.some((allowed) => allowed.toLowerCase() === repo);
}

/**
 * True when a comment summons the bot with `@<botName>`. Matches a whole handle, so `@acme-reviewer`
 * doesn't fire for `@acme-reviewer-2` or `email@acme-reviewer.dev`.
 */
export function mentionsBot(body: string, botName: string): boolean {
  const escaped = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w@.-])@${escaped}(?![\\w-])`, "i").test(body);
}

/** True when a GitHub repository role (e.g. `maintain`, `admin`) counts as a maintainer here. */
export function isMaintainerRole(config: InstanceConfig, role: string | undefined): boolean {
  if (role === undefined) return false;
  return config.maintainers.roles.includes(role.toLowerCase());
}
