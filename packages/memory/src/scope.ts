import {
  AUTH_ATTRIBUTES,
  getInstanceConfig,
  isRepoInScope,
  parseRepositoryFullName,
  type InstanceConfig,
} from "@eve-code-review/config";
import type { MemoryScopeContext } from "eve/memory";

function attribute(ctx: Pick<MemoryScopeContext, "session">, key: string): string | undefined {
  const value = ctx.session.auth.current?.attributes[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Resolves the repo this turn is about from the verified GitHub webhook metadata on the session,
 * or `null` (which disables memory for the operation) when anything doesn't line up: no GitHub
 * auth, a turn another instance dispatched, or a repo outside this instance's scope.
 */
function scopedRepo(config: InstanceConfig, ctx: Pick<MemoryScopeContext, "session">) {
  if (attribute(ctx, AUTH_ATTRIBUTES.instanceId) !== config.instanceId) return null;
  const ref = parseRepositoryFullName(attribute(ctx, AUTH_ATTRIBUTES.repository));
  if (ref === null || !isRepoInScope(config, ref)) return null;
  return { owner: ref.owner.toLowerCase(), repo: ref.repo.toLowerCase() };
}

/** Scope for the `repo` slot: `[owner, repo]`. */
export function repoMemoryScope(
  ctx: Pick<MemoryScopeContext, "session">,
  config: InstanceConfig = getInstanceConfig(),
): readonly string[] | null {
  const ref = scopedRepo(config, ctx);
  return ref === null ? null : [ref.owner, ref.repo];
}

/** Scope for the `org` slot: `[owner]`, or `null` when the instance has the org slot turned off. */
export function orgMemoryScope(
  ctx: Pick<MemoryScopeContext, "session">,
  config: InstanceConfig = getInstanceConfig(),
): readonly string[] | null {
  if (!config.memory.orgSlot) return null;
  const ref = scopedRepo(config, ctx);
  return ref === null ? null : [ref.owner];
}
