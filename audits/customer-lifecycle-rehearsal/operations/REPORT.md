# SWRTracker operational simulation report

Local synthetic acceptance, October 2, 2026 (America/Chicago). This evaluates the retained Northbank rehearsal; it does not establish production readiness or real-customer behavior.

## 1. Simulation scale

| Population | Created in this exercise | Final active operational roles |
|---|---:|---:|
| Survey Manager | 1 original | 1, Taylor promoted |
| Survey Superintendents | 3 | 2 |
| Party Chiefs | 15 | 15 |
| Instrument Men | 45 | 45 |
| Requesters | 650 | 650 |
| Operational people | 714 | 713 |
| Replacement Project Admin | 1, Casey Brooks | Separate administrative capability |

Original 100 requesters +500 internal GC +50 individual subcontractor requesters. Final requester mix:540 GC, 105 subcontractor across three companies, 5 owner representatives. Alex and Jordan predate the exercise; Casey is new. The primary tenant retains 717 accounts, 715 active after Jordan and Sam departures. The foreign-tenant control is additional. Accounts are retained rather than deleted.

Northbank: **1598 request records, 1502 completed, 44 requester-canceled, 7 active workflow requests and 45 drafts**. One separate Southbank draft is excluded from these totals. Fifteen named four-person crews remain, with 15 Chiefs and 45 Instrument Men. Successful Northbank instruction uploads: 318.

| Final state | Records |
|---|---:|
| APPROVED | 1 |
| COMPLETED | 1502 |
| DRAFT | 45 |
| IN PROGRESS | 2 |
| REQUESTER CANCELED | 44 |
| SUBMITTED | 4 |

**Represented period:**49 logical construction shifts:20 initial demand shifts; one recovery/departure interval; 6 expanded demand +4 recovery shifts; 2 new-manager demand +4 recovery shifts; 6 rebalanced demand +6 recovery shifts. Evidence starts 2026-10-03T00:20:27.053Z; final audit 2026-10-03T01:21:47.469Z (UTC). Application timestamps were never rewritten. Logical shift sequencing and 2-48-hour planned durations are ledger annotations. Wall time includes development/review pauses; recorded cycle times are accelerated execution measurements, not 49 days of field performance.

## 2. Organizational model

Sam initially managed three Superintendents, each with one workfront and five Chiefs. Each Chief leads three Instrument Men and a named team. Specialties vary across layout/control, foundation checks, as-built, utility alignment and general support.

**Jordan resignation:** Alex/Central IT appointed Casey through actual membership and independent Project Admin APIs, then separately disabled Jordan's project access and tenant account. Nine checks passed, including exact retry, revoked sessions, retained history and Central IT review. Local removal did not silently disable the account.

**Sam firing and Taylor promotion:** Existing-member promotion initially returned 409/400, and LAST_SURVEY_MANAGER correctly blocked removal. The owner explicitly approved a guarded handover correction. Casey used its actual browser UI to promote Taylor; Morgan received Taylor's Structures coverage and five reporting crews. Both affected old sessions failed 401. Casey separately disabled Sam's project access; Alex separately disabled his tenant account and resolved the review. Sam cannot renew login. Taylor operated project-wide workflows afterward. Concurrent same-command replay returned one appointment event; replay after Casey lost administrative authority failed 403.

**Taylor's reorganization:** Existing guarded reporting/Area cleanup, staffing and named-team APIs moved three intact crews. Final allocation:8 Structures/4 Utilities/3 Civil, matching approximately 50/30/20 simulated demand. Any open work was resolved before coverage changes. Requests, audit history, files and roster/team membership were retained. Morgan now supervises 12 crews across Structures/Utilities; Jamie supervises 3 Civil crews. That supervisory concentration remains visible; no invented grant, extra role or hidden coverage was used to conceal it.

