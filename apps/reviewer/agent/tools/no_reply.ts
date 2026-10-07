import { noReply } from "eve/tools/no_reply";

// After submitting a review, the review is the whole answer. This lets the agent end the turn
// without the channel also posting its final message as a PR comment.
export default noReply();
