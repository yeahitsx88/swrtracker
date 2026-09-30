# Staffing cleanup: next owner decision

Read-only requirement/source assessment after the protected additive staffing increment, 2026-09-30. This is not a vulnerability scan or authority to change permissions.

## Evidence

The approved Team Management requirement includes changing/removing fixed survey roles while keeping people as Requesters and retaining history. `change-survey-role.ts` correctly refuses unresolved named-team, crew, reporting, Area, responsibility and acting obligations. Organizational team editing already resolves its own lead/member obligations without touching operational links.

`save-survey-staffing.ts` remains additive and refuses another Chief's IM or another existing Chief Area. It can replace an explicit Superintendent link during a valid save, but has no targeted roster/Area detach command. The new editor exposes these boundaries honestly rather than pretending omission removes people. Archived mutations remain denied. Decision17 explicitly approved protection of the existing save, not new removal authority or automatically resolving all grants.

## Recommended next bounded increment

Seek approval for explicit Manager-only detach operations within the existing staffing resource: select a current project Chief → IM roster link, Superintendent → Chief reporting link or Chief Area assignment; require the displayed snapshot, stable retry key and deliberate confirmation. Soft-deactivate only the selected link, preserve historical ticket/user records, and append a validated staffing audit atomically. Do not infer a replacement reporting relationship or silently demote a person. Fixed-role removal remains a separate confirmed command after obligations are resolved.

Area detachment must refuse a still-dependent reporting link; the Manager must explicitly detach or replace that link first. Responsibility and acting grants remain protected and administratively managed, not automatically cleared by staffing. No cross-Area move, ticket reassignment, account invitation, generalized HR/RBAC or Sabine per-person mapping is implied. Existing active ticket assignments may need separate workflow resolution and must not be rewritten through cleanup.

The alternative is to keep these links administration-only and leave the Manager editor additive. That avoids new staffing permissions but does not complete the requested Manager role-removal workflow. An automatic "clear all obligations" action is not recommended: its authority and effects cannot safely be inferred.

Gate: new public command contract and removal permissions. Wait for owner approval before coding the detach path or amending its audit contract. The current checkpoint can be shipped independently; the broader objective remains unfinished.
