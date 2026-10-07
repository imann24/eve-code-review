/**
 * Session auth attribute keys. The first group comes from eve's `defaultGitHubAuth()`, which
 * copies verified webhook metadata into `auth.current.attributes`. `repoRole` is added by this
 * project's channel hooks after asking GitHub for the sender's role on the repository.
 *
 * Keeping the names in one place means the channel (which writes them) and the memory policy and
 * approval gate (which read them) can't drift apart.
 */
export const AUTH_ATTRIBUTES = {
  repository: "repository",
  userLogin: "user_login",
  userType: "user_type",
  pullRequestNumber: "pull_request_number",
  /** GitHub repository role of the sender: `admin`, `maintain`, `write`, `triage`, `read`, or `none`. */
  repoRole: "prbot_repo_role",
  /** Instance that dispatched the turn. Lets policies refuse a session that crossed instances. */
  instanceId: "prbot_instance_id",
} as const;
