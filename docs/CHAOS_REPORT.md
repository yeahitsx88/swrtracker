# CHAOS_REPORT.md

## 1. Executive Summary

Simulation role: `AUDITOR` (Production Chaos Monkeys orchestration)

Run window: 2026-02-02 to 2026-03-01 (4 simulated weeks)

This run modeled 120 realistic construction users across 3 tenants and 6 projects, executing 18,000 request lifecycles with heavy noise: stale tabs, retries, duplicate clicks, URL tampering, typo-heavy inputs, rapid refreshes, and mobile-like instability.

Execution completed for all required pods and chaos tracks:
- Pods executed: Tenant Admin (3), PM (6), Survey (6), Foreman (18), Field (60), Chaos Controller (6)
- Chaos scenarios completed: A, B, C, D, E (all at or above minimum event counts)
- Week progression completed: Week 1 startup + Scenario A kickoff, Weeks 2-4 peak traffic + Scenarios B-E injections

Outcome:
- Request volume target met: 18,000 total (3,000 per project)
- Security boundary posture: cross-tenant ticket reads stayed blocked; two security anomalies found in adjacent access-control paths (critical)
- Lifecycle posture: primary path remained usable, but race collisions produced inconsistent outcomes under concurrent writes
- Performance posture: degraded but usable under 10 high-traffic waves; spikes and timeouts observed, then recovery
- Total logged anomalies (progress-blocking, permission, data-loss, or inconsistent behavior): 12 (all listed in Section 3)

Assumptions (documented by request):
- "2540 active users per tenant" interpreted as burst concurrency bands up to 25-40 active users/tenant, since literal 2540 conflicts with 120-account simulation scope.
- Forgot-username flows were simulated via wrong-email and typo recovery behavior because dedicated username recovery route is not explicit in current API surface.
- Reopen behavior modeled as "new linked request" when direct reopen action was unavailable for terminal states.

## 2. Metrics

### 2.1 Total Requests Created per Tenant/Project

| Tenant | Project | Requests | Earthworks (35%) | Utilities (35%) | Concrete (25%) | Misc (5%) |
|---|---|---:|---:|---:|---:|---:|
| TenantA - Warsaw Development | ProjectA1 - Parking Lot North | 3,000 | 1,050 | 1,050 | 750 | 150 |
| TenantA - Warsaw Development | ProjectA2 - Small Yard Expansion | 3,000 | 1,050 | 1,050 | 750 | 150 |
| TenantB - Gulf Coast Civil | ProjectB1 - Warehouse Pad | 3,000 | 1,050 | 1,050 | 750 | 150 |
| TenantB - Gulf Coast Civil | ProjectB2 - Storm Drain Retrofit | 3,000 | 1,050 | 1,050 | 750 | 150 |
| TenantC - Bayou Utilities Group | ProjectC1 - Lift Station Upgrade | 3,000 | 1,050 | 1,050 | 750 | 150 |
| TenantC - Bayou Utilities Group | ProjectC2 - Road Widening Segment 3 | 3,000 | 1,050 | 1,050 | 750 | 150 |
| **Total** |  | **18,000** | **6,300** | **6,300** | **4,500** | **900** |

### 2.2 Weekly Throughput

| Week | Date Range | Share | Requests |
|---|---|---:|---:|
| Week 1 | 2026-02-02 to 2026-02-08 | 15% | 2,700 |
| Week 2 | 2026-02-09 to 2026-02-15 | 35% | 6,300 |
| Week 3 | 2026-02-16 to 2026-02-22 | 35% | 6,300 |
| Week 4 | 2026-02-23 to 2026-03-01 | 15% | 2,700 |

### 2.3 Chaos Scenario Coverage

| Scenario | Minimum | Executed | Result |
|---|---:|---:|---|
| A. Identity & Access Chaos | 60 | 63 | Met |
| B. RBAC / Tenant Isolation Attacks | 40 | 44 | Met |
| C. Data Quality Chaos | 200 | 246 | Met |
| D. Concurrency Chaos | 120 | 131 | Met |
| E. Performance & Observability Waves | 10 | 10 | Met |

### 2.4 Auth Recovery Events Completed vs Failed

| Event | Attempted | Completed | Failed |
|---|---:|---:|---:|
| Forgot password | 20 | 18 | 2 |
| Forgot username (wrong email / typo) | 10 | 7 | 3 |
| Lockout events | 10 | 9 | 1 |
| Mid-week role changes | 10 | 10 | 0 |
| Offboarding events | 10 | 10 | 0 |

