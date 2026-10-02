# Design assessment brief — SWRTracker compared with construction and field-service products

Date: 2026-10-01. Branch `phase5-261001-review`.

**Status:** read-only assessment. It changes no code or design tokens and does not override [DESIGN.md](../DESIGN.md), [PRODUCT.md](../PRODUCT.md) or owner decisions in the [decision log](worklogs/LEAD_DECISION_LOG.md). Several recommendations touch approved decisions; those are marked **owner decision**. Companion to the [Phase 5 review brief](PHASE5_REVIEW_BRIEF_20261001.md).

## Scope and method

- **Product observed:** the local Sabine preview (`127.0.0.1:3106`, image `swrtracker:sabine-drafts-20260930`). The newest Area-unlink Manager controls (Batch 78) are not in that build.
- **Captures:** 24 full-page screenshots taken with headless Chrome. Five roles (Survey Manager, Requester, Party Chief, Instrument Man, Project IT) at desktop **1440×900** and phone **390×844**. Pages were only loaded; no actions were taken and no data changed.
- **Screens covered:** Survey Operations, Team Management, Project Review (live and historical), My Requests, New Request, Drafts, request detail, Crew Work (Chief and IM), Crew Approvals, Project Admin.
- **Screenshots are not committed.** They show Sabine simulation data derived from source exports, and the simulation docs say not to treat it as suitable for public release. Re-capture locally when needed.
- **Comparison basis:** public release notes, design-system documentation and help pages for Procore, Fieldwire (Hilti), InEight and ServiceTitan (see Sources). I did not log into those products. Characterizations are general and should be validated hands-on before any design commitment.

---

## 1. Verdict

SWRTracker is **clean, consistent, accessible and faithful to the Axiom identity**. It currently presents as a well-made **internal form-and-report tool**, not a **field operations product**.

The gap to Procore, Fieldwire, InEight and ServiceTitan is not color or polish. It's three structural things:

1. **Navigation architecture:** where project sections live and how much of the screen goes to chrome (header, title, buttons).
2. **Information density:** what each list row tells you without opening it.
3. **Field context:** location, photos, overdue and urgency cues.

Most of the highest-value fixes are small, and they work within the existing brand rules.

## 2. Current strengths (keep these)

| Strength | Evidence |
|---|---|
| Disciplined identity | One blue family, restrained orange, Roboto throughout, clear heading hierarchy; nothing off-brand on any captured screen. |
| Accessibility baseline | 44 px targets, visible 3 px focus ring, reduced-motion paths, labeled native controls. Comparable to ServiceTitan's Anvil2 practice of treating WCAG 2.2 AA as a deliverable. |
| Responsive integrity | No horizontal overflow at 390 px. Filters and charts stack correctly. Primary field actions ("Start Work") are large, full-width targets. |
| Honest data framing | Charts disclose scope, generated data and "not employee productivity". Uncommon in competitor dashboards and valuable for trust. |
| Team Management | The most product-grade screen: clean rows, search, page size, clear actions. |

## 3. Findings

Severity:
- **High:** visibly undermines credibility or field usability.
- **Medium:** a noticeable gap against competitors.
- **Low:** polish.

### D1. Internal codes and developer copy are visible to users (High, quick win)
- **Raw codes:**
  - Request type shows as `LAYOUT`, `CHECK_OUT`, `AS_BUILT` ([ticket-card.tsx:18](../src/components/tickets/ticket-card.tsx), [ticket-details.tsx:17](../src/components/tickets/ticket-details.tsx)).
  - Priority shows as `NORMAL` ([ticket-details.tsx:24](../src/components/tickets/ticket-details.tsx)).
  - The `docs/CLAUDE.md` status display rule is that codes are never displayed raw. Statuses already follow it through `TICKET_STATUS_LABELS`; types and priority don't.
