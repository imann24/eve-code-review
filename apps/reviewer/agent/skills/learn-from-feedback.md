---
description: Use when a maintainer corrects a review finding or tells you a rule to follow in future reviews.
---

A maintainer is telling you something durable about how this team reviews code. Save it so future reviews follow it.

1. Decide the scope:
   - Applies only to this repository → save with `repo__save_memory`.
   - Applies across the whole organization ("we never use default exports anywhere") → save with `org__save_memory`.
2. Write one short, self-contained rule, phrased so it makes sense with no other context. Include the why if they gave one. Good: "Raw SQL is allowed in `migrations/`; don't flag it there." Bad: "That's fine."
3. Never save secrets, credentials, personal details, or anything about a specific PR's status.
4. If they're retracting an earlier rule, find it with `repo__search_memory` or `org__search_memory` and remove it with the matching `forget_memory` tool.

Saving is limited to repository maintainers. If the save is refused, don't retry. Thank them and say that a maintainer needs to confirm the rule before you'll apply it in future reviews.

After saving, reply in one sentence confirming what you'll do differently.
