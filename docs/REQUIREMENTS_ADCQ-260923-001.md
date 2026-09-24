# SWRTracker requirements baseline — ADCQ-260923-001

- Status: approved product rules with open design details
- Decision date: 2026-09-24
- Continuation code baseline: `phase5` at `3b28834cbf3eb16afc465b8c0af5305f8ac90421`
- Pilot owner role: Survey authority; named individual pending
Provenance: ADCQ-260923-001 intake directive; user approved it as the replacement for conflicting older SWRTracker rules and selected `phase5` as the continuation code baseline. See `worklogs/LEAD_DECISION_LOG.md` Decision 9.

## Authority and use

These requirements control the product behavior listed below. Conflicting statements in `CLAUDE.md`, `PROJECT_VISION_v2.md`, prior worklogs, or the current implementation are historical design or implementation evidence, not the target rule. Unaffected security, isolation, audit, and architecture controls remain in force. The precise state model, schema, API, UI, and migration strategy require design and verification before implementation. Selecting `phase5` does not accept its old product rules, approve a release, or establish that any deployed data is compatible.

## Approved product rules

| ID | Requirement |
|---|---|
| R01 | Keep V1 focused on the internal Survey/CTS Survey Work Request lifecycle and operational visibility. General-contractor SaaS commercialization and broader construction-management workflows are deferred. |
| R02 | Every SWR belongs to exactly one Project and remains one durable work record through review, execution, return, correction, resubmission, and completion. Preserve its identity and ordered history. A return/resubmission must not create a new SWR or public number. |
| R03 | Required requester intake is Area, Request Type, Point of Contact, Need-By Date, and Request Details. Attachments are optional. An additional mandatory field needs demonstrated operational value; Discipline is not established as required input. |
| R04 | Project Survey structures vary. Configure responsibility by Project and Area so the system can identify who reviews, who coordinates approved field work, and whom the coordinator may assign. One person may hold multiple Survey responsibilities or cover multiple Areas. Changes to current responsibility must not rewrite historical actions or ownership. A setup wizard is a hypothesis, not an approved UI requirement. |
| R05 | Survey Authority reviews and may approve or return a submitted SWR with a documented reason visible to the requester. Approval and Instrument Man assignment are separate. An approved SWR may be unassigned, but it must remain visibly actionable to the responsible Area Party Chief or field coordinator. |
| R06 | A requester may correct a returned SWR and resubmit that same SWR, retaining its identity, public reference, and traceable submission/return cycles. This applies to initial review returns and validated field inability returns. |
| R07 | The requester establishes the initial Need-By Date. Authorized Survey leadership may revise it only with a revised date, documented reason, responsible user, requester notification, and traceable original/current dates. Survey Priority is a separate Survey sequencing decision; changing priority must not silently change Need-By. |
| R08 | The assigned Instrument Man may mark successful work complete directly. Successful completion does not require Party Chief or requester software approval. Preserve completion actor and time, notify the requester, and retain the completed SWR for history. Requester inspection/call remains operating practice unless separately approved as software enforcement. |
| R09 | When field work cannot proceed, the Instrument Man records an unable-to-perform disposition and reason. The responsible Party Chief validates it before the SWR returns to the requester for correction and resubmission on the same record. Standard reasons include Area Not Ready, Missing Information, and Other as examples; the final taxonomy is open. Support explanation when a standard reason is insufficient. |
| R10 | Preserve a traceable history of submission, returns, reasons, resubmissions, dates and revisions, responsible users, approval, assignment and reassignment, field dispositions, completion, and historical Area responsibility. State changes and audit events must remain atomic and append-only; retain tenant/project isolation, stale-write conflict handling, and idempotent mutations. |
| R11 | Provide operational visibility for outstanding, completed, delayed, and approved-but-execution-unassigned SWRs. Demand and cycle measures should be selected for management value and defined precisely. Ticket counts alone must not be treated as employee productivity. |

## Superseded rules in the older specification

- New draft, new ticket number, or `parent_ticket_id` as the normal resubmission path after a correctable return.
- Terminal `FIELD_CANCELED` as the normal outcome of an Instrument Man's correctable unable-to-perform report.
- Mandatory Party Chief approval of successful Instrument Man completion.
- One fixed Survey hierarchy, mutually exclusive Survey responsibilities, or Survey Manager approval for every Project/Area regardless of configured responsibility.
- Title or whitelist derived priority as an automatic substitute for a Survey sequencing decision; priority and Need-By are separate.
- Craft, field channel, department, or other fields as mandatory requester intake without an approved value case.

Historical tickets and events created under older rules remain historical records. Their compatibility mapping is a migration/design decision; this document does not authorize rewriting them.

## Open requirements and design decisions

1. Name the Survey authority pilot owner, product decision owner, one-project operator, requester representative, and data/recovery owner. Measure the current request channel and the value a pilot should demonstrate.
2. Define detailed states, action permissions, multi-responsibility representation, Project/Area coverage and absence handling, and historical responsibility snapshots.
3. Decide whether true withdrawal or stop-work retains a separate terminal cancellation path. Correctable review/field returns must remain same-record returns.
4. Decide any additional mandatory intake fields; specify Point of Contact semantics, lead-time policy for urgent requests, and whether Discipline is explicit, derived, or omitted.
5. Define exact date and priority permissions, notification recipients/channels/retries, return reason taxonomy, attachment behavior, retention, search/filter rules, requester follow-up, and V1 metric definitions.
6. Reconcile existing `phase5` schema and historical `REJECTED`/`FIELD_CANCELED`/`parent_ticket_id` data. Verify migration and lifecycle behavior on an isolated database before pilot acceptance.

## Implementation boundary

This records approved requirements; it does not claim they are implemented. The current `phase5` code and much of the older specification still conflict. Follow the remediation plan in the local SWR Tracker project space, update the product architecture and specification as designs are approved, and verify behavior before any pilot or release decision.