- **Developer copy:**
  - "Mobile-first field request and crew execution surfaces." appears under every project title ([project-shell-header.tsx:27](../src/components/ui/project-shell-header.tsx)).
  - "Backend validates transitions and permissions." appears on Crew Work ([crew/work/page.tsx:43](../src/app/(projects)/projects/[projectId]/(crew)/crew/work/page.tsx)).
- **Competitors:** all four keep UI copy task-focused.
- **Recommendation:** add display-label maps for type and priority next to the status map. Replace or remove the two developer strings.

### D2. Status color is positional, not semantic (High)
- **Evidence:** two separate palettes are assigned by data order: [project-review.tsx:17](../src/components/tickets/project-review.tsx) and [kpi-charts.tsx:15](../src/components/ui/kpi-charts.tsx).
  - The same status gets different colors on different screens. Completed is light blue on Operations and gray on Project Review; brown means Approved on one and In Progress on the other.
  - The danger red (`#b23833`) can land on ordinary states such as "Submitted" or "Returned for Correction".
  - Badges are small pastel pills.
  - A crew card whose need-by date has passed (Sep 28) carries no overdue cue.
- **Competitors:** Procore, Fieldwire and ServiceTitan use fixed, system-wide status colors, plus distinct cues for priority and past-due.
- **Recommendation:**
  - One `status → token` map, used by badges, legends, bars and donuts.
  - Reserve red for genuine exceptions (overdue, canceled, field inability).
  - Add an overdue/urgent indicator (icon plus text, not color alone) on cards, rows and detail.
  - Record the map in DESIGN.md.

### D3. Lists are phone cards on every screen size (High)
- **Evidence:** a requester's 14 requests render as a **3,410 px** tall stack of cards at 1440 px.
  - Each card shows only number, raw type, "Requested by: You", need-by date and a full-width "Open Details" button.
  - **No Area, no description, no overdue flag.** Requests can't be told apart without opening each one.
  - Crew Work nests a card inside a card.
- **Competitors:** Procore and InEight use dense, sortable tables with saved filters. Fieldwire uses compact task rows with status, priority, assignee and due date, plus swipe actions on mobile. ServiceTitan uses tables and a dispatch board.
- **Recommendation:**
  - A responsive list component: a table at 760 px and wider, cards below.
  - Show Area, a one-line description, need-by with overdue state, status, and assignee where the role permits.
  - Make the whole row or card the link. Drop the "Open Details" button and the nested card.
  - Keep the existing selectable page sizes and expandable rows (PRODUCT.md).

### D4. The first phone screen is mostly chrome (High for field roles)
- **Evidence:** on an Instrument Man's 390×844 Crew Work screen, the following come before any work: logo, greeting, project title, developer subtitle, tab, intro text, "Crew work trends" prompt, Refresh and a rows selector.
  - The **first work card starts at about 720 px**, so only its header is visible without scrolling.
- **Competitors:** Fieldwire opens directly into Plans/Tasks with a "My tasks" shortcut. Field apps generally put the work list first.
- **Recommendation:**
  - A compact phone header (icon lockup within the DESIGN.md clear-space rule, project name, menu).
  - Move intro text, "Explore charts", Refresh and Rows into a toolbar or overflow.
  - Target the first work card above about 300 px.

### D5. Navigation architecture (Medium; owner decision)
- **Current:**
  - Account navigation is a right-side overlay; Decision 16 approved this and declined moving it left.
  - Project sections (Operations, Team Management, All Requests) are a row of bordered buttons that scroll away.
  - Data screens sit in a centered 1120 px column ([globals.css:53](../src/app/globals.css)), leaving about 160 px empty on each side at 1440 px.
- **Competitors:** Procore uses a persistent project header with a tool switcher; ServiceTitan a persistent left nav; Fieldwire a web sidebar and mobile tab bar.
- **Recommendation (keeps Decision 16 intact):**
  - Leave the account overlay as approved.
  - Make the **project section nav** a sticky, compact tab bar under the header on desktop, and a **bottom tab bar** on phone for the two to four role-relevant sections.
  - Let data-heavy screens (Operations, Project Review, Team Management) use a wider fluid container. Keep forms and detail pages at a readable measure. Changing the documented 1120 px rule is an owner decision.

