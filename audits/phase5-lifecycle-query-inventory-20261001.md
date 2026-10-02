# Phase5 lifecycle query inventory

Date: 2026-10-01. Branch: phase5, HEAD92e5b45894a949448aaf58200f8bddebec52c371. Read-only planning pass; runtime enforcement is not implemented or certified by this inventory.

## Search evidence

Command: rg -l 'project_memberships|tenant_memberships|deactivated_at|session_version' src, sorted.
Result:24 files. This is the direct SQL/name-reference set, not the entire indirect application-call graph. The implementation enforcement manifest must trace callers, transaction boundaries, protected request entry points and assignment writers. A file absent from this search is not automatically safe.

## Required coverage

Each assertion below is a required implementation test, not a passing existing test. Task numbers refer to docs/superpowers/plans/2026-10-01-scoped-account-offboarding.md.

| Direct consumer | Required integration | Named assertion to add |
| --- | --- | --- |
| src/app/api/ops/diagnostics/handler.ts | Task5 local scope before SQL aggregation; Task3 active session | diagnostics_query_is_project_partitioned |
| src/app/api/projects/[projectId]/members/route.ts | Tasks2/5 local capability and effective member eligibility; Task3 mutation barrier | local_members_do_not_include_disabled_assignment_candidates |
| src/app/api/projects/get-handler.ts | Task2 project discovery honors local disablement and independent admin grants | renewed_local_subject_discovers_only_remaining_projects |
| src/app/api/tickets/[ticketId]/attachments/handler.ts | Task2 direct membership access plus explicit Central IT exception; Task3 global session check | locally_disabled_subject_cannot_download_project_attachment |
| src/lib/access-administrator.ts | Task2 combine independent grant and legacy admin role with eligibility | disabled_grant_holder_loses_project_access |
| src/lib/auth.ts | Task3 current account/version/logout checks at protected entry and after lock waits | protected_request_rejects_disabled_and_old_version |
| src/lib/get-project-role.ts | Task2 actual operational role and effective access; no fabricated Manager | manager_and_admin_are_independent |
| src/lib/get-tenant-role.ts | Tasks2/3 current active eligible Central IT, tenant isolation | foreign_tenant_admin_has_no_authority |
| src/lib/survey-review-authority.ts | Tasks2/3 local access gating on authority and witness queries | disabled_reviewer_not_eligible_for_new_work |
| src/lib/ticket-visibility-clause.ts | Task2 access condition on visibility clauses with explicit support exception | disabled_local_member_cannot_list_project_tickets |
| src/modules/identity/infrastructure/company-access.repository.ts | Tasks2/3 same-tenant active invite/grant eligibility and coordinated writes | invitation_cannot_restore_disabled_access |
| src/modules/identity/infrastructure/user.repository.ts | Tasks1/3/4 account version/stamps and reset/registration coordination | reset_token_cannot_reactivate |
| src/modules/notification/infrastructure/index.ts | Tasks2/3 recipient eligibility and duty-recovery writer barriers | disabled_member_not_selected_or_notified |
| src/modules/tenancy/infrastructure/my-account.reader.ts | Task2 effective access in project-related account data | local_disable_hides_project_operational_details |
| src/modules/tenancy/infrastructure/protected-obligations.repository.ts | Tasks2/3 scoped blockers, distinct current witnesses, lock order | local_blockers_omit_other_project_duties |
| src/modules/tenancy/infrastructure/superintendent-areas.repository.ts | Tasks2/3 effective replacement eligibility and coordinated Area writes | area_assignment_waits_then_revalidates |
| src/modules/tenancy/infrastructure/superintendent-crews.repository.ts | Task2 Chief/Superintendent membership joins and live user checks include effective local access | disabled_chief_not_current_crew_witness |
| src/modules/tenancy/infrastructure/survey-staffing.repository.ts | Tasks2/3 staffing writes and active scoped replacements | staffing_writer_cannot_assign_after_disable |
| src/modules/tenancy/infrastructure/survey-teams.repository.ts | Tasks2/3 team and team-lead eligibility, duty writer barrier | team_lead_assignment_race_is_serialized |
| src/modules/tenancy/infrastructure/survey-workforce.repository.ts | Tasks2/3 actual Manager continuity and role writes independent of admin grants | last_actual_manager_refused |
| src/modules/tenancy/infrastructure/tenancy.repository.ts | Tasks2/3/5 membership, tenant authority and company/project mutations | last_admin_demotion_and_disable_race |
| src/modules/ticket/application/draft-access.ts | Task2 explicit retained draft access policy after local disable | disabled_member_draft_remains_intact_but_inaccessible |
| src/modules/ticket/application/recover-draft.ts | Tasks2/3 effective authorized admin and transaction/session checks, retained immutable origin | recovery_does_not_bypass_local_access_disable |
| src/modules/ticket/infrastructure/ticket.repository.ts | Tasks2/3 ticket visibility/assignment/current role SQL and workflow mutations | ticket_assignment_race_is_serialized |

## Confirmed bypass-sensitive paths

The attachment handler and draft-access helper query project_memberships directly with current user deactivated_at/session_version predicates. Neither predicate expresses the new project access stamp; changing getProjectRole alone cannot close local access.

superintendent-crews.repository joins Chief and Superintendent memberships to nondeactivated users. Its witness queries need project access eligibility alongside global account eligibility.

my-account.reader checks global user activity and reads project Area/crew links. Local disablement must govern which selected-project operational details appear after session renewal; historical records stay stored.

The notification worker accepts a DbClient and calls timeout/vacancy/orphan recovery functions through its repository. The worker cycle itself does not establish a tenant-specific transaction barrier. Trace each underlying assignment/unlock operation and coordinate one tenant transaction before its row locks; do not add a global multi-tenant lock around transport delivery.

Tenant membership upsert/removal currently receives a scalar actorRole and optionally bumps session_version through its repository. New continuity checks need fresh authority inside the exclusive barrier, not reliance on that earlier scalar.

## Existing retry contract correction

src/lib/idempotency.ts uses api_idempotency, not api_idempotency_ledger. requireIdempotencyKey reads Idempotency-Key, trims it and accepts1–128 characters. executeIdempotentHttpMutation scopes records by tenantId, actorId, endpoint and key and hashes the request body. New HTTP JSON bodies must not duplicate the key; the internal application command can carry the parsed header.

Authorize before calling the replay helper. Acquire the tenant lifecycle barrier before ledger row locks. A successful historic response does not authorize a now-disabled/demoted caller.

## Remaining gate

The plan now names all24 direct consumers. Indirect caller coverage, new tests, SQL constraints/races, endpoint behavior, UI and migration acceptance remain execution work after plan review. Current source is unchanged; this inventory is neither a security certification nor proof that disabled project access is enforced.