**Assistance:** Internal GC/owner identity provisioning required isolated fixtures because current invitations support subcontractor Requesters. Memberships, operational roles, administration and company associations used actual APIs. Subcontractors used actual scoped invites and registration. Each identity used normal password login and a separate session; no forged tokens or weakened permissions. No real email was sent or email ownership independently verified. Fixture creation of 500 accounts is not evidence of a product bulk-import UI. Previously agreed internal project-link/code enrollment remains unimplemented.

## 3. Operational findings to preserve

Submission, review, Chief/IM assignment, execution, delay/restart, field inability, same-record correction/resubmission, Need-By/priority changes, reassignment and requester cancellation worked. Recorded events include 155 resubmissions, 107 delays and 44 cancellations. Fresh Survey review remained necessary after corrections.

Scoped offboarding and actual Manager continuity prevented unsafe removal. Central IT review did not become an implicit tenant disable. Initial 44 driver interruptions were recovered through correct actors/fresh state; surge, new-manager and rebalanced waves recorded zero workflow interruptions. Wrong-role and stale-IM attempts were rejected rather than bypassed. Explicit organizational changes retained historical ownership.

## 4. Friction / UX findings by role

| Role | Observation |
|---|---|
| Requester | Login still requires Tenant ID. Internal onboarding remains assisted. Incomplete contact details are rejected and corrected submission succeeds. Only small text attachments were exercised. |
| Party Chief | Complete Work is offered despite being assigned-IM-only, then returns 403. |
| Instrument Man | After reassignment, the former IM correctly cannot complete. Current roster and ticket identity must be refreshed. |
| Superintendent | Need-By change is Manager-only. Explicit reporting plus Area coverage determines visibility; named teams do not grant it. |
| Survey Manager | Promotion gap corrected. Crew relocation requires separate reporting unlink, Area unlink, staffing save and named-team update. Dispatch balancing is an operator policy. |
| Project Admin / Central IT | Admin grant list stops at 100, while paginated member search can find omitted people. Independent admin and operational capabilities remain distinct. |

Final browser observations cover six roles and 18 desktop navigations with zero page/API errors; all six 390 px phone captures have no horizontal document overflow. These are automated observations, not usability interviews or screen-reader acceptance.

## 5. Defects

| ID | Severity / reproduction | Expected / observed | Evidence and failure domain |
|---|---|---|---|
| OPS-F01 | Medium, reproduced at expanded scale | Admin should reach any eligible member. Zoe appears in member search but is absent from the 100-entry admin grant selector; no search/page control for that selector. | friction-reproductions.json, admin-truncated-eligible-members.png; administrators route LIMIT100 / project-administration UI. Required before broader population testing. |
| OPS-F02 | Medium, reproduced on active work | Chief should receive applicable actions. UI offers Complete Work; server rejects 403. Authorization remains intact. | friction-reproductions.json, chief-offered-forbidden-completion.png; crew-work-actions renders by status without actor capability. Recommended before broader human field testing. |
| OPS-F03 | High continuity gap, reproduced 409/400 | Existing Superintendent promotion unavailable while last-manager offboarding blocks firing. | survey-manager-departure-preview.json; role-command contract. Owner-authorized guarded correction implemented and locally verified. |

OPS-F03 evidence:549 normal tests and strict TypeScript; production Linux build; six guardrail checks, four browser checks and nine departure checks. The correction supports the explicitly bounded editable FULL-project/current-Superintendent case; it is not general custom RBAC.

Existing F01-F08 onboarding findings remain in the parent record: assisted first-admin/internal enrollment, exposed tenant UUID, malformed invite errors and existing-account invite acceptance gaps. They were not silently fixed. Verification issues in support/new correction work—wrong-role calls, preflight attachment purpose, checksum binding, native-select automation and stale operator roster—were repaired narrowly. Failed attempts remain in the ledger; the checksum mismatch rejected before effects.

## 6. Permission / isolation findings

Final complete visible-ID comparisons:713 active operational users, zero failures. Earlier 164- and 714-profile audits also passed. Departed users' stale sessions and renewed logins are denied. Six cross-project/tenant checks passed, including a requester with explicit Southbank membership whose own draft is excluded from Northbank results.

