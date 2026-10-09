# Quality-of-life assessment and reconciliation (2026-10-09)

Branch: `alpha1-audit-hardening`. Scope authorized by the owner: make containers flow logically so people do not have to scroll "here, there and everywhere", explain disabled actions, and reconcile the friction found. Presentation and flow only; no workflow, authority or persistence rule changed.

## Method

Every main screen was opened for each role (Requester, Survey Manager, Party Chief, Instrument Man, Project/Tenant Admin) at 1280×900 against the disposable review database, and key flows were repeated at 390×844. For each screen the sweep recorded page length in screen-heights, the order of sections, and how far the primary action sits from the fields it depends on. Screens were then inspected visually.

## Findings

| # | Finding | Where | Severity |
|---|---|---|---|
| F1 | **Create team silently disabled.** It needs a lead, but the lead picker sat at the top of the form, filled only after members were added near the bottom, and nothing said so. The same silent pattern exists on many guarded buttons. | Team Management, forms app-wide | High |
| F2 | **Primary actions out of view in long editors.** The Create/Save bar is the last thing on a 3-screen editor, so the outcome of each Add/Remove and what is still missing are invisible. | Team editor, Direct assignment, New Request | High |
| F3 | **Row actions and Status off-screen.** Tables used a fixed pixel width (columns summed to ~1,620 px in a ~960 px panel). Status was column 6 of 7, and the actions were only reachable by scrolling sideways. | Crew Work, All Requests, every `AdministrationRecords` list | High |
| F4 | **Row actions stacked vertically**, making rows 2–3× taller (≈120 px each); 5 review rows took 600 px. | Review Requests, Crew Work | Medium |
| F5 | **Narrow tables.** The same fixed widths left ~45% of the panel empty when there were few columns. | Review Requests, member lists | Medium |
| F6 | **Duplicate pagination.** A local "1–5 of 5" pager rendered under every table, in addition to the server pager ("Page 1 of 1"). | All lists | Medium |
| F7 | **Always-on bulk toolbar.** "0 selected / Clear selection / Select all matching / Export selected" took a full row on every list, including read-only history and empty tables. | All lists | Medium |
| F8 | **Empty tables drew full chrome:** filter box, toolbar, column headers and a "0–0 of 0" pager around "No matching …". | Companies, Areas, invitations | Low |
| F9 | **Upload form before the files.** On a request, the uploader came first and the existing files below it. | Request detail → Attachments | Low |
| F10 | **Back-to-top button covers actions** at the bottom right once a sticky bar exists. | Long forms, mobile | Low |

## Reconciled in this batch

- **F1:** blocked actions now explain themselves. A blocked button stays focusable and, when activated, lists the reasons, outlines every field involved and offers **Show me** to jump to and focus each one. Applied to team create/save/delete and per-person Add, role and staffing saves, Direct assignment, New Request Save Draft/Submit, and request-detail actions (commit `79e56ca`). The lead picker now says "Add members below first" while no members are selected.
- **F2:** a shared `.sticky-actions` bar keeps the decision at the bottom of the viewport while the form scrolls: Team editor, Direct assignment, New Request. The Team editor bar also carries a live summary (name · members · lead · Areas), and the lead picker now sits inside **Selected Members**, right next to the people it chooses from.
- **F3:**
  - Tables fill their panel; saved column widths become minimums.
  - The Actions column is pinned to the right edge, so it stays visible while the other columns scroll.
  - Request lists put **Status** second (Number, Status, Request, Need-By, Area, Type, Priority).
  - Default widths were tuned so that Number fits its chip.
- **F4:** row actions stay on one line (nested action rows included).
- **F5:** resolved by the full-width tables (F3).
- **F6:** the local pager appears only when the loaded rows exceed one local page (25). The server pager hides itself when there is a single page and no offset.
- **F7:**
  - The filter and the tools share one line.
  - **Select all matching** shows only when a row can be selected.
  - The count, **Clear selection** and **Export selected** appear once something is selected.
- **F8:** an empty table shows only its caption and the "No matching …" message.
- **F9:** files are listed first; the uploader follows.
- **F10:** the back-to-top control rises above any sticky action bar (more on small screens).

Measured effect (1280×900, same data): Review Requests 1.8 → 1.3 screens. Crew Work no longer overflows the page, and both Status and actions are visible without sideways scrolling. In the Team editor, Create team and its summary stay in view at both desktop and phone widths.

## Open recommendations (not changed here)

1. **Explain the remaining guarded buttons.** About 300 `disabled` sites exist; the busiest forms are covered. Next: project member wizard, project administration, custom roles, templates.
2. **Request history:** the "SWR History" card nests a second "Recorded Request History" disclosure (double heading), and its table is squeezed into the main column (timestamps wrap to three lines). Suggest one heading, compact timestamp formatting, and a full-width placement below the two-column area.
3. **Company association by raw company ID** asks admins to paste a UUID. Suggest a search-by-name picker.
4. **Invitation History** uses a bespoke table that still shows an empty pager; move it onto the shared table.
5. **Team Area picker** offers two selection mechanisms (row checkboxes and toggle buttons). Keep the toggles only.
6. **Dashboards** repeat a "Recorded Chart Values +" disclosure under every chart. Consider one "Show data tables" toggle per page.
7. **Audit log** shows 50 rows (≈4 screens) with no sticky header. Make the header sticky or use a 25-row default.
8. **Phones:** tables still scroll sideways under the pinned actions. A stacked card layout below 640 px would remove that.

## Compatibility notes

- Maintained browser runners still find **Select all matching** (it remains visible whenever a selectable row exists) and **Export selected** after selection. The local pager remains for tables over 25 rows.
- A blocked button is `aria-disabled` rather than `disabled`. Automated clicks need `force` to open the explanation, and the action itself never runs while reasons remain.
