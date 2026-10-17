# Selected Project Company Removal

The Companies inventory now offers **Remove Selected** beside its selection controls. Review lists each selected company and its Company ID, including separate historical duplicate-name records. Explicit confirmation removes their project associations together. Tenant companies, employees, disabled memberships, invitations, grants and request history remain retained; the same Company IDs can be associated again later. This complements the existing [duplicate-name guard](company-name-guard.md), without consolidating old IDs.

## Runtime Contract

Tenancy owns current dependency reads and removal. `DELETE /api/projects/[projectId]/companies` accepts confirmed IDs and their reviewed association timestamps (1–1000 distinct records). The existing EXCLUSIVE lifecycle barrier precedes fresh session/project administration, writable project and recommissioning checks, including recorded replay. After every selected association stamp and dependency passes, one transaction removes only those `project_companies` rows and appends one `project.company_removed` administrative event per company. Events preserve the former association's actor/time and retained-company/history scope. Audit failure rolls the entire selection back.

Enabled project memberships block removal even if their tenant accounts are disabled. Pending, unexpired invitations and unrevoked company, independent Project Admin or project responsibility grants also block it. Any blocker or stale/missing association rejects the whole selection without partial effects. Resolve access through Personnel or the existing invitation/grant workflows, then deliberately reload and confirm again. This action supplies no permission to remove people or clear protected survey obligations automatically.

The UI uses the existing shared command owner and FrozenCommand: uncertain outcomes retain the exact body/key, prevent reload/discard and block sibling mutations. Definitive409 requires reload and new consent. Successful company changes refresh the Companies inventory and subcontractor choices. Identity's legacy company fallback now requires enabled project membership; a retained disabled membership cannot re-enable invitations after disassociation. No migration, tenant-company deletion, grant restoration, request rewrite or new visual tokens are required.

## Integration Files

Carry the functional enforcement and verification with the UI when the owner authorizes Alpha2 integration:

- [ProjectAdministration](../../../src/components/ui/project-administration.tsx): controlled company selection, removal review, dependencies, IDs and retained command protocol.
- [Admin workspace](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/workspace.tsx) and [Subcontractor Access](../../../src/app/(projects)/projects/[projectId]/(admin)/admin/subcontractor-access.tsx): refresh company choices after association changes.
- [Companies route](../../../src/app/api/projects/[projectId]/companies/route.ts): authenticated current read and atomic reviewed DELETE with exact retry.
- [Tenancy application](../../../src/modules/tenancy/application/project-administration.ts) and [company reader](../../../src/modules/tenancy/infrastructure/project-companies.reader.ts): current association/dependency checks and project-only effects.
- [Identity company access](../../../src/modules/identity/infrastructure/company-access.repository.ts): historical disabled memberships do not supply invitation eligibility.
- [Administrative evidence](../../../src/modules/audit/infrastructure/administrative-event.repository.ts) and [writer inventory](../../../audits/phase5-lifecycle-writers.json): typed event and lifecycle ownership.
- [PostgreSQL cases](../../../tests/beta/project-administration-postgres.ts) and [HTTP/browser acceptance](../../../tests/beta/company-removal-acceptance.mjs): scoped, stale, blocked, rollback, replay, concurrency and browser gates.

## Verification Boundary

The PostgreSQL runner uses owned rollback schemas. The focused HTTP/browser runner requires `SWR_ROLE_ACCESS=1`, an explicitly owned synthetic manifest, a different-schema retained-demo guard, loopback PostgreSQL127.0.0.1:15493/swr_team_isolated, its production origin/JWT and existing Playwright/Edge installation. The fixture/runtime preparation remains local; this is not a clean-clone seed command or permission to mutate retained data. Synthetic historical duplicate names are created only in the owned schema. The savepoint route harness advances the reassociation timestamp explicitly because its shared outer transaction fixes PostgreSQL NOW(); production HTTP independently verifies actual later-transaction stale consent.

Final receipts and local demo preservation are recorded in [sanitized evidence](../../../audits/alpha1-ui-redesign/company-removal-evidence.json). Existing design manifests and earlier receipts remain immutable. No push, merge or Alpha2 initialization is implied by the checkpoint.

Strict/unused typecheck, all584 unit tests, pinned production build, all30 actual PostgreSQL suites and41 focused production HTTP/browser checks pass. Independent design review returns **ship** at this narrow feature scope with no material fixes; four settled desktop/user/mobile/blocker captures were opened. The changed-target detector ran once and returned[]. Retained demo3124 runs the verified image with original environment/file volume; current protected-row digests match before/after refresh. Its existing Alex Rivera session shows the three selected legacy companies in removal review, with consent unchecked. No retained company was removed during verification.
