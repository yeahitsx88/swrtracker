# Customer lifecycle rehearsal — 2026-10-02

## Status and operating boundary

IN PROGRESS. First automated onboarding wave complete; every human scenario remains HUMAN_PENDING. This is not a completed lifecycle acceptance or release approval.

Branch: `codex/customer-lifecycle-rehearsal`, based on verified local and fetched `origin/phase5` commit `6becd3bd541f58271e70cafd6a5da82162b44051`. Original dirty review checkout preserved. Acting as rehearsal auditor and support harness author; no production source or migration changes. The user explicitly authorized cross-module rehearsal fixtures and support tooling.

Rehearse → Observe → Record → Classify → Review → Authorize. All product recommendations below are UNAPPROVED. Hypothetical customer acquisition supplies the scenario; it does not change the approved internal Survey/CTS product scope or authorize CRM, commercialization, hosting or identity redesign.

## Scenario and cast

Fictional customer: Cedar Ridge Construction. First project: Northbank Pump Station, Full crew. Second project: Southbank Access Road. Precision Earthworks is its subcontractor. Stonebridge Utilities is a separate tenant used to challenge isolation. All people and `.example.test` addresses are synthetic; no messages are sent externally.

| Participant | Authority to exercise | Provisioning state |
|---|---|---|
| Axiom operator / prospective customer | Acquisition handoff and controlled bootstrap; no invented platform superuser | External scenario; product provisioning gap recorded |
| Alex Morgan | Client TENANT_ADMIN; Central IT capability within client tenant | Assisted SQL bootstrap, real password login |
| Jordan Lee | Other tenant's TENANT_ADMIN | Assisted SQL bootstrap |
| Casey Brooks | Independent Project Admin, later stacked operational role | Pending application setup / explicitly recorded assistance if blocked |
| Sam Rivera | Actual SURVEY_MANAGER / Survey Authority | Pending |
| Taylor Reed | SURVEY_SUPERINTENDENT and configured Area reviewer | Pending |
| Morgan Hayes | PARTY_CHIEF / field coordinator | Pending |
| Jamie Park | INSTRUMENT_MAN | Pending |
| Drew Ellis | GC requester | Pending; ordinary registration path to assess |
| Riley Chen | Subcontractor REQUESTER | Created through real invitation/registration in automated dataset only |
| Avery Quinn | Subcontractor requester with separate company authority | Pending |
| Supporting participants | CAD_LEAD, CAD_TECHNICIAN, DEPARTMENT_MANAGER, DEPARTMENT_LEAD, VIEWER, AREA_VIEWER, SUBCONTRACTS_COORDINATOR, BILLING_VIEWER | Pending role-specific applicability/visibility checks; do not imply enum means complete feature support |

Separate random schemas under the isolated local database at port15489 protect the automated and human timelines. Human runtime: `http://localhost:3116`. Automated runtime: `http://localhost:3115`. Both run the existing verified Linux production image. No retained Sabine database, production system, or external hosting was used.

Local schema IDs, passwords and server secrets live exclusively under ignored `.local-customer-rehearsal/`. The human dataset has two assisted administrators and no projects. We deliberately have not created its project or consumed its invitations for the user.

## Evidence and interpretation

- Baseline: 544/544 unit tests and strict TypeScript passed before support changes.
- `automated-results.json`: 19 HTTP observations, 18 expected outcomes, one unexpected500. Checks recording known missing capabilities are successful observations, **not successful operational onboarding**.
- `browser-observations.json`, `login.png`, `first-admin-landing.png`: real browser/password login on localhost and client administration discovery. These are automated observations, not human acceptance. Screenshot includes duplicate setup projects from the interrupted harness attempt and rerun.
- `initial-harness-attempt.json`: first five checks before fixture error. Harness initially omitted project/company association; invitation correctly rejected. Harness corrected using the existing application association API; no product change. The later run uses unique invite addresses and retains this interrupted evidence.
- Expired/canceled invitations and session version changes are explicitly arranged using SQL in the owned automated schema. These checks do not establish a working operator cancellation UI or production revocation workflow.
- Previous Phase5 acceptance remains historical supporting evidence; it does not mark this entire customer journey as passed.

## Findings register

