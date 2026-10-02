# Customer lifecycle rehearsal — 2026-10-02

## Status and operating boundary

IN PROGRESS. First automated onboarding wave complete; human project creation/opening is now user-confirmed; remaining personal scenarios are pending. This is not a completed lifecycle acceptance or release approval.

Branch: `codex/customer-lifecycle-rehearsal`, based on verified local and fetched `origin/phase5` commit `6becd3bd541f58271e70cafd6a5da82162b44051`. Original dirty review checkout preserved. Acting as rehearsal auditor and support harness author; no production source or migration changes. The user explicitly authorized cross-module rehearsal fixtures and support tooling.

Rehearse → Observe → Record → Classify → Review → Authorize. All product recommendations below are UNAPPROVED. Hypothetical customer acquisition supplies the scenario; it does not change the approved internal Survey/CTS product scope or authorize CRM, commercialization, hosting or identity redesign.

## Scenario and cast

Fictional customer: Cedar Ridge Construction. First project: Northbank Pump Station, Full crew. Second project: Southbank Access Road. Precision Earthworks is its subcontractor. Stonebridge Utilities is a separate tenant used to challenge isolation. All people and `.example.test` addresses are synthetic; no messages are sent externally.

| Participant | Authority to exercise | Provisioning state |
|---|---|---|
| Axiom operator / prospective customer | Acquisition handoff and controlled bootstrap; no invented platform superuser | External scenario; product provisioning gap recorded |
| Alex Morgan | Client TENANT_ADMIN; Central IT capability within client tenant | Assisted SQL bootstrap, real password login |
| Isolation-control administrator (fixture currently named Jordan Lee) | Other tenant's TENANT_ADMIN; separate test control, not the intended human Jordan | Existing fixture retained; name collision recorded below |
| Jordan Lee | Northbank Project Admin; no tenant authority or project creation | Intended human participant; invitation/account setup pending |
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

Human update: owner confirms project creation/opening and arrival at member administration. Member onboarding is blocked; other personal steps are not inferred as passed.

## Reproduction and runtime stewardship

Support scripts: `scripts/rehearsal/customer-lifecycle.mjs setup|http` and `scripts/rehearsal/browser-onboarding.mjs`. Setup asserts the exact isolated Docker database/container/port and refuses to overwrite an existing local rehearsal directory. Run from this checkout. Browser script requires `SWR_PLAYWRIGHT_MODULE` pointing to available Playwright; it uses local Edge. Docker runtime env files stay ignored.

The two containers are `swr-customer-rehearsal-auto` and `swr-customer-rehearsal-human`, bound to loopback3115/3116. They use `swrtracker:phase5-reconcile-20261002`. Record names/schema IDs in local manifest; keep human state for subsequent sessions. No auto-purge or reset. To resume stopped runtimes, start those exact containers after checking their labels/ports. If app access fails, inspect runtime before altering fixture state.

Current answer to the owner's final question: **the complete operating journey is not yet demonstrated, and identifier-free first-customer onboarding already has confirmed gaps.** The remaining lifecycle stages and personal walkthrough are still required before a final answer.


## Human session 1 observation — member onboarding

- Evidence: owner reports "created/opened the project" and "no way to add someone as a member"; attached screenshot retained as `human-member-onboarding.png`.
- Project creation/opening: PASS (user-reported). Full configuration, staffing and activation: not yet passed.
- Member onboarding: BLOCKED. Screenshot shows empty Person selector and disabled Review member addition.
- F08 — ONBOARDING GAP; MISSING ADMINISTRATION CAPABILITY; USABILITY / UX. This form selects existing active tenant accounts whose companies are associated with the project and who do not already have membership. It does not create/invite a new person. Source: `src/app/api/projects/[projectId]/companies/route.ts` candidate query; `src/components/ui/project-administration.tsx`. Associating a company can expose existing eligible accounts but cannot onboard missing employees.
- Further friction: existing-company association requests an internal Company ID in the current UI (`project-administration.tsx`), relevant to F02. Human has not yet reported completing that operation.
- Owner suggestion: bulk email import or domain-based allowance, example `@axiomcivilservices.com`. Record as POTENTIAL ENHANCEMENT / OPERATING DECISION, not implementation authorization. No real-domain configuration or email sending performed.
- Proposed decision to review: bulk invitations bind each recipient to explicit tenant/project/company and default role; approved-domain enrollment requires verified ownership of that email address and an explicit tenant boundary. Separately decide whether eligible employees receive requester access to all tenant projects or require project-specific enrollment. Survey and administrative authority remain explicitly assigned. Existing disabled access must not be restored by either enrollment route.
- Domain matching alone is not email ownership verification. Current registration requires an invitation; no domain-only registration path was found in that handler. Older domain model/schema is not evidence of an operational self-enrollment flow.
- Next step: review enrollment scope with owner, record decision, then continue rehearsal with clearly labeled synthetic staffing assistance if the current product cannot provide account onboarding. No automatic product fix or scope expansion.


