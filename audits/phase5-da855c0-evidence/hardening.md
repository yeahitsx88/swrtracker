# Security Hardening Review: Phase 5 da855c0

## Evidence Basis

I reproduced the inactive crew file disclosure (FILE-001), out-of-Area direct assignment (AUTH-001), teammate cancellation (REQ-001), and request existence signal (AUTH-002) in the synthetic duplicate, and inspected their enforcing source. These controls already have clear owners: the shared visibility resolver, creation use case, workflow use case, and ticket route context.

## Constraints

We must preserve the original checkpoint, document behavior before implementation, and avoid broad architecture changes without demonstrating necessity. Production configuration and concurrent revocation remain unverified; there is no measured performance budget.

## Opportunity Portfolio

No structural opportunity qualified for implementation at this stage. The failures are specific inconsistencies in an existing server-enforced model. We can repair the shared inactive-link predicate and the two mutation guards without introducing a new service or replacing the membership model. The evidence does not show that the current architecture is incapable of enforcing isolation.

## Recommendation Summary

I recommend focused local remediation first. We should require active crew relationships wherever inherited visibility is resolved, check Superintendent Area authority before direct work creation, require exact Instrument Man assignment for field disposition, and normalize inaccessible request responses. The shared visibility change affects detail, lists, history and file consumers, so its regression scope is broader than a one-route patch even though its implementation can remain small.

We retain the current data model and deployment shape. Expected query cost is one active-state predicate and, for creation, a scoped authority lookup; this is source-derived, not benchmarked. No additional process or persistent cache is proposed. Transaction-time checks may increase lock duration, so we should compare mutation latency and concurrent revoke behavior on the synthetic workload before rollout. File root persistence and IT workflow/audit access still need explicit deployment and product decisions; these are not solved by the authorization patches.

We should keep the existing API contract where it is safe, introduce the fixes in small reviewable changes, and replay the stored matrix after each shared-control change. Rollback must not knowingly restore a data-disclosing predicate; if a fix blocks legitimate reads, temporarily narrow affected capabilities while correcting the scope. No finding is closed by this recommendation.

## Next Decisions

The backlog in the requested assessment brief defines acceptance and dependencies. We can defer structural alternatives unless repeated independent callers still omit required checks after the focused corrections, or concurrency testing demonstrates that current transaction boundaries cannot enforce revocation. No source implementation is authorized by this portfolio.
