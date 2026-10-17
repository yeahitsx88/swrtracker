# System records, appearance and guarded recommissioning

## Approval and implementation boundary

Owner approval on2026-10-02 authorizes guarded archived-project recommissioning and a system-wide records/appearance extension (Decision50). The implementation extends the incumbent Axiom interface and fixed capability model. The isolated rehearsal at port3116 retains the archived Northbank project. Recommissioning was exercised on a disposable schema copy at3117.

## Records by audience

| Audience | Covered record surfaces | Useful selection actions |
|---|---|---|
| All authenticated accounts | Project launcher, account Area/crew relationships, Appearance navigation | Selected-record CSV export |
| Central/Tenant IT | Tenant accounts, review queue, administered projects, recommissioning evidence | Export; sequential guarded account-disable review; existing review resolutions; explicit readiness selections |
| Project Admin | Eligible member additions, current access, independent Admin assignments, companies, subcontractor requesters/invitations, draft recovery, protected obligations | Export; existing reviewed member additions/removals, Admin grants/revocations and company-view changes |
| Survey Manager | Personnel, teams, staffing/Area candidates, reorganization/handover evidence, assignment queues, requests, chart data | Export; selected additions/removals in the named-team draft; existing guarded staffing and workflow actions |
| Survey Superintendent | Authorized personnel/team records, Area/reporting obligations, requests and chart drilldowns | Export and existing scoped actions |
| Party Chief / Instrument Man | Authorized crew-work requests, assignment details, charts and supporting requests | Export and existing per-request workflow actions |
| GC/owner/subcontractor Requester | Own authorized requests, saved drafts, staged/persisted attachments and history | Export and existing guarded individual operations |
| CAD, department, Viewer, Area Viewer, Subcontracts Coordinator, Billing Viewer | Shared authenticated Appearance/account/project shell; existing authorized request/review surfaces where available | Export on shared record tables; original capability restrictions apply |

Every shared record table has filtering, sortable semantic headers, page selection, select-all-matching, clear selection and CSV export. CSV export escapes fields and neutralizes spreadsheet formula prefixes. Secondary record collections preserve existing inline editors/disclosures in their cells. Charts retain their graphical views and expose collapsible table values. Navigation, native choice controls, explanatory prose and workflow steps retain their appropriate forms.

Filtering, sorting and selection apply to records currently loaded by the authorized parent. A server-paged list requires its existing search/page controls to inspect further records. Bulk export is a meaningful operation for read-only populations; destructive operations retain explicit named review and current server authorization. There is no universal bulk cancellation, archive, download ZIP or role-edit command.

## Appearance

- Menu → Appearance is available independently of project membership or operational role.
- Light, Dark and Use device setting are personal database preferences. A mode change follows the account across sessions.
- Eligible Central/Tenant IT alone can change tenant primary/accent colors. Ordinary roles cannot save tenant branding through direct API calls.
- Text/link/action colors are derived for readable contrast. Safety status colors retain distinct meanings. Supplied Axiom artwork remains unchanged, with a light backing in dark mode.
- Tenant color writes use version checks, current authority before retry replay, lifecycle coordination and atomic administrative events. Uncertain settings retain the original body/key; stale responses require deliberate reload.

## Recommissioning contract

Central IT opens Projects → administered project → Review recommissioning. The command requires current archived evidence, an eligible replacement administrator, a reason and confirmation. It records the complete prior project row and archived review evidence immutably, starts an operating period, moves the project into preparation using SETUP, and creates the necessary independent Project Admin grant. Existing roles are preserved. A newly added administrator receives Requester membership plus independent administration. Disabled access is not restored.

Preparation permits existing authorized administration/staffing work. Ordinary ticket creation, draft edits, uploads and workflow transitions are suspended. Existing authorized reassignment/cancellation can resolve unfinished work. Ordinary activation and template replacement cannot bypass the recommissioning boundary. Previously activated projects retain their template contract.