| ID | Classification | Expected operating experience | Observed / evidence | Recommended disposition |
|---|---|---|---|---|
| F01 | ONBOARDING GAP; MISSING ADMINISTRATION CAPABILITY | Axiom provisions client and invites first administrator through a documented controlled process | A01: tenant POST404; `src/app/api/tenants/route.ts` explicitly limits bootstrap to tooling. First admins required assisted SQL; existing register route creates a project membership, not tenant authority | Review minimal controlled bootstrap and initial-admin enrollment design; preserve tenant security boundaries. UNAPPROVED |
| F02 | USABILITY / UX; ONBOARDING GAP | Ordinary credentials without knowing Tenant ID | A02: missing tenant400; browser shows required Tenant ID; invite page displays tenant/project UUIDs and register URL propagates tenant ID | Review token-derived context and ordinary return-login tenant discovery separately. UNAPPROVED |
| F03 | DEFECT; RECOVERY / RESILIENCE | Malformed invite returns a controlled client error with no mutation | A09: non-UUID token returns500; repository compares input against UUID token without boundary normalization | Recommend bounded validation/error handling after review; repeat with malformed and valid-format unknown tokens and verify no side effects. UNAPPROVED |
| F04 | ONBOARDING GAP | Existing user can accept an appropriate additional invitation | A16: existing user's registration returns409. This wave used same-project invitation; another-project/tenant flows remain pending. `register/handler.ts` always calls createUser | Investigate separate authenticated acceptance and multi-tenant account semantics before choosing design. UNAPPROVED |
| F05 | OPERATING DECISION; ONBOARDING GAP | Clearly identify the invite recipient when a different account is signed in | A10: foreign session does not prevent invite-bound registration; A11/A12 verify correct project/requester membership and no tenant escalation. Browser continuation under wrong account remains pending | Review explicit account/context handling. No demonstrated access-control bypass in these cases. UNAPPROVED |
| F06 | OPERATING DECISION; MISSING ADMINISTRATION CAPABILITY | Close the customer organization distinctly from disabling a person's account | Current offboarding scope is TENANT_ACCOUNT (person); organization-wide closure behavior not yet rehearsed | Define desired organizational closure and history access separately; do not equate it with user disablement. UNAPPROVED |
| F07 | ONBOARDING GAP; OPERATING DECISION | Onboard internal Survey staff and deliver useful invitations | Inspected project invite route creates subcontractor REQUESTER invites only and returns token; actual delivery and internal-account onboarding not established by this wave | Exercise supported setup surfaces; record any assistance and proposed minimum handoff. UNAPPROVED |

Positive evidence: cross-tenant invitation denied404; tenant/email/company mismatch400; token-bound membership ignores supplied project/tenant-role escalation fields; accepted/expired/canceled tokens rejected; requester project creation403; foreign project discovery excludes client projects; stale real session401. This bounded sample is not a security audit or proof of every isolation path.

The first administrator can authenticate and reach **Project administration**, Create Project and Tenant accounts/Central IT reviews. The absence of an active operational membership does not prevent these administration controls. Avoid misclassifying the launcher message as absent admin functionality.

## Full rehearsal sequence and remaining coverage

For every run retain scenario ID, participant, dataset, preconditions, intent, expected/observed outcome, PASS/FAIL/BLOCKED/ASSISTED/NOT_RUN/HUMAN_PENDING, evidence reference and finding IDs. Human results require the user's observation; a tool screenshot is not their sign-off.

