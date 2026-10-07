import { AUTH_ATTRIBUTES, type InstanceConfig } from "@eve-code-review/config";
import type { MemoryProvider, MemoryToolDefinition, MemoryToolSet } from "eve/memory";
import { defineDurableCallback, defineTool, type ToolDefinition } from "eve/tools";
import type { ApprovalContext, ApprovalStatus } from "eve/tools/approval";
import type { AuthAttributes, MemoryAdapter, MemorySlotName, WriteRules } from "./types.js";

export type WriteDecision =
  | { readonly allowed: true; readonly login: string; readonly role: string; readonly repository: string }
  | { readonly allowed: false; readonly reason: string };

function attribute(attributes: AuthAttributes, key: string): string | undefined {
  const value = attributes?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Decides whether the person behind the current turn may write memory: a maintainer of the
 * repository (per the instance's roles), on a turn this instance dispatched. The role comes from
 * GitHub and is stamped onto the session by the channel hook; nothing the model says changes it.
 */
export function decideWrite(rules: WriteRules, attributes: AuthAttributes): WriteDecision {
  if (attributes === undefined) {
    return { allowed: false, reason: "No authenticated GitHub user on this turn." };
  }
  if (attribute(attributes, AUTH_ATTRIBUTES.instanceId) !== rules.instanceId) {
    return { allowed: false, reason: "This turn was not dispatched by this instance." };
  }
  const login = attribute(attributes, AUTH_ATTRIBUTES.userLogin);
  const role = attribute(attributes, AUTH_ATTRIBUTES.repoRole);
  const repository = attribute(attributes, AUTH_ATTRIBUTES.repository);
  if (login === undefined || repository === undefined) {
    return { allowed: false, reason: "The turn is missing GitHub user or repository details." };
  }
  if (role === undefined || !rules.roles.includes(role.toLowerCase())) {
    return {
      allowed: false,
      reason: `@${login} is not a maintainer of ${repository} (role: ${role ?? "unknown"}). Only ${rules.roles.join(" or ")} can teach the reviewer.`,
    };
  }
  return { allowed: true, login, role, repository };
}

/** Approval policy for memory write tools: run for maintainers, deny (with a reason) for everyone else. */
export function writeApprovalStatus(rules: WriteRules, ctx: Pick<ApprovalContext, "session">): ApprovalStatus {
  const decision = decideWrite(rules, ctx.session.auth.current?.attributes);
  return decision.allowed ? "not-applicable" : { type: "denied", reason: decision.reason };
}

function rulesFor(config: InstanceConfig): WriteRules {
  return { instanceId: config.instanceId, roles: [...config.maintainers.roles] };
}

/**
 * Re-defines a provider's write tool with this project's approval gate. The provider's own
 * `execute` and schemas are reused untouched (they already carry eve's durable-callback metadata);
 * only the approval policy is added, as a durable callback whose closure is plain JSON.
 */
function gateWriteTool(tool: MemoryToolDefinition, rules: WriteRules): MemoryToolDefinition {
  const approval = defineDurableCallback({
    closure: { instanceId: rules.instanceId, roles: [...rules.roles] },
    callback: (closure, ctx: ApprovalContext) => writeApprovalStatus(closure, ctx),
  });
  const gated = defineTool({
    ...(tool as unknown as ToolDefinition),
    description: `${tool.description} Only maintainers of the repository can do this; requests from anyone else are refused.`,
    approval,
  } as ToolDefinition);
  return gated as unknown as MemoryToolDefinition;
}

/**
 * Wraps an adapter's provider with this project's memory policy:
 *
 * - write tools are gated on maintainer role through eve's approval mechanism, so the gate
 *   survives replay and redeploys like any other approval;
 * - reads pass through, because eve already scopes recall to this instance's namespace and the
 *   current repo or org;
 * - the inner provider is built lazily, so agent modules can load without runtime env.
 */
export function withReviewPolicy(options: {
  readonly adapter: MemoryAdapter;
  readonly slot: MemorySlotName;
  readonly getConfig: () => InstanceConfig;
}): MemoryProvider {
  const { adapter, slot, getConfig } = options;
  let inner: MemoryProvider | undefined;
  const provider = (): MemoryProvider => {
    inner ??= adapter.createProvider({ instanceId: getConfig().instanceId, slot });
    return inner;
  };

  return {
    recall: {
      "turn.started": (ctx) => provider().recall["turn.started"](ctx),
      "compaction.completed": (ctx) => provider().recall["compaction.completed"]?.(ctx),
    },
    capture: {
      "turn.completed": (ctx) => provider().capture?.["turn.completed"]?.(ctx),
      "compaction.requested": (ctx) => provider().capture?.["compaction.requested"]?.(ctx),
    },
    async tools(ctx) {
      const tools = await provider().tools?.(ctx);
      if (tools === null || tools === undefined) return null;
      const rules = rulesFor(getConfig());
      const writeTools = new Set(adapter.writeTools);
      const gated: Record<string, MemoryToolDefinition> = {};
      for (const [name, tool] of Object.entries(tools)) {
        gated[name] = writeTools.has(name) ? gateWriteTool(tool, rules) : tool;
      }
      return gated satisfies MemoryToolSet;
    },
  };
}