Final attachment sample:160 checks, 80 owner download SHA256 comparisons and 80 different-company requester denials, all passed. No company-wide authority was fabricated; ordinary requester access is own records unless an existing explicit capability grants more. Named teams do not confer permissions. Administration was never substituted for Survey workflow authority.

## 7. Performance findings

Recorded HTTP calls: 66, 192; transport errors/timeouts: 0. Status totals: {200: 63622, 201: 2445, 400: 56, 403: 46, 409: 9, 401: 7, 404: 3, 500: 4}. Four 500 responses were deliberately injected administrative-audit failures proving rollback. Other negative statuses include expected validation/permission/conflict probes and driver mistakes, rather than spontaneous scale failures.

Successful non-authentication API client wall times, milliseconds:

| Wave | Operation | Samples | p 50 | p 95 | Maximum |
|---|---|---:|---:|---:|---:|
| initial | reads | 4707 | 13.49 | 18.24 | 46.64 |
| initial | mutations | 3632 | 45.87 | 69.27 | 125.92 |
| expandedSurge | reads | 11105 | 12.99 | 15.69 | 48.28 |
| expandedSurge | mutations | 5356 | 43.97 | 62.22 | 116.17 |
| newManager | reads | 7772 | 14.03 | 17.37 | 41.86 |
| newManager | mutations | 509 | 47.38 | 69.49 | 121.36 |
| rebalanced | reads | 18752 | 12.96 | 15.14 | 48.36 |
| rebalanced | mutations | 2616 | 44.15 | 62.93 | 97.42 |

Final 18 browser navigations to network idle: p 50 607.5 ms, p 95 703 ms, max 703 ms. This includes a fixed quiet interval and is not Core Web Vitals. Authentication is separately recorded in performance.json because bcrypt dominates it. At most 6 parallel submissions and 4 login/read workers were used; this is not 714 simultaneously active humans or a soak test.

Resource JSON samples are retained. During parallel authentication one sample recorded 389.19% Docker CPU (multiple cores) and 232.8MiB memory; an initial idle sample was 235.5MiB. Samples cannot establish peak memory, leak absence or production capacity. No optimization was performed without evidence.

## 8. Data-integrity findings

All eight independently queried anomaly counts are zero: missing events, duplicate public numbers, invalid completion dates, invalid IM role assignments, wrong tenant/company ownership, multiple current assignment-history rows, duplicate completion events, and completed records lacking completion evidence. Final workflow interruptions are empty.

Departures, appointment and reorganization preserve before/after hashes of the relevant ticket, event, file, roster, team and assignment history tables. Reporting/Area/named-team configuration changes were intentional and audited. No historical workload was rewritten to look balanced. Disabled people remain historical members. Files survived the isolated runtime replacements.

## 9. Reporting / KPI findings

All 53 per-shift SQL-versus-dashboard comparisons matched. Final Manager and both Superintendents' counts and cycle averages match independently queried authorized populations:

| Audience | Non-draft | Completed | Active |
|---|---:|---:|---:|
| Taylor, project Manager | 1553 | 1502 | 7 |
| Morgan, Structures/Utilities | 1243 | 1202 | 7 |
| Jamie, Civil | 310 | 300 | 0 |

The 30-day UTC daily activity series independently matches 1553 first submissions and 1502 recorded completions, with zero imported/generated completion exclusions. Logical shift dates were not inserted into KPI event dates. Mean recorded cycle is 3.18 minutes, reflecting acceleration/pauses rather than field productivity. Linked-crew cohorts legitimately change with current reporting/Area assignments; all-date Area history remains.

## 10. Behavioral observations

Types: LAYOUT 534, PERMIT 266, CHECK_OUT 266, AS_BUILT 266, TOPO 266. Initial demand varied 8-48 requests/shift; surge 80-160. Synthetic patterns include clustered intake, late logical hours, recurring frequent users, missing details, corrections, varied planned duration, delays and reassignment. These patterns were generated by the operator/controller, not the application.

### Measured crew rebalance

