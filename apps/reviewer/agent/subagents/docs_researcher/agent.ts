import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Finds the internal docs that apply to a pull request: the ticket or spec it implements and the team conventions for the code it touches. Returns short excerpts with links.",
  model: "anthropic/claude-sonnet-5.5",
});