### Owner decision — project-specific enrollment access

Owner response: "Project specific access". Approved policy: eligible company/domain enrollment must not automatically grant access to every project in the tenant. Each project requires an explicit scoped invitation or access grant. Domain eligibility alone confers no project, Survey, or administrative authority. Existing disabled access must not be silently restored through enrollment.

This resolves the project-scope question only. Bulk invitations versus domain enrollment, email verification, tenant association, approval ownership and implementation design remain pending review. No product implementation is authorized by this policy choice. Continue the rehearsal under existing capabilities and record any assisted account provisioning.


### Owner decision — request project access for administrator approval

Owner response: "yes, request access to a project for admin approval". Approved direction: verified employees may request access to a specific project; a request does not itself grant access, and administrator approval is required before access is granted. This supersedes the assistant's invitation-only recommendation. Decision38's project-specific boundary remains in force.

Still pending: how the requester identifies an eligible project without exposing unrelated project information, which administrator receives/approves requests, default approved role/company binding, and request/retry/denial handling. Approval of this operating direction does not authorize automatic product implementation under the rehearsal's Review -> Authorize boundary. No project access, domain configuration, or product behavior changed.


### Owner decision — project link/code for access requests

Owner response: "Project link/code". Approved direction: the organization shares a project-specific link or code through which a verified employee requests access. Possessing the link/code does not grant membership or bypass administrator approval. A browsable tenant project directory was not selected. The user-facing entry point should resolve project context without requiring the employee to understand or enter a Project UUID.

Together Decisions38–40 establish project-specific, administrator-approved access requests via a shared project link/code. Token/code format, expiration/revocation, safe unauthenticated disclosure, email verification, approval routing and default role remain design details pending review. No implementation or live access changes were made.


### Owner decision — access-request approvers and default role

Owner response: "That fits the model" to the proposal that the project's Project Admin or the tenant's Central IT administrator may approve, granting Requester access by default; Survey and administrative roles are separately assigned.

Approved model (Decisions38–41): verified employee uses an organization-shared project link/code, requests that project's access, and remains without that access until the project's Project Admin OR tenant Central IT approves. Either authorized approver can act; no dual approval is required. Approval defaults to REQUESTER and does not grant Survey or administrative authority. Administrative scope remains bounded to the project/tenant involved.

This completes the operating-policy choices discussed so far. Implementation remains unapproved under Decision37. Enrollment verification/company binding, link/code lifecycle, request notifications and safe retry/denial semantics still require a concrete design. Continue recording the current member-onboarding blocker rather than presenting this agreed future flow as implemented.


### Owner clarification — Alex delegates Northbank to Jordan

Owner paused walkthrough progression to clarify the second human administrator. Alex Morgan is the client Tenant Admin who creates/opens Northbank Pump Station. Jordan Lee is to be invited by name/company email as that project's Project Admin, arrive at assigned-project discovery, open Northbank, and administer it without project-creation authority. The previously seeded foreign-tenant admin named Jordan Lee is an isolation-control fixture and does NOT satisfy this human role. No fixture identity or authority was changed during clarification; future setup must distinguish these identities explicitly.

