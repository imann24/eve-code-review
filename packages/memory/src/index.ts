import { getInstanceConfig, type InstanceConfig } from "@eve-code-review/config";
import type { MemoryProvider } from "eve/memory";
import { agentkitAdapter } from "./adapters/agentkit.js";
import { withReviewPolicy } from "./policy.js";
import type { MemoryAdapter, MemorySlotName } from "./types.js";

/**
 * Available backends, keyed by `PRBOT_MEMORY_BACKEND`. To add one: implement {@link MemoryAdapter},
 * register it here, and add its name to the config schema's enum.
 */
export const memoryAdapters: Readonly<Record<InstanceConfig["memory"]["backend"], MemoryAdapter>> = {
  agentkit: agentkitAdapter,
};

/** Defers choosing the adapter until runtime, when the instance env is available. */
const configuredAdapter: MemoryAdapter = {
  get id() {
    return memoryAdapters[getInstanceConfig().memory.backend].id;
  },
  get writeTools() {
    return memoryAdapters[getInstanceConfig().memory.backend].writeTools;
  },
  createProvider: (options) => memoryAdapters[getInstanceConfig().memory.backend].createProvider(options),
};

/** The memory provider for one slot of this instance, with the review policy applied. */
export function reviewMemoryProvider(slot: MemorySlotName): MemoryProvider {
  return withReviewPolicy({ slot, getConfig: getInstanceConfig, adapter: configuredAdapter });
}

/** eve memory namespace for a slot: `prbot:<instanceId>:<slot>`. */
export function memoryNamespace(slot: MemorySlotName): string {
  return `${getInstanceConfig().memory.namespace}:${slot}`;
}

export { agentkitAdapter, agentkitKeyspace } from "./adapters/agentkit.js";
export { orgMemoryScope, repoMemoryScope } from "./scope.js";
export { decideWrite, withReviewPolicy, writeApprovalStatus, type WriteDecision } from "./policy.js";
export type { AuthAttributes, MemoryAdapter, MemorySlotName, WriteRules } from "./types.js";