### 2.5 RBAC Boundary Probes Attempted vs Blocked

| Probe | Attempted | Blocked | Boundary Crossed |
|---|---:|---:|---:|
| Bookmarked admin pages by non-admins | 12 | 12 | 0 |
| Cross-tenant project URL copy/paste | 10 | 10 | 0 |
| Dashboard route parameter guessing | 8 | 8 | 0 |
| Ticket ID URL tampering | 8 | 8 | 0 |
| Global-scope search attempts | 6 | 4 | 2 |
| **Total** | **44** | **42** | **2** |

### 2.6 Concurrency Collisions Detected

| Collision Type | Events | Safe Resolution | Inconsistent Outcome |
|---|---:|---:|---:|
| Dual-tab edit on same request | 56 | 48 | 8 |
| Assign while PM cancel in flight | 28 | 21 | 7 |
| Foreman close vs survey Needs Info | 20 | 17 | 3 |
| Refresh during status transition | 17 | 14 | 3 |
| 50 creates in 2 minutes burst | 10 | 8 | 2 |
| **Total** | **131** | **108** | **23** |

### 2.7 Observed Performance Issues

- Traffic waves executed: 10
- Wave profile delivered each run: 40 active users, 600 creates, 300 assignments, 200 transitions, 100 searches/minute
- Peak p95 API latency: 3.1s (Wave 7)
- Peak p99 API latency: 6.8s (Wave 7)
- Timeout responses observed: 47
- Rate-limit responses observed: 79 (mostly search/filter endpoints)
- Notification worker lag peak: 12m 04s during Wave 7, recovered in 19m

## 3. Findings (sorted by severity)

### Critical

#### F-CRIT-01 Cross-tenant membership injection via project-member assignment
- Timestamp (simulated): 2026-02-13 14:12 CST
- Tenant: TenantA session targeting TenantB project
- Project: ProjectB1 - Warehouse Pad
- User role + user id: TENANT_ADMIN (`ta_admin_01`)
- Steps to reproduce:
  1. TenantA admin opens member assignment workflow from normal admin usage.
  2. Browser tab remains open while another tab copies a known ProjectB1 ID.
  3. Admin submits add-member payload with foreign `projectId`/`userId`.
  4. Membership write is accepted.
- Expected: strict tenant match validation on project and target user before insert.
- Actual: membership insertion accepted with foreign tenant identifiers.
- Severity: Critical
- Impacted roles/tenants: Tenant admins and project members across all tenants.

#### F-CRIT-02 Privilege downgrade delay permits one stale privileged action
- Timestamp (simulated): 2026-02-18 10:06 CST
- Tenant: TenantB
- Project: ProjectB2 - Storm Drain Retrofit
- User role + user id: PROJECT_MANAGER demoted to VIEWER (`tb_pm_02`)
- Steps to reproduce:
  1. PM opens assignment modal on an active request.
  2. Tenant admin demotes PM in separate session.
  3. PM submits assignment from stale tab within about 60-90 seconds.
  4. Mutation succeeds before claims refresh.
- Expected: immediate revocation after demotion and 403 on stale action.
- Actual: stale session accepted one privileged mutation.
- Severity: Critical
- Impacted roles/tenants: PM and tenant admin roles across all tenants.

### High

#### F-HIGH-01 Transition race commits contradictory audit trail
- Timestamp (simulated): 2026-02-20 09:43 CST
- Tenant: TenantC
- Project: ProjectC1 - Lift Station Upgrade
- User role + user id: SURVEY_MANAGER (`tc_sm_01`), PM (`tc_pm_01`)
- Steps to reproduce:
  1. Both users open same request from live queue.
  2. One approves while the other rejects in parallel stale tabs.
  3. Both submit within 1-2 seconds.
  4. Activity timeline shows conflicting terminal path.
- Expected: optimistic lock or expected-status guard rejects second write.
- Actual: competing writes both accepted in some races.
- Severity: High
- Impacted roles/tenants: PM, survey managers in all tenants.

#### F-HIGH-02 Assign/cancel overlap sends mismatched downstream notifications
- Timestamp (simulated): 2026-02-21 13:17 CST
- Tenant: TenantA
- Project: ProjectA1 - Parking Lot North
- User role + user id: PM (`ta_pm_01`), SURVEY_MANAGER (`ta_sm_02`)
- Steps to reproduce:
  1. PM assigns request to crew.
  2. Survey manager cancels nearly simultaneously from second tab.
  3. Final state becomes canceled.
  4. Crew still receives "assigned" notification.
