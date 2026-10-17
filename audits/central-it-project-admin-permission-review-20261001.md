# Central IT and Project Admin permission review

Date: 2026-10-01. Status: revised design accepted for implementation planning (Decision33); concrete plan pending owner review.
Branch: phase5 at 92e5b45894a949448aaf58200f8bddebec52c371, freshly fetched equal to origin/phase5. No runtime permissions have changed.

The owner approved offboarding policy decisions 2–5, expanded eligible actors to Central IT or Project Admin, requested a project-wide review of Central IT-only permissions, and confirmed that one person may also be Survey Manager. Either authorized administrator can act independently; this is not a requirement for two different people or two approvals. The owner selected own-project scope: local disablement flags existing Central IT for review and any tenant-wide disablement that may be needed. Project Admin does not receive tenant-wide powers.

## Current implementation inventory

This inventory covers authorization checks in all src TypeScript/TSX files, the corresponding application functions, role resolvers, SQL membership model, navigation/contracts, relevant identity/tenancy tests, and current product/owner documentation. A TENANT_ADMIN match is not necessarily an exclusive permission: some are an already-supported alternative, a role label, an audit witness, or a notification recipient.

| Capability | Runtime evidence | Current boundary | Requested revision |
| --- | --- | --- | --- |
| Add or replace project member role | POST /api/projects/[projectId]/members; tenancy/application/add-project-member.ts | TENANT_ADMIN only; repository checks tenant and archive status. GET already admits Project Admin and Manager. | Include Project Admin; require current authority for affected project. Preserve guarded staffing/continuity rules and separate administrative grants. |
| Add/remove priority whitelist email | POST/DELETE /api/projects/[projectId]/whitelist; application/whitelist.ts | TENANT_ADMIN only in both route and application. | Include Project Admin for the affected project, preserving scope, archive and audit rules. |
| Archive project | POST /api/projects/[projectId]/archive; application/archive-project.ts | TENANT_ADMIN only; ACTIVE state required. | Include Project Admin for the affected project; keep terminal archive semantics and explicit confirmation. |
| Create company | POST /api/companies; application/create-company.ts | TENANT_ADMIN only; company is tenant-wide, with no project ownership column. | Provide Project Admin company registration in an explicit administered-project context with a scoped association; no change to other projects or tenant company ownership. This requires a separate association contract because the current schema has no project-company ownership. Tenant-wide company administration stays Central IT. |
| Create project | POST /api/projects; application/create-project.ts | TENANT_ADMIN only; creates SETUP project, optionally from shared template. | Tenant-wide project creation stays Central IT: the new project is not already administered by the actor. Project Admin may manage/activate/archive their existing project. No fictitious pre-existing project authority. |
| List/create/update/delete shared templates | GET/POST /api/project-templates; PATCH/DELETE /api/project-templates/[templateId]; application/list-project-templates.ts and project-templates.ts | TENANT_ADMIN only; templates are tenant-wide; referenced template deletion is blocked. | Permit template selection/read needed for their project's setup and project-local configuration changes. Shared tenant-template creation/edit/deletion stays Central IT. A future project-owned template variant needs an explicit ownership design; preserve referenced-template deletion protection. |
| Assign/change/remove tenant role | POST/DELETE /api/tenant-memberships; application/tenant-memberships.ts | TENANT_ADMIN only; these are tenant-wide TENANT_ADMIN/BILLING_VIEWER memberships. | Project Admin grants/revokes project administration within their own project through the independent local assignment, and manages local memberships. Tenant role changes stay Central IT; do not let project administration promote itself to TENANT_ADMIN. Keep last-tenant-administrator/session/audit invariants. |
| Operational diagnostics | GET /api/ops/diagnostics; handler.ts | TENANT_ADMIN only; aggregates all tenant projects, retry ledger and background jobs. | Give Project Admin a project-scoped diagnostic response; omit unrelated projects and unpartitioned tenant job/ledger data. Full-tenant diagnostics stays Central IT. Partition SQL and responses, not just UI. |
| Administration discovery and launcher | GET /api/projects/administration; project-creation.tsx consumer | Non-TENANT_ADMIN receives no projects/templates and canCreateProject:false; admin branch lists tenant projects. | Expose administered-project controls and permitted template/setup reads for Project Admin; tenant project-creation capability remains Central IT. This is a companion to the capabilities above, not a separate privilege. |
| Account disablement | Proposed offboarding resource, not implemented | Original assessment proposed Central IT only. | Central IT disables the tenant account; Project Admin disables only selected-project access and durably flags existing Central IT for review. Retain approved policies 2–5. |

