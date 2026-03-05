# Parking Lot Construction Simulation Findings

## Scope
- Tenant: Warsaw Development
- Project: 3 Acre Parking Lot Construction
- Purpose: validate workflow usability, role permissions, request lifecycle behavior, moderate-to-high load handling, and realistic operational mistakes.

## Test Pass 1 (900 Tickets)
- Simulated period: March 2-15, 2026
- Team: Tim Warsaw (Tenant Admin + Project Admin), Paul Martinez (Project Manager), Tom Bescind (Survey Manager), William Foxworthy (General Foreman), Saul Goodman (General Foreman), Ben Nutchins (General Foreman)
- Total requests: 900
  - Earthwork: 300
  - Utilities: 300
  - Concrete: 300

## Pass 1 Authentication and Access Events
- 3 forgotten password events completed.
- 2 incorrect username login attempts recorded.
- 1 locked account event occurred and was resolved by admin unlock.
- Curiosity navigation attempts:
  - Access another role dashboard: denied.
  - Access another user ticket history: denied.
  - Access tenant configuration pages without required role: denied.

## Pass 1 Lifecycle Outcomes
- Closed complete: 811
- Closed after clarification: 61
- Closed after reassignment: 18
- Rejected and not resubmitted: 7
- Canceled terminally: 3

## Pass 1 Operational Exceptions
- Clarification loops: 104
- Reassignments: 42
- Additional survey passes: 29
- PM priority overrides: 17

## Pass 1 Edge Cases (10 Simulated)
- Duplicate request submission: duplicate rejected.
- Incorrect location information: corrected through clarification.
- Wrong project submission: rejected then recreated in correct project.
- Request outside scope: rejected with scope guidance.
- Missing data at survey review: rejected and resubmitted.
- Request submitted after work complete: canceled.
- Conflicting survey requests: reprioritized and sequenced by PM.
- Surveyor unavailable for one workday: backlog + reassignment.
- PM priority override: accepted and processed.
- Foreman edit attempt on closed request: blocked; follow-up ticket required.

## Pass 1 Findings
- Usability friction:
  - No fast "clone prior ticket" path.
  - Wrong-project submissions require manual recreate.
  - Mobile location entry is slower than field expectation.
- Permission behavior:
  - Core role boundaries worked correctly.
  - Some denials lacked actionable messaging for field users.
- Performance:
  - Stable at 900 tickets.
  - Major delays were operational triage, not platform failure.

## Test Pass 2 (5,000 Tickets)
- Simulated period: March 5-18, 2026
- Total requests: 5,000

## Pass 2 Lifecycle Outcomes
- Closed complete: 4,386
- Closed after clarification: 389
- Closed after reassignment: 126
- Rejected and not resubmitted: 57
- Canceled terminally: 42

## Pass 2 Staffing and Role Change Scenarios
- Added Party Chiefs under Tom:
  - Raul Stevens: onboarded successfully as PARTY_CHIEF.
  - Gilbert Hinejosa: onboarded successfully as PARTY_CHIEF.
  - Result: assignment throughput improved and backlog pressure reduced.
- General Foreman replacement:
  - Saul Goodman exited the project.
  - Hank Jaspers was onboarded as REQUESTER with General Foreman title responsibilities.
  - Result: continuity maintained; history/audit retained; new submissions transitioned to replacement user.
- New "Construction Manager" role request for Jill Bettenhouse:
  - True new role creation was blocked by current fixed role model.
  - Workable setup used: Jill added as PROJECT_ADMIN with Construction Manager title/function.
  - Result: admin/config capabilities available; no automatic ticket visibility/approval authority without an additional ticket-visible role.

## Pass 2 Required Edge Cases
- At 1,000 tickets:
  - Liam Edwin (IT) added and assigned PROJECT_ADMIN.
  - Result: assignment succeeded; expected PROJECT_ADMIN behavior observed (project admin capabilities, no inherent ticket visibility).
- At 3,000 tickets:
  - Subscription lapse simulated for one month.
  - Resubscription simulated 60 days later on May 9, 2026.
  - Result: data/ticket history remained recoverable after renewal; however, subscription lifecycle is not modeled as a first-class product workflow and required admin/process workarounds.
  - Constraint confirmed: archived projects in v1 have no unarchive path.

## Consolidated Findings Across Both Passes
- What worked well:
  - Core ticket lifecycle and role enforcement remained stable under both moderate and high load.
  - Party Chief onboarding and foreman replacement were operationally viable.
  - Audit/history continuity held across staffing transitions.
- Gaps observed:
  - No native support for creating new custom role enums (for example, Construction Manager) without spec + code changes.
  - No first-class subscription-state lifecycle controls tied directly to project operational state.
  - Field UX still needs faster repeat-ticket and location capture workflows.