| Stage | Scenarios / expected outcome | Current status |
|---|---|---|
| R01 Acquisition | Capture legal/display client name, designated admin identity/email, authority approval, initial project intent and support contact; no CRM | Handoff template below; HUMAN_PENDING |
| R02 Provisioning | Create tenant, first-admin invitation, initial authority, no exposed identifiers or undocumented assistance | F01/F02; ASSISTED bootstrap, human pending |
| R03 Authentication | First login/landing, ordinary return login, logout/reset, multi-project and multi-tenant identity | Initial login observed; remaining NOT_RUN |
| R04 Tenant/project setup | Company setup, Full project, templates/configuration, Areas/departments, operational roles, Project Admin independence, activation/readiness | Project/company API creation observed; complete configuration and human steps NOT_RUN |
| R05 Invitations | New recipient, existing account/new project, other tenant, expiry/reuse/cancellation/tamper, wrong signed-in account, invite mail handoff | Initial wave partial; remaining browser and cross-project/tenant cases NOT_RUN |
| R06 Normal work | Requester draft, attachment, complete intake, submission; Survey review/approval, Chief queue/assignment, IM start/completion, requester history | NOT_RUN |
| R07 Corrections | Review return, requester correction/resubmission, field inability with Chief validation; preserve one record/number and fresh review | NOT_RUN |
| R08 Exceptions | Delay/restart, reassignment, urgent Need-By/priority, stop-work/cancellation, notification recipients and realistic delivery limitations | NOT_RUN |
| R09 Active administration | Stacked roles, independent Project Admin grants/revocation, company authority, staffing/reviewer handover/Area cleanup, duties block unsafe changes | NOT_RUN |
| R10 Offboarding | Project disable preserves other project access; separate tenant user disable; Central IT review; no self/last-admin loss; history intact | NOT_RUN in this journey |
| R11 Project/customer closure | Resolve live duties, archive, retained requests/files/audit visibility; distinguish account disable from organization closure | NOT_RUN; F06 operating decision |
| R12 Recovery | Lost-response retry same key/body,409 reload, double action, stale session, permission loss, concurrent duty creation/disable, interrupted worker recovery | Session revocation observed; remaining NOT_RUN |
| R13 Isolation | Second tenant, second project, second subcontractor, requester drafts, attachments and history; no unauthorized discovery/read/write | Initial API sample passed; full matrix NOT_RUN |
| R14 Readout | Map each operational gap to evidence, recommend disposition; owner authorizes individual follow-up changes | Pending all preceding stages |

Human sessions should advance one stage at a time. At a product blocker, record it and use only an explicit, labeled rehearsal fixture to continue downstream. Never turn such assistance into a passing end-to-end result.

### Acquisition handoff card

Customer: Cedar Ridge Construction (synthetic). Designated administrator: Alex Morgan, `admin@rehearsal.example.test`. Project: Northbank Pump Station. Administrator appointment/verification and commercial approval are scenario assumptions supplied by Axiom; no real person is contacted. Open decisions: who verifies appointment, how secure enrollment is issued, support/recovery ownership, and organization closure authority.

## Human session 1 — begin here

1. Open `http://localhost:3116/login` without a prefilled query string. Act as Alex, a newly appointed client administrator with normal email/password expectations. Record what the page asks for and what information Axiom would have needed to give you.
2. Open local `.local-customer-rehearsal/HUMAN-ACCESS.md` for the assisted synthetic credentials. Record use of its Tenant ID as assistance; enter credentials normally. No pre-signed session or role-switching bypass is used.
3. Observe the destination and available administration. Can you identify where to manage the client and create a project? Record confusing terminology or apparent missing access.
4. Create **Northbank Pump Station**, **Full** crew, **No template**, through the UI. Follow **Configure Northbank Pump Station**. Stop at that configuration screen so we can record your observations and guide actual staffing/setup in session2.
5. Tell the assistant which steps succeeded, any error message, and what was unclear. We will record your results verbatim and proceed. Do not send passwords or session cookies.

No human steps have been performed or marked passed yet.

## Reproduction and runtime stewardship

Support scripts: `scripts/rehearsal/customer-lifecycle.mjs setup|http` and `scripts/rehearsal/browser-onboarding.mjs`. Setup asserts the exact isolated Docker database/container/port and refuses to overwrite an existing local rehearsal directory. Run from this checkout. Browser script requires `SWR_PLAYWRIGHT_MODULE` pointing to available Playwright; it uses local Edge. Docker runtime env files stay ignored.

The two containers are `swr-customer-rehearsal-auto` and `swr-customer-rehearsal-human`, bound to loopback3115/3116. They use `swrtracker:phase5-reconcile-20261002`. Record names/schema IDs in local manifest; keep human state for subsequent sessions. No auto-purge or reset. To resume stopped runtimes, start those exact containers after checking their labels/ports. If app access fails, inspect runtime before altering fixture state.

Current answer to the owner's final question: **the complete operating journey is not yet demonstrated, and identifier-free first-customer onboarding already has confirmed gaps.** The remaining lifecycle stages and personal walkthrough are still required before a final answer.