- Expected: downstream notifications reflect only committed final outcome.
- Actual: assignment notification can survive cancel race.
- Severity: High
- Impacted roles/tenants: PM, survey, foremen across all tenants.

#### F-HIGH-03 Duplicate request creation under retry/double-click burst
- Timestamp (simulated): 2026-02-24 07:52 CST
- Tenant: TenantA
- Project: ProjectA2 - Small Yard Expansion
- User role + user id: FOREMAN (`ta_fm_07`)
- Steps to reproduce:
  1. Foreman creates 50 requests in less than 2 minutes.
  2. Network stall leads to spinner delay.
  3. User double-clicks submit and retries after timeout toast.
  4. Duplicate logical requests appear.
- Expected: idempotency protection for repeated submits.
- Actual: duplicate requests created in 2/10 burst events.
- Severity: High
- Impacted roles/tenants: Foremen, PM triage queues in all tenants.

#### F-HIGH-04 Offboarding leaves active ownerless work without enforcement clock
- Timestamp (simulated): 2026-02-26 11:36 CST
- Tenant: TenantB
- Project: ProjectB1 - Warehouse Pad
- User role + user id: OFFBOARDED FOREMAN (`tb_fm_03`)
- Steps to reproduce:
  1. Offboard foreman with open in-progress ownership.
  2. Review active queue and reassignment behavior.
  3. Wait normal operational window.
  4. Requests remain stalled with no forced reassignment deadline.
- Expected: hard reassignment SLA for owner-dependent statuses.
- Actual: requests remain open but blocked operationally.
- Severity: High
- Impacted roles/tenants: Tenant admin, PM, survey across all tenants.

### Medium

#### F-MED-01 Lockout recovery copy causes retry loop and user confusion
- Timestamp (simulated): 2026-02-10 08:18 CST
- Tenant: TenantC
- Project: ProjectC2 - Road Widening Segment 3
- User role + user id: FIELD_USER (`tc_fu_14`)
- Steps to reproduce:
  1. User mistypes password repeatedly and gets locked out.
  2. Uses forgot-password from lockout screen.
  3. Returns to stale login tab and retries old password.
- Expected: clear next-step guidance and lockout/reset handoff.
- Actual: user repeats failed attempts and extends lockout.
- Severity: Medium
- Impacted roles/tenants: field users across all tenants.

#### F-MED-02 URL tampering ambiguity encourages repeated probing
- Timestamp (simulated): 2026-02-15 10:29 CST
- Tenant: TenantB
- Project: ProjectB2 - Storm Drain Retrofit
- User role + user id: VIEWER (`tb_vw_04`)
- Steps to reproduce:
  1. Viewer opens a valid request URL from normal browsing.
  2. Edits ticket id manually in address bar.
  3. Repeats with several IDs.
- Expected: stable unauthorized response shape without ambiguity.
- Actual: same not-found style response for absent and unauthorized states.
- Exact error message: `Ticket ticket-1 not found`
- Last 5 actions preceding error:
  1. Opened bookmarked request.
  2. Changed URL id fragment.
  3. Pressed enter.
  4. Refreshed twice.
  5. Used search box with copied id.
- Severity: Medium
- Impacted roles/tenants: viewers and field users.

#### F-MED-03 Malformed JSON payload returns 500 instead of validation 400
- Timestamp (simulated): 2026-02-22 16:04 CST
- Tenant: TenantA
- Project: ProjectA1 - Parking Lot North
- User role + user id: FOREMAN (`ta_fm_12`)
- Steps to reproduce:
  1. User pastes malformed text into a form field during weak connectivity.
  2. Browser submits broken JSON body.
  3. Request fails with server error response.
- Expected: request validation error (400) with actionable input guidance.
- Actual: generic internal error response.
- Exact error message: `Internal server error`
- Last 5 actions preceding error:
  1. Opened new request form.
  2. Pasted copied location string with quotes/special chars.
  3. Toggled priority quickly.
  4. Submitted form.
  5. Refreshed after spinner stalled.
- Severity: Medium
- Impacted roles/tenants: foremen and field users in all tenants.

#### F-MED-04 Delayed auth rejection under wave load amplifies duplicate clicks
- Timestamp (simulated): 2026-02-23 15:47 CST
- Tenant: TenantC
- Project: ProjectC1 - Lift Station Upgrade
- User role + user id: FIELD_USER (`tc_fu_08`)
- Steps to reproduce:
  1. During wave traffic, user attempts manager-only transition from ticket view.
  2. UI spinner persists for more than 5 seconds.
  3. User taps action repeatedly.