Before reopening, Central IT must freshly review every retained member/company and explicitly continue every remaining unfinished request. Departures are resolved using existing offboarding; cancellation retains actual request history. Current Survey Manager, Area/Superintendent readiness, invitations, named teams and active assignment eligibility are checked. The administrative work table exposes lifecycle metadata; actual request content and attachment access remain subject to existing operational authorization. This workflow grants no general request-reading privilege to Central IT.

Reopening atomically records reviewed evidence, updates the operating period and returns ACTIVE. The project ID, completed/canceled history, drafts, attachments and original assignments remain. Definitive stale conflicts require reload; retries retain exact intent and do not duplicate transitions. The result screen retains the period ID, reviewed snapshot and reason.

A wholly new cast requires explicit ordinary offboarding/onboarding, Manager succession and staffing review during preparation. This increment implements the controlled restart capability; it does not automatically replace personnel, expire former access or infer permissions from job titles. Preparation cancellation is not implemented; unresolved preparation remains pending until its recorded readiness is satisfied.

## Recorded verification

| Evidence | Result and limits |
|---|---|
| Strict TypeScript and Linux production build | Passed; existing autoprefixer compatibility warnings remain. No unit/regression suite was added or run for this increment. |
| `browser.json` |125 passed checks across Central IT, Project Admin, Survey Manager, Superintendent, Party Chief, Instrument Man, internal Requester and subcontractor Requester; light/dark persistence, branding authority, sorting/export,1440px desktop and390px mobile. |
| `recommissioning.json` |14 authenticated HTTP checks: authority/isolation, preparation, stable retries, suspended ordinary work/activation, incomplete/stale review rejection and opening. |
| `recommissioning-browser.json` |12 checks through visible preparation/review/opening controls on the disposable copy. |
| `history-witness.json` |11 record families compare identically with the original isolated schema; includes1599 schema-wide tickets (1598 in the primary project and one isolation control),13042 events,318 attachment records and3272 assignment-history rows. Original project ARCHIVED; copy ACTIVE. |
| Design detector |One pass, zero primary findings;11 color/type advisories reconciled against the approved design-system update. No ignore rules added. |
| Independent UI finish |Initial disposition fix; two scored correction rounds resolve mobile width, vocabulary, metadata visibility, type wrapping and draft identity. Final disposition ship covers the scored fixes; see `finish-verdict-final.md`. |

Independent finish review required a readable22rem Request column, unbroken type labels, shared human-readable row/export labels and distinct stable draft identifiers in metadata-only recommissioning evidence. These corrections were recaptured for scoring.

The role walkthrough initially found an empty crew queue omitted its table; the shared empty state now retains table controls/headers. The recommissioning harness initially failed to locate a paginated candidate because it had not used the visible filter; correcting the harness completed the flow. These are distinct from a permission bypass or production-data change.

Page visits in the recorded local sample measured568–738ms across16 role/mode samples, including a500ms network-idle wait. These are local navigation observations, not production latency, load-test results or a comparison proving optimization. Additional enum roles inherit shared surfaces through source routing; they were not independently provisioned and logged in during this increment. New concurrency/authority-loss/rollback fault injection and full integrated release acceptance remain required coverage. Attachment metadata/history were compared; file-byte downloads were not re-exercised in the disposable copy.

## Migration, rollout and rollback boundary

Migration033 is additive and was applied only to the synthetic isolated schema. Deploy the migration before this application version: the authenticated shell and lifecycle gates read the new tables. Preserve a verified database/attachment backup before a production migration and follow the established worker coordination/restart procedure.

Before any recommissioning preparation begins, the prior application can be restored while retaining additive schema/audit rows. Once preparation exists, older code cannot enforce its workflow boundary. Keep a compatible runtime while preparation is pending; do not roll back by deleting evidence, resetting statuses or restoring disabled access. An older release must not be used to resume normal operations against pending preparation. Completed operating-period evidence is retained.

External email delivery, support-assisted emergency recovery execution, production migration/backup validation and the established beta/release gates remain pending. This report records the implemented increment and isolated evidence; it does not close whole-Phase5 release acceptance.