Eight existing administrative capability families are exclusive; administration discovery is a ninth affected surface. Proposed offboarding adds tenant-account and local-project actions. The later own-project instruction limits the earlier request to expand all Central IT-only permissions: administrative parity applies to local effects, while tenant-wide effects remain Central IT.

## Already shared permissions and related boundaries

- access-administrator.ts already permits Central IT or Project Admin for project company access, subcontractor invites and company-authority grants. Preserve the project's tenant check and account/session state checks; update its authority source to support stacked roles.
- AOR setup/assignments, department creation/membership/title catalog, request configuration and project activation already accept both administrative roles. Department-title delegation has additional layer restrictions; identical administrative alternatives do not erase them.
- Project operational insights/notification preview already admit both administrators. project-insight-auth.ts currently selects TENANT_ADMIN before the actual project role; metrics maps that to VIEWER. A combined Central IT/Manager person can therefore lose Manager-specific analytics semantics in this resolver even while Manager commands elsewhere use their actual project membership.
- Survey staffing, named-team mutation, role change and Superintendent Area unlink remain actual Survey Manager operations. An admin who also holds Manager may use those powers through Manager authority. Admin-only people do not acquire survey operations from administrative parity.
- Project Admin draft recovery is an existing specific capability; later owner decisions deny Central IT-only direct recovery. A combined person qualifies through their actual Project Admin authority. Do not convert that specific check into unrestricted administrative access.
- Notification vacancy/orphan escalation queries already combine Central IT and Project Admin recipients. These are recipient queries, not Central IT-only commands. Include new admin-grant holders and deduplicate the same person across all roles.
- The unauthenticated tenant bootstrap is not a Central IT-only check and is not changed by this request.
- Domain management, broad audit export, general invitation cancellation, reactivation, attachment purge, billing operations and broad acting administration appear in older specifications or deferred plans without corresponding complete runtime capabilities in this scan. Record future actor parity where relevant; do not build deferred capabilities merely to expand an absent gate.

## One person holding three roles

Current tenant_memberships stores one tenant role per person. Current project_memberships stores one role per project/person (UNIQUE project_id,user_id), and project role resolvers/types/UI assume that scalar role. Central IT plus Survey Manager can coexist today; Project Admin plus Survey Manager in the same project cannot.

Recommended representation: keep the current operational project role and add a fixed Project Admin assignment independently. A narrowly scoped project_admin_grants table would carry tenant/project/user, granting actor/time and revocation provenance, composite tenant keys, active uniqueness and append-only audit. It is a proposed additive schema change, not an implemented migration or generalized configurable RBAC system.

For compatibility, existing project_memberships.role=PROJECT_ADMIN remains an admin-only authority source until an explicitly approved migration converts it. Do not infer a lost Survey Manager assignment from a title, old UI or historical work. Granting admin to an existing Manager preserves their Manager role. Revoking admin preserves their operational role. Changing an operational role preserves the independent admin assignment. Retain subject/session-version invalidation, current membership/account/company validation and transaction/audit/retry rules.

Authorization resolves actual authorities separately: tenantAdministration, projectAdministration and operationalRole. Do not overwrite one with the other or trust a client-selected role. For a command with alternative administrative branches, prefer the matching project assignment for project operations, otherwise tenant authority, and record the actual authorizing witness. Manager commands check the actual Manager role regardless of tenant/admin holdings.

Navigation and contracts expose both Admin and Survey Operations/Team Management to a combined person, deduplicating shared entries. Defaults may open their operational workspace without hiding administration. IT-only visibility does not substitute for an operational role. Self-disable and existing workflow self-conflict restrictions still apply even when one person holds all three roles. Multiple roles do not count as multiple people or a distinct replacement.

## Selected scope and local disablement

Owner answer: “Own projects; if the tenant has a central IT, the disabling flags central IT for review and any tenant wide disabling that may be needed.”