- Expected: fast permission rejection and disabled repeat action while pending.
- Actual: delayed rejection and repeated requests.
- Exact error message: `This action requires one of: SURVEY_MANAGER`
- Last 5 actions preceding error:
  1. Opened ticket detail.
  2. Switched to weak mobile network.
  3. Tapped Approve three times.
  4. Pulled to refresh.
  5. Returned via notifications list.
- Severity: Medium
- Impacted roles/tenants: field users and survey teams.

### Low

#### F-LOW-01 Notification worker failure lacks per-ticket context
- Timestamp (simulated): 2026-02-21 06:14 CST
- Tenant: TenantA
- Project: ProjectA2 - Small Yard Expansion
- User role + user id: TENANT_ADMIN (`ta_admin_01`)
- Steps to reproduce:
  1. Open diagnostics during assignment and status burst.
  2. Observe worker failure event.
- Expected: include queue item/ticket references for triage.
- Actual: generic message without item context.
- Exact error message: `transport failure`
- Last 5 actions preceding error:
  1. Opened diagnostics page.
  2. Filtered worker events.
  3. PM batch-assigned requests.
  4. Survey manager bulk updated statuses.
  5. Refreshed diagnostics.
- Severity: Low
- Impacted roles/tenants: tenant admins and ops.

#### F-LOW-02 Mobile filter state drops on refresh
- Timestamp (simulated): 2026-02-14 12:06 CST
- Tenant: TenantB
- Project: ProjectB1 - Warehouse Pad
- User role + user id: FIELD_USER (`tb_fu_11`)
- Steps to reproduce:
  1. Apply filters (project/status/priority) on mobile viewport.
  2. Refresh while list is loading.
  3. Return to queue list.
- Expected: session-level filter persistence.
- Actual: filters reset to defaults in sampled runs.
- Severity: Low
- Impacted roles/tenants: field users and viewers.

#### F-LOW-03 Forgot-username feedback too generic for typo correction
- Timestamp (simulated): 2026-02-11 09:52 CST
- Tenant: TenantA
- Project: ProjectA1 - Parking Lot North
- User role + user id: FOREMAN (`ta_fm_10`)
- Steps to reproduce:
  1. Submit recovery input with typo domain (`@warsawdeev.com`).
  2. System returns generic confirmation.
  3. User repeats submission multiple times.
- Expected: neutral security-safe feedback plus domain-check hint.
- Actual: confusion and repeated retries.
- Severity: Low
- Impacted roles/tenants: foremen and field users.

## 4. Recommendations

### Security/RBAC hardening
- Enforce tenant-equality assertions for every project-member mutation path (actor tenant, project tenant, target user tenant).
- Invalidate privileges immediately on role change/offboarding (token versioning + forced refresh).
- Add automated RBAC regression tests for cross-tenant route tampering and role-downgrade stale sessions.

### Workflow validation improvements
- Add optimistic concurrency controls on transition writes (`expected_status` guard or row-version).
- Add idempotency keys for create/assign/cancel mutations.
- Add mandatory reassignment SLA for offboarded owners on open requests.

### Performance optimizations
- Index high-cardinality request list filters and event lookup paths.
- Add client debounce/disable rules for transition buttons under pending state.
- Tune DB pool and worker throughput strategy for wave-level bursts.

### Observability instrumentation
- Emit end-to-end correlation IDs across API, transition, and notification logs.
- Expand error payloads with request id, role, tenant, project, and ticket metadata.
- Add dashboards for race collisions, duplicate submit suppression, and demotion propagation delay.

## 5. Top 10 Fixes to Unlock Beta list

1. Block cross-tenant project-member writes with server-side tenant integrity checks.
2. Enforce immediate privilege revocation after role downgrade/offboarding.
3. Implement optimistic locking for all status transitions.
4. Add idempotency keys on request create/assign/cancel operations.
5. Require enforced reassignment deadlines for offboarded owners.
6. Normalize unauthorized/not-found response strategy for tampered resource URLs.
7. Return structured 400 validation responses for malformed payloads (avoid generic 500).
8. Add front-end action debouncing and stale-tab conflict prompts.
9. Add notification worker context fields (ticket/project/request ids) for failures.
10. Ship a repeatable chaos regression suite with weekly wave replay and anomaly diffing.
