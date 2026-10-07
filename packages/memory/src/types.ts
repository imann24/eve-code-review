import type { MemoryProvider } from "eve/memory";

/** Memory slots this project declares. Each slot gets its own namespace and key prefix. */
export type MemorySlotName = "repo" | "org";

/**
 * The swap point for memory backends.
 *
 * An adapter wraps any eve {@link MemoryProvider} (AgentKit today; Supermemory, Arcana or a custom
 * Azure Redis provider later) and tells the policy layer which of its tools write, so the policy
 * can gate them without knowing provider-specific tool names.
 */
export interface MemoryAdapter {
  readonly id: string;
  /** Builds the provider for one slot. Must keep instances and slots in separate keyspaces. */
  createProvider(options: { readonly instanceId: string; readonly slot: MemorySlotName }): MemoryProvider;
  /** Unqualified tool names (as the provider returns them) that create, change or delete memory. */
  readonly writeTools: readonly string[];
}

/** JSON-serializable inputs to the write gate. eve snapshots these for replay. */
export interface WriteRules {
  readonly instanceId: string;
  /** Lowercase GitHub repository roles that count as maintainers. */
  readonly roles: readonly string[];
}

/** Session auth attributes, as eve exposes them on `ctx.session.auth.current.attributes`. */
export type AuthAttributes = Readonly<Record<string, string | readonly string[]>> | undefined;
