import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5.5",
  // The reviewer delegates wiki research to its declared docs-researcher subagent. It doesn't need
  // the built-in tool for spawning copies of itself.
  tool: false,
});