Project Admin independently disables the subject's access only in the named administered project, even if the subject works elsewhere. Add local access-disabled metadata on retained membership; preserve the person's role, grants, identity/company and all historical records. Effective local role/grant authority must cease across every project entry point. Increment the existing global session_version to invalidate current sessions; disclose the sign-in renewal across projects. New authentication still permits other authorized projects. Local disable never sets users.deactivated_at.

The tenant-scoped account action remains separately authorized Central IT work, with all-project preview/guards and independent confirmation. Do not infer that local disable removes tenant-level administrative powers. A person with all three roles chooses explicitly between local and tenant scope, with no requirement for a different human reviewer.

Queue one durable central review when active eligible TENANT_ADMIN recipients exist. Include the same actor if they also hold Central IT; deduplicate user IDs. State/event/review/administrative outbox/retry result commit atomically. Transport failure leaves durable review pending without undoing local access revocation. Central review can result in an explicit no-further-action disposition or a separately confirmed tenant disable; it never silently expands scope.

No Central IT means local disable still succeeds, with an explicit no-central-review status. Do not fabricate or elevate an administrator. Other-project duties neither block local disable nor appear in its evidence. The approved local duty/Manager-continuity guards apply to the selected project; global account duty checks apply only to the separate tenant action.

Creating projects, assigning tenant roles and modifying shared tenant templates do not have an honest own-project scope in the current model. Keep those tenant-wide effects Central IT and provide local administration equivalents as mapped above. Proposed project company registration and project-owned template support need their own concrete contract before implementation; no speculative missing subsystem is included here.

## Acceptance additions

| ID | Case | Required design behavior |
| --- | --- | --- |
| P01 | Project Admin only performs a formerly Central IT-only project action or its scoped equivalent | Allow within their administered project; same business, confirmation, stale-state and audit rules as Central IT. |
| P02 | Survey Manager only, no admin assignment | Deny administrative commands; retain approved survey operations. |
| P03 | Same person is Central IT, Project Admin and Manager | Show both workspaces; allow each command through its actual authority; no request for another administrator's approval. |
| P04 | Grant/revoke Project Admin on an existing Manager | Preserve Manager role, operational scope and historical identity; revoke old sessions atomically. |
| P05 | Change Manager operational role while admin assignment remains | Preserve admin; independently enforce Manager continuity and duty guards. |
| P06 | Cross-project request by Project Admin | Deny outside administered projects and cross-tenant access; no tenant-wide promotion from a local admin assignment. |
| P07 | Shared-account disable | Project Admin disables only their selected-project access; Central IT reviews any separate tenant disable. Preserve approved policies 2–5. |
| P08 | New membership/link or admin revocation races preview, command or replay | Recheck held current authorities and complete impact set; reject stale/unauthorized requests. Never disclose a cached result after scope loss. |
| P09 | Tenant-wide template/role/diagnostic request | Tenant-wide writes/reads remain Central IT; local equivalents use actual selected-project scope. No fabricated projectId or client-selected role grants tenant authority. |
| P10 | Legacy PROJECT_ADMIN membership | Preserve supported admin access; never invent a historical operational role. |
| P11 | Multi-role actor appears in notifications or replacement count | Deduplicate by userId; one person counts once; self-disable remains forbidden. |
| P12 | Admin exists only on an archived project | Only own-project administrative access; archived operational state remains immutable. Access revocation changes only local access metadata under the reviewed contract. |
| P13 | Removing last Central IT admin while Project Admin remains | Preserve the already-approved last-Central-IT-admin protection; no bypass through newly shared tenant membership commands. |
| P14 | Direct HTTP reaches a control hidden by navigation | Server enforces the same actual authority/scope as the UI; no UI-only protection. |
| P15 | Central IT plus Manager accesses operational insights | Actual Manager semantics are retained; tenant-role precedence cannot silently downgrade or substitute their operational role. |

## Review and next stage

Offboarding policies 2–5, own-project Project Admin scope and same-person role stacking are approved directions. The revised offboarding document specifies separate project-access and tenant-account actions, durable Central IT review, absence/same-person behavior, migration proposals and 40 acceptance cases.

Decision33 records acceptance of the revised fixed Project Admin grant representation, local access metadata, archived access-control exception and administrative review/outbox design for planning. The concrete implementation plan is docs/superpowers/plans/2026-10-01-scoped-account-offboarding.md and awaits owner review. No production permissions, tests, types, migrations or runtime/data state changed.
