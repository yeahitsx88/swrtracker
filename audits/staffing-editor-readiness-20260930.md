# Explicit Manager staffing editor: implementation readiness

Role: AUDITOR. Inspected phase5 checkpoint `0803d5eb8da8d529560ec82316cac2d8fcc8b128` on 2026-09-30. This is a source-contract gap assessment, not a security scan, runtime acceptance, or authorization to broaden staffing powers.

## Verified contracts and gaps

- `src/modules/tenancy/application/save-survey-staffing.ts` accepts up to 100 selected Instrument Men and adds missing links. It never removes a roster member omitted from `instrumentManIds`. Consequently the existing POST is additive, not a complete-roster replacement command. An editor must not advertise removal or imply that submitting a filtered page replaces the roster.
- That input and `src/app/api/projects/[projectId]/survey/staffing/handler.ts` carry no expected staffing snapshot/version. The project lock serializes writes, but does not compare a user's displayed prior state with the current state. `setReportingLink` can replace the current Superintendent link; serialization alone cannot reject an obsolete form.
- The POST handler does not consume an Idempotency-Key or invoke the existing ledger. A repeated identical current-state save may be a no-op, but that is not an authorization-checked replay contract and does not cover an intervening staffing change.
- The use case rejects an existing Chief Area different from the submitted Area and another Chief's Instrument Man. It provides no detach/cleanup command. Do not bypass these guards to implement reassignment or role removal.
- `read-survey-staffing.ts` and the repository return at most 100 assigned Areas with total/truncation, and separately paginated/searchable Instrument Men with matching and full totals. These reads are deliberately bounded and cannot be treated as a complete editable selection without checking completeness.
- The existing Team Management UI and client implement organizational teams and fixed-role changes, not this explicit Chief/Area/Superintendent/IM editor. Named-team membership remains separate from operational authority.

## Next authorized implementation point

Before exposing operational saves, add a displayed-state concurrency contract and authorization-checked idempotency within the existing staffing resource, with transaction/audit rollback and conflicting-write tests. Preserve the additive command's existing meaning unless an explicitly specified replacement/removal operation is introduced. Retain complete-selection safeguards and expose protected obligations honestly. Do not infer individual Sabine reporting links or automatically clear responsibility/acting grants.

The owner's menu recording introduces a separate unresolved choice between the earlier desktop push column and a full-height overlay. No menu, staffing API, permission, preview, database, or imported request was changed during this assessment. Current baseline evidence remains 356 passing tests and a passing nonincremental TypeScript check; those checks do not prove the unimplemented editor complete.

Subsequent owner answer: the overlay recommendation was approved (Decision 16). That resolves the menu gate only; the staffing readiness gaps above remain unchanged.

2026-09-30 follow-up: Decision17 subsequently approved the existing additive API's snapshot/idempotency extension. Batches56–57 implement and verify that prerequisite and its Manager editor; the earlier missing-contract observations now describe the pre-increment state. Additive preservation and complete-selection safeguards remain binding. Removal/reassignment/obligation-cleanup gaps are not closed; see staffing-cleanup-gate-20260930.md. This follow-up is not authorization to infer Sabine links or expand removal permissions.
