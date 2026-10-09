# Current workflow invariants

Authority: [requirements](../REQUIREMENTS_ADCQ-260923-001.md) and approved [decisions](../worklogs/LEAD_DECISION_LOG.md). Read current policy in src/modules/workflow/domain/ and ticket use cases; implementation does not itself prove approval.

- Fixed operational roles and independent Project Admin grants are separate. Central/Tenant IT does not imply request visibility or Survey approval.
- Tenant/project scope and company/actor visibility apply throughout. Company visibility does not permit editing another requester's draft.
- Actual Survey Manager and approved Area responsibility grants control review. Named teams, staffing, reporting and Area assignments are distinct; do not silently grant one through another.
- Drafts have no number. First submission numbers the request; correction/resubmission retains identity/number/first-submitted history. Current approved Need-By/priority decisions supersede old examples.
- Fresh session/membership/policy, expected state/version, lifecycle barriers and atomic append-only evidence control transitions. Replay does not bypass current authority/visibility.
- Draft deletion is soft. Recovery within 30 days requires an actual Project Admin grant; Tenant Admin alone is insufficient.
- Tenant disabling and project-access removal are separate decisions. Other-project duties/access and historical assignments survive local removal. Protected duties/last eligible authority require approved resolution.
- Uncertain responses retain exact body/key. Definitive409 requires reload and renewed consent.
- Archived history remains retained. Guarded recommissioning requires explicit Central IT preparation and fresh exact readiness review (Decision 50). Preparation blocks ordinary work; no bypass activation or wholesale replacement is approved. Decision54 separately authorizes Central preparation cancellation with reviewed immutable start/completion evidence and completion-only current-authority paths.

Read current approved cancellation chains and corresponding workflow/ticket tests. Decision54 governs preparation cancellation; ordinary activation/archive cannot substitute for the separately approved operation. See current D1_D8_RECONCILIATION.md and CLAUDE.md Section12 for recorded implementation and event contracts.