Desired delegation journey: Alex assigns the intended Project Admin capability and issues a secure invitation; Jordan registers/signs in via the invitation and receives only intended Northbank authority. The owner describes emailed delivery, which remains a product gap/local simulated-mail handoff during this rehearsal. Do not label the current requester-only invitation route as supporting this journey.

Desired Jordan tasks: manage individual and bulk email/domain enrollment for tenant employees, subcontractors, GCs and client/owner companies; establish Survey Manager assignment; configure the project. Interpret the earlier approved project-specific boundary as controlling these enrollment lists: no tenant-wide authority is inferred. Enrollment eligibility must retain company attribution and cannot automatically grant a company's members Survey/admin authority or bypass Decisions39–41 approval requirements.

Clarification pending: "create a project admin role with permissions" and "Creating Survey Manager Role" may mean assigning existing fixed capabilities or defining custom roles/permission sets. Existing approved architecture supplies fixed independent Project Admin capability and actual Survey Manager role; configurable role creation is not approved. Ask owner before treating wording as custom RBAC authorization. Likewise, project enrollment allowlists must not be conflated with the existing priority whitelist.

Walkthrough remains paused at member onboarding for this clarification. No production changes, provisioning, emails, or authority changes performed.


### Owner decision — predefined roles; individual permissions deferred

Owner response: "Let’s go predefined and we’ll defer individuals permissions (a more mature config)". Resolved: Alex assigns the existing predefined Project Admin capability to Jordan for Northbank; Jordan's Survey Manager setup means assigning the predefined Survey Manager role to an eligible person, not defining a new role. Project administration and operational Survey authority remain independent; neither automatically confers the other.

Custom role definitions and per-person permission configuration are deferred. This resolves the role-definition ambiguity in Decision42 without authorizing implementation of the missing privileged invitation/enrollment journey. Next rehearsal point remains Alex's project-scoped invitation/delegation to Jordan, with the existing product gap recorded and any assistance explicitly labeled.


## Automated Alex-to-Jordan delegation — assisted completion

Owner explicitly authorized simulation without personal involvement. Executed `scripts/rehearsal/jordan-delegation.mjs` against only the existing human rehearsal schema/project using separate Alex and Jordan browser contexts. Real registration and password login; no forged session. See `jordan-delegation.json` (10 passing expectations), `jordan-projects.png`, `jordan-project-admin.png`. No product code changes or external emails.

- Actual user-created Northbank found in SETUP. Alex's real application session attempts a GC/Project Admin invitation; current endpoint rejects400. This is a confirmed product gap, not a successful invitation send.
- Explicit assistance: inserted a GC REQUESTER invitation into the owned schema and placed its application link in an ignored local HTML mailbox addressed to `jordan.lee@rehearsal.example.test`. No SMTP delivery or real address verification occurred. Password/token remain local and untracked.
- Jordan's separate browser follows the mailbox link, uses the actual invitation/registration UI and creates his account. Tenant/email are prefilled, but system identifiers remain exposed by the existing UI.
- Alex uses the real admin UI to grant independent Project Admin authority to the new member. Jordan then signs in with his password and opens Northbank administration.
- Verified: no Create Project button; server project creation403; administration discovery contains only Northbank and canCreateProject=false; no tenant memberships; one Northbank REQUESTER operational membership plus the independent admin grant, no Survey authority.
- Deviation: desired single privileged invitation/acceptance is replaced by fixture invitation plus a separate real admin grant after registration. Requester membership is the fixture's baseline, not an approved requirement that all Project Admins must also be Requesters. Pure administration-only onboarding remains a design consideration.
- Discovery nuance: Northbank is listed under administered projects while SETUP; it is not an active operational project yet. We did not activate it to conceal missing staffing/configuration.
- Human dataset now retains Jordan as Northbank Project Admin. Previously seeded foreign-tenant control with the same display name remains separate and unchanged. Jordan credentials appended to ignored HUMAN-ACCESS.md for later role walkthroughs.

Outcome: ASSISTED_STEP_COMPLETE, not end-to-end privileged invitation acceptance. Next stage is Jordan's project company/enrollment and Survey Manager setup. Previously agreed enrollment features remain proposed and unimplemented.