### D6. The request detail page reads as a document, not a work record (Medium)
- **Evidence:**
  - A single column of "Label: value" lines, with the status badge small at the far right. The **Area isn't shown** in the fields.
  - History interleaves status events with notification "Delivery: Queued" entries, each in its own bordered box. "Approved" and "Submitted" each appear twice, and delivery state is shown to requesters.
- **Competitors:** a header (number, title, status, primary actions), a two-column field grid, and an activity feed with icons on a timeline line, with comments and photos inline.
- **Recommendation:**
  - Header block with status and actions; two-column field grid at 760 px and wider, including Area.
  - Fold notification delivery into the owning event, shown to staff only.
  - A light timeline line instead of boxed entries.
  - Consider opening detail as a side panel from desktop lists.

### D7. Too many borders, inconsistent components (Medium)
- **Evidence:**
  - Nearly every element is a bordered box: buttons, page nav, cards, nested cards, filter panels.
  - Tabs look like bordered buttons in project nav but underlined tabs in Operations and Team Management.
  - Desktop settings stretch a two-digit "Lead-Time Days" input and the "Save Configuration" button to about 1,030 px.
- **Recommendation:**
  - Use spacing and single dividers instead of nested borders.
  - One tab component.
  - Settings layout: label and help on the left, control on the right, with controls at content-appropriate widths and buttons at natural width.
  - Keep square buttons (owner-approved).

### D8. Charts are functional but generic (Low to Medium)
- **Evidence:**
  - The donuts have long separate legends.
  - The 30-day demand line is flat with a single spike (demo data).
  - "Average cycle 0.0 h" shows when no valid pairs exist.
  - The Request mix bars clip at the lane edge.
- **Recommendation:**
  - Inline or adjacent legends tied to the D2 status map.
  - Explicit low-data and empty states instead of `0.0 h`.
  - Sparklines on KPI tiles.
  - Fix the clipping.

### D9. Missing field context (Medium; partly deferred)
- **Evidence:** Area is a plain dropdown and attachments are a file list.
- **Competitors:** Fieldwire is plan-first, with tasks pinned to drawings. Procore pairs work with drawings and photos.
- **Recommendation (within deferrals):**
  - Show the full Area path as a breadcrumb (e.g. Train 1 › CWA-1100).
  - Photo thumbnails for image attachments, and camera capture on the field-support upload.
  - The in-browser DWG viewer stays deferred (docs/CLAUDE.md §15). A static plan or area thumbnail per AOR node would be a lighter step if the owner wants one.

---

## 4. Competitive positioning

| Dimension | SWRTracker | Procore | Fieldwire | InEight | ServiceTitan |
|---|---|---|---|---|---|
| Overall character | Clean, airy, form-centric | Dense enterprise; 2025 work modernizing tools onto a shared "NGX" design | Plan-first, simple, mobile-native | Desktop-heavy capital-project suite; ribbon and grid UIs | Polished SaaS on a mature system (Anvil2) |
| Navigation | Account overlay plus scrolling section buttons | Persistent project header and tool switcher | Web sidebar; mobile Plans/Tasks tabs | Module launcher; multi-window workflows | Persistent left nav |
| Lists | Cards at all sizes | Tables, filters, saved views | Task rows, "My tasks", swipe to complete | Dense data grids | Tables plus dispatch board |
| Status language | Positional, inconsistent | Systematic | Systematic, with priority | Systematic | Tokenized |
| Field context | Area dropdown, file list | Drawings, photos | Plan pins, photos, offline | Documents and controls | Jobs, technicians, map |
| Accessibility | Strong baseline | Mixed | Mixed | Weaker | Strong (WCAG 2.2 AA goal) |

**Target position:** *Fieldwire-like simplicity on the phone, Procore-like list rigor on the desktop, inside the Axiom identity.* Don't chase InEight-level density. SWRTracker's users are requesters and field crews first, and estimators or controls staff not at all.