New cohort:340 records. Busiest-Chief share of assigned requests fell from 48.1% in historical allocation to 8.1% in the new cohort. All 15 crews received work. Relative count dispersion (standard deviation / mean across 15 Chiefs) fell from 1.726 to 0.106. New assigned counts range 18-26; 19 cohort records remain unassigned, including drafts/cancellations/pending review.

| Chief | Final Area | New assigned | Completed | Synthetic planned hours |
|---|---|---:|---:|---:|
| Drew Rivera | Pump Building & Structures | 18 | 18 | 382 |
| Avery Rivera | Pump Building & Structures | 23 | 23 | 490 |
| Casey Rivera | Pump Building & Structures | 18 | 17 | 416 |
| Riley Rivera | Pump Building & Structures | 19 | 19 | 254 |
| Cameron Rivera | Pump Building & Structures | 20 | 20 | 288 |
| Quinn Rivera | Intake & Utilities | 23 | 23 | 516 |
| Reese Rivera | Intake & Utilities | 26 | 26 | 548 |
| Dakota Rivera | Intake & Utilities | 24 | 24 | 506 |
| Blake Rivera | Intake & Utilities | 21 | 21 | 442 |
| Parker Rivera | Pump Building & Structures | 23 | 23 | 366 |
| Emerson Rivera | Site Civil & Outfall | 23 | 23 | 214 |
| Finley Rivera | Site Civil & Outfall | 20 | 20 | 480 |
| Harper Rivera | Site Civil & Outfall | 23 | 23 | 596 |
| Logan Rivera | Pump Building & Structures | 20 | 19 | 378 |
| Rowan Rivera | Pump Building & Structures | 20 | 19 | 370 |

Planned-hour dispersion is 0.255, with per-crew estimates 214-596. These include forecast/draft work and are controller estimates, not application effort fields or measured utilization. Equal counts can involve unequal effort. Baseline and cohort differ in duration/volume; this demonstrates the selected policy, not a causal productivity experiment. Historical concentration remains. Superintendent 12/3 coverage remains a managerial bottleneck to review separately.

## 11. Recommended follow-up

**Required before broader testing**

- Complete and accept approved internal project invitation/access-request onboarding; stop treating fixture bootstrap as successful customer onboarding. Address existing malformed-invite failure handling before uncontrolled invite trials.
- Make admin assignment candidates beyond 100 reachable (OPS-F01), preserving project/tenant authority.
- Independently accept the new guarded Manager appointment across broader role/obligation cases before promoting this rehearsal branch toward release.

**Recommended**

- Render role-applicable Crew Work controls (OPS-F02), retaining server authorization.
- Observe human role workflows, especially multi-step cleanup, effort/readiness-based dispatch and the Superintendent 12/3 coverage split.
- Exercise realistic drawings/files, field devices/accessibility, and dedicated concurrency/soak testing on an isolated deployment; measure before optimizing.

**Deferred / future enhancement**

Custom/individual permissions, automatic effort-aware scheduling, unapproved enrollment expansion and separate Pilot/Owner/Rollout infrastructure gates. Recommendations are not implemented automatically.

## Evidence and restart point

Read summary.json, organization.json, expansion.json, requests.json and append-only ledger.ndjson. Visibility, activity-kpi, balance-results and performance JSON retain reconstructable comparisons. Both departures, Manager handover and reorganization have dedicated evidence alongside role captures and friction reproductions. Credentials/tokens remain in ignored local files.

Production changes are limited to the explicitly approved guarded appointment: Tenancy application/repository, one route, inline admin control, five tests and inventory/documentation. No migration, role enum or external infrastructure. 549 tests/TypeScript and final Linux build pass. UI review disposition: SHIP at local acceptance scope; global visual system unchanged.

Retained Northbank is active under Casey/Taylor, with 713 operational users, 15 reorganized crews and 52 incomplete records (7 active +45 drafts). Continue from logical shift 49 with fresh sessions and retained organization. Jordan/Sam stay disabled. Original dirty Phase 5-RedTeam checkout and production data were preserved. This report does not authorize an external pilot.
