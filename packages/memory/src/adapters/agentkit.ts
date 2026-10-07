import { redisMemory } from "@upstash/agentkit-eve/memory";
import type { MemoryAdapter, MemorySlotName } from "../types.js";

/** Redis key prefix and search index for one instance's slot. Exported for tests and ops scripts. */
export function agentkitKeyspace(instanceId: string, slot: MemorySlotName) {
  return {
    prefix: `prbot:${instanceId}:${slot}`,
    indexName: `prbot_${instanceId.replaceAll("-", "_")}_${slot}`,
  };
}

/**
 * Upstash AgentKit's `redisMemory()` provider.
 *
 * - One Upstash database per instance is the isolation boundary (each Vercel project points
 *   `UPSTASH_REDIS_REST_URL` at its own database). The per-instance prefix and index are a second
 *   layer, so a misconfigured shared database still can't mix instances or slots.
 * - `rememberMessages: false` turns off automatic capture. Webhook payloads and anyone's comments
 *   arrive as "user" messages, so only explicit, maintainer-gated saves are stored.
 */
export const agentkitAdapter: MemoryAdapter = {
  id: "agentkit",
  writeTools: ["save_memory", "forget_memory"],
  createProvider({ instanceId, slot }) {
    return redisMemory({
      ...agentkitKeyspace(instanceId, slot),
      rememberMessages: false,
      topK: 5,
    });
  },
};