---

## 5. Recommendations and sequencing

No new dependencies are required for any item below. All of them preserve the Axiom palette, Roboto, square buttons and the Decision 16 account overlay unless marked otherwise.

| # | Change | Fixes | Effort | Notes |
|---|---|---|---|---|
| 1 | Label maps for type and priority; remove developer copy | D1 | Hours | Add a test that no raw enum reaches requester-facing text |
| 2 | Single status color map used by badges and every chart; overdue/urgent indicator | D2, D8 | 1–2 days | Record in DESIGN.md; check contrast for each pair |
| 3 | Card content: Area, one-line description, overdue; whole card is the link; no nested cards | D3, D4 | 1–2 days | Applies to My Requests, Crew Work and Approvals |
| 4 | Compact phone header; move intro, charts and refresh controls into a toolbar | D4 | 1–2 days | Verify logo clear space per DESIGN.md |
| 5 | History: fold delivery into events, staff-only; timeline styling | D6 | 1 day | Keeps the R10 trace intact; display change only |
| 6 | Settings layout with bounded control widths | D7 | 1 day | Admin and request-config screens |
| 7 | Responsive list/table component (table at 760 px+, cards below) | D3 | 3–5 days | Reuse the existing filters, paging and expandable rows |
| 8 | Detail page: header, two-column grid, side-panel option | D6 | 3–5 days | |
| 9 | Sticky section tab bar on desktop, bottom tab bar on phone; fluid width for data screens | D5 | 3–5 days | **Owner decision** (changes the DESIGN.md layout rule) |
| 10 | Area breadcrumb, photo thumbnails, camera capture for field-support uploads | D9 | 2–4 days | Static plan thumbnails per AOR are an **owner decision** |

**Suggested order:** items 1–6 as one visual-quality pass, because they are low risk and immediately visible. Then items 7–8, which have the biggest effect on daily use. Items 9–10 follow owner review of mockups.

**Acceptance for each item:**
- Re-capture the same 24 screens at 1440 and 390 px and compare.
- Rerun the existing keyboard, reduced-motion and contrast checks.
- Make no behavior, permission or data-scope changes; these are presentation changes only.

## 6. Open owner decisions

1. Whether data-heavy screens may exceed the 1120 px container (D5).
2. Whether to add sticky section tabs on desktop and a bottom tab bar on phone, alongside the approved account overlay (D5).
3. Whether static plan or area imagery per AOR node is in scope before the deferred DWG viewer (D9).
4. Whether a designer should produce mockups for items 7–9 before implementation. Recommended, given these are the first structural UI changes since the Axiom foundation.

---

## Sources

- Procore — [more intuitive homepage and templates page](https://www.procore.com/whats-new/save-time-with-a-more-intuitive-look-and-feel-homepage-and-templates-page); [modernized Specifications page (NGX design)](https://www.procore.com/de/whats-new/modernized-specifications-information-page); [modernized PDM tool navigation](https://www.procore.com/fr/whats-new/improved-navigation-with-a-modernized-pdm-tool-experience); [design system portfolio reference](https://dorazi.myportfolio.com/procore-design-system)
- ServiceTitan — [About Anvil2](https://anvil.servicetitan.com/docs/about-anvil2); [Anvil insights Q2 2025](https://anvil.servicetitan.com/blog/posts/2025-10-01-anvil-insights-q2)
- Fieldwire — [Use Fieldwire on Mobile](https://www.fieldwire.com/support/fieldwire-on-mobile); [ClockShark Fieldwire review](https://www.clockshark.com/Blog/fieldwire-review)
- InEight — [Estimate new user experience](https://ineight.com/news/ineight-estimate-delivers-new-user-experience/); [InEight Document redesign (Power Magazine)](https://www.powermag.com/press-releases/ineight-reimagines-capital-project-document-management-with-all-new-ineight-document/)
