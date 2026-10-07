import { getInstanceConfig } from "@eve-code-review/config";
import { wikiConnectionFor } from "@eve-code-review/wiki";
import { defineDynamic } from "eve/connections";

// One wiki per instance (PRBOT_WIKI_PROVIDER), resolved per session. The filename names the
// connection `wiki`. Returns null, so no connection, when the instance has no wiki.
export default defineDynamic({
  events: {
    "session.started": () => wikiConnectionFor(getInstanceConfig()),
  },
});
