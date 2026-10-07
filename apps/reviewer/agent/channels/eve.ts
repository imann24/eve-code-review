import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

// HTTP/TUI access for development and for reaching a deployed instance from the eve CLI.
// Sessions from here carry no GitHub identity, so memory stays disabled and the reviewer can't
// write anything; it's for poking at the docs researcher and prompts. Reviews come from GitHub.
export default eveChannel({
  auth: [vercelOidc(), localDev()],
});
