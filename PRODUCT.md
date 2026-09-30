# SWRTracker

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Construction-project survey teams submit, review, assign and trace survey work requests. Sabine demonstrates Survey Manager → Survey Superintendent → Party Chief → Instrument Man, with requesters and read-only reviewers retaining their own scoped experiences.

## Capabilities and constraints

The owner confirmed a read-only Sabine Historical closeout review: all-history dashboard, coordinated filters, chart drill-downs and compact searchable requests. Leave imported records and lifecycle status unchanged. Preserve server-enforced tenant/project/role/company visibility. Use bounded request pages and database aggregates rather than downloading all records. Existing architecture and approved workflow requirements in docs remain authoritative.

Requester My Requests and field Crew Work expose the shared KPI explorer on demand, with audience-appropriate measures and default views. Chart populations and personnel controls remain server-scoped; ordinary page visits do not fetch analytics.

Survey Manager Operations opens on a project-scoped command overview that separates all-date current request state from daily first-submission and recorded-completion activity. Area, request type, current status, and Party Chief narrow both; UTC activity dates narrow only the activity series (30 days by default, up to 90). Chart selections open the matching authorized Project Review requests; activity dates do not carry into that all-date request review. Show generated completion exclusions and avoid treating request distribution as assignment timing or employee productivity.

Survey Manager Team Management exposes compact, searchable, paginated Personnel and Teams views. Use existing project members only; invitations remain IT controlled. Supported fixed Superintendent/Party Chief/Instrument Man changes require confirmation and sign-in renewal. Removing a survey role retains project membership as Requester. A person belongs to one active named team per project; its Area and member lead describe an organizational group, never automatic operational authority or reporting access. Preserve historical requests and explicit grants; resolve current obligations before role changes. Closed projects expose read-only team details.

## Brand commitments

Follow the supplied Axiom Brand Guide and the existing Live simulation display standards. DESIGN.md records that implemented identity. Favor compact navigation, expandable rows and selectable page sizes.

## Evidence on hand

Anonymized source exports underpin the historical simulation. Attachments and original prose are omitted. Some completion dates and Instrument Man assignments are simulated; source cancellation subtype is unknown. These limits must remain visible. Historical snapshots are not verified audit transition histories or employee-performance evidence.

## Open decisions

Superintendent dashboard crew scope requires an explicit Manager-assigned Superintendent-to-Party-Chief link intersected with the Superintendent's authorized Areas; never infer the link from Area overlap or historical ticket snapshots. The owner approved narrow fixed-role Team Management despite the previous roster-UI deferral, including Superintendent/Chief/IM roles. Explicit staffing/reporting and obligation cleanup controls still need completion. Individual Sabine reporting assignments and the separate unassigned-work population rule remain unresolved.
