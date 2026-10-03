# Fresh startup demo walkthrough

This walkthrough starts with Tenant IT, establishes a Project Admin, and then creates the first Survey Manager. The user drives the demo; observations and gaps will be recorded here. No application code changes are authorized.

## Starting position

- Prepared on October 3, 2026, using the existing Alpha 1 production image.
- Demo address: http://localhost:3120/login.
- Tenant: Fresh Startup Demo.
- Initial identity: Demo Tenant IT, with tenant administration authority only.
- Initial inventory: one user, zero projects, zero Project Admin grants, and zero operational memberships.
- One GC company exists because the initial identity requires a company association.
- The database, attachment storage, and runtime are separate from existing demos.
- Credentials are stored in the ignored local access file and are excluded from these notes.

## Assisted setup

The tenant, GC company, and initial Tenant IT account were provisioned directly in the new database after applying existing migrations 001 through 034. This prepares the starting position; it does not demonstrate application onboarding.

## Walkthrough observations

The user signed in as Demo Tenant IT and created **Bronco Station Residential Dev.** The project appears as **Setup** in Administered projects. The user opened its administration screen and supplied four annotated screenshots on October 3, 2026. Establishing a separate Project Admin has stalled; no additional accounts or grants have been arranged by the assistant.

The findings below combine the supplied screenshots with a read-only source trace. Proposed interface changes have not been implemented, and no runtime data was changed while reviewing these annotations.

### Comment 1 Template creation has no visible entry point

**Observed:** Create Project offers Existing project template and No template, with no visible creation or management action.

**Source trace:** Template create, update, and delete APIs already exist and require Tenant IT. The current template definition contains a name, crew build, Area of Responsibility depth and level labels, and discipline groups. The project creation and administration components expose selection only; no template editor was found in the current frontend.

**Proposed flow:** Add a Tenant IT entry point labeled Manage project templates beside project creation, with Create template available when the list is empty. Keep No template available so an optional reusable preset does not block the first project. Create or edit the existing supported template fields, then return to the project form with its entered name retained and the saved template selectable.

**Decision still needed:** Whether later saving an existing project's configuration as a template is desired. The current template contract should not be presented as copying employees, permissions, requests, or a complete project.

**Acceptance target:** Tenant IT can discover and create the first template from the project creation screen, then select it without losing the project form. Shared template administration remains within the tenant.

### Comment 2 Tenant IT sees a misleading membership error

**Observed:** The project administration page loads, but the header displays 403 AUTH_FORBIDDEN: You are not a member of this project with Retry greeting.

**Source trace:** AccountShell requests the current account with project context. getMyAccount calls getProjectRole, which requires an operational project membership. Project administration uses resolveProjectCapabilities, which separately permits eligible Tenant IT without that membership. The two checks explain why administration is visible while the greeting fails. Creating a project does not automatically add its creator as an operational member.

**Proposed correction:** Load the greeting from the authenticated tenant account. Resolve administrative and operational project context independently, allowing Tenant IT to use tenant-scoped administration without creating an artificial operational membership. Present the actual project name in the administrative context even when the user has no operational assignment. Do not suppress genuine authentication, missing-project, or foreign-tenant errors.

**Owner clarification:** Everything means **all administration screens within the tenant**. Operational survey data access continues to follow the existing role and project scope. This clarification is consistent with the current independent administrative capability model.

**Acceptance target:** Tenant IT opens a newly created project's administration screen with a valid greeting and administrative navigation, without a membership error. Cross-tenant access remains refused.

### Comment 3 Preserve the administered projects section

**Owner feedback:** The administered-projects section is an awesome implementation.

**Design direction:** Preserve its collapsible section, project inventory, filter, sort, selection, export, status, and Open administration action. Use this established visual treatment for the missing setup controls. No redesign is requested.

### Comment 4 First Project Admin onboarding is blocked

**Observed:** The eligible-accounts and admin-candidates lists are empty. No visible action creates or invites an internal employee who can become Project Admin.

**Source trace:** The eligible-account list requires an existing active tenant account whose company is already associated with the project. The admin-candidate list additionally requires existing project membership and a GC or owner-representative company. The current invitation route creates subcontractor Requester invitations only; it cannot onboard the first internal GC employee through the supported flow. A blank candidate table gives no usable next step in a fresh tenant.

**Owner requested flow:** Offer both Select existing employee and Invite new employee. For an invitation, Tenant IT supplies the individual's email; the recipient accepts and creates a profile; Tenant IT can then select that person and grant Project Admin authority. Keep the fixed Project Admin capability separate from any operational role. The comment's project manager wording is interpreted as Project Admin in this walkthrough, not a new role.

**Proposed interface:** Put these two actions directly in the Project Admin section. Search eligible existing tenant employees there instead of requiring the operator to infer a separate company-association and membership sequence. Show missing prerequisites explicitly and review the necessary project association before granting administration. Show pending invitations separately with a visible status; invite acceptance alone does not silently grant Project Admin authority. After acceptance, refresh the candidate list and allow an explicit reviewed grant.

**Proposed invitation contract:** Bind the invitation to the tenant, intended email, company, and intended project. Record pending, accepted, expired, and canceled states. Invitation acceptance creates the account/profile and the explicitly reviewed project association; Project Admin authority is granted afterward. Existing approved enrollment guidance uses Requester as the default project role, with additional authority assigned separately. Confirm the exact internal invitation contract before implementation. Demo email delivery also needs a deliberate local mechanism; no external mail was sent.

**Acceptance target:** A tenant with only Tenant IT can establish its first separate Project Admin through visible supported actions. Both existing-employee and new-employee paths work; pending or expired invitations grant no administrative authority. The new Project Admin can administer only assigned projects.

**Next walkthrough dependency:** The first Survey Manager will need the same supported existing-employee or internal invitation path, accessible to the scoped Project Admin, followed by an explicit Survey Manager role assignment. This has not yet been exercised.

## Current disposition

### Follow up Company registration review is off screen

**Owner report:** Project Admin creation is still unavailable. Clicking Review company registration appears to do nothing after entering Site Development Co and choosing SUBCONTRACTOR. Four further screenshots show the empty personnel/admin lists and the enabled registration button.

**Live observation:** The current browser contains a pending Confirm project administration section titled Register Site Development Co for this project. Its confirmation checkbox is unchecked and Confirm action is disabled. The project company inventory is still empty. The assistant inspected the current page without clicking, confirming, or submitting anything.

**Source trace:** Review company registration sets a proposed intent. The shared review section is rendered after Project diagnostics, separated from the initiating company form. The handler does not scroll to the review or move focus to it. Only the later Confirm action submits the registration request. The evidence supports an undiscoverable pending review, not a failed registration request.

**Immediate walkthrough guidance:** Scroll below Project diagnostics to the review, inspect the action, and use the checkbox and Confirm action if the registration is intended. Creating a subcontractor company does not create an internal employee or a Project Admin candidate.

**Proposed correction:** Keep the review beside the initiating form, or use a clearly titled accessible review dialog. Show the company name, readable company type, and affected project; bring the review into view and move focus appropriately. Provide Confirm and Cancel, restore focus afterward, and keep submission outcomes visible at the action. Preserve the existing confirmation and exact uncertain-retry behavior. Apply the same review discoverability principle to other administrative actions using the shared review section.

**Acceptance target:** Clicking Review company registration visibly opens the intended review at the current interaction point. Keyboard users reach it immediately. Cancellation creates no company; confirmation creates one intended project association, with visible success or an actionable error. These are future acceptance targets; no tests or implementation changes were made.

**Recurring Project Admin stall:** The previous findings were documented only. No internal employee onboarding or template editor has been deployed, and the greeting mismatch remains visible. The fresh demo still cannot establish its first separate Project Admin through the supported UI.

| Annotation | Classification | Next action |
| --- | --- | --- |
| 1 | Missing template management UI | Design a visible editor using the existing template contract. |
| 2 | Account context authorization mismatch | Separate tenant greeting from operational membership and allow all tenant administration screens. |
| 3 | Positive design feedback | Preserve the inventory design. |
| 4 | Missing internal employee onboarding | Design both employee selection and invitation, with a separate reviewed admin grant. |
| Follow up | Company review opens off screen | Bring the pending review into view at the initiating action and show its outcome there. |

At the end of the notes-only annotation review, the walkthrough was paused at first Project Admin onboarding. The findings above record that historical state. The owner subsequently authorized implementation; see the current disposition below.

## Planned sequence

1. Sign in as Tenant IT and inspect the fresh starting position.
2. Create the first project and establish its Project Admin.
3. Sign in as that Project Admin and create the first Survey Manager.

Pause at any unsupported step and record the gap before arranging assistance.


## Authorized implementation and current disposition - 2026-10-03

The owner authorized fixing first Project Admin onboarding, then extended the request to foreground company registration and benefiting administration creation/review (Decisions51-52). The app on localhost:3120 now includes employee selection/invitation and the shared AdministrationDialog standard. The existing Bronco Station project, account and database were retained; no assisted employee account, admin grant, company or invitation was created during visual inspection.

Company registration: choose new/existing -> name/type or tenant company search -> explicit project association review -> saved company name/type/reference in the same dialog. New-company registration associates the company with this project. Cancellation before confirmation creates nothing.

First Project Admin (superseded by connected setup below): the initial implementation used Select existing employee, or Invite new employee. New recipients created their own profile/password; the operator refreshed employees afterward and separately reviewed an admin grant. Existing operational roles and disabled-access restrictions were preserved.

| Administration action | Current interaction |
| --- | --- |
| Create project | Name -> template/crew configuration -> review -> Setup result and Set up Project Admin link |
| Create project template | Name -> supported crew/Area hierarchy/discipline fields -> review -> result |
| Register/associate company | Guided wizard with named tenant picker; no ordinary UUID entry |
| Establish Project Admin | Candidate-first/employee-first/existing-profile -> tenant/existing/new company -> reviewed invitation -> acceptance on the same record -> reviewed assignment/result |
| Add project members | Foreground eligible-account/role selection followed by guarded batch review/result |
| Grant/revoke Project Admin or company view | Foreground single/batch review, preserving operational roles |
| Invite subcontractor requester | Email -> associated company -> review -> saved registration link |
| Remove project/tenant access | Foreground blockers, reason, confirmation and retained-history outcome; selected people advance inside the dialog |
| Central IT review | Foreground review editor; separately required tenant account action opens its guarded dialog |
| Appoint Survey Manager | Foreground existing staffing/coverage preview and confirmed handover/result |
| Resolve Survey Reviewer grant | Foreground supported obligation/replacement workflow on admin page; shared operational editor retained |
| Recommission archived project | Foreground retained-evidence/readiness workflow; no history reset/access restoration |
| Deleted draft recovery | Foreground reason/result/errors; independent Project Admin requirement retained |
| Request configuration | Foreground settings/save/result; keyed retry and conflict reload |
| Template selection, whitelist, archive | Foreground existing reviewed action/result |
| Diagnostics | Foreground authorized read/result |
| Filter/sort/page/export/copy/refresh and navigation | Direct behavior preserved; no unnecessary popup |

Picker presentation omits duplicate local filtering, selection/export and local pagination inside server-paged employee/company pickers. Standard inventories retain existing controls.

Evidence and limits: strict TypeScript/unused-symbol compilation and pinned production Docker build passed. Bounded browser visual inspection covers non-submitted task surfaces. Inspections do not establish mutation, concurrent retry, fault rollback or cross-role release coverage. No automated test suites were added or run for this patch. Prior Alpha1 results remain historical baseline evidence.

Runtime retains the private environment/database/attachment volume. Previous web containers and a private pre-change database backup remain for rollback. Registration URLs/tokens and credentials are excluded from these notes. See [the administration standard](../../docs/administration-dialogs.md) for the shared contract and inspection limits.


### Visual inspection record

- Company name/type/review reached on desktop and390px mobile in light mode; the example was canceled without submission. Existing-company search displayed Demo General Contractor by name.
- Existing employee picker displayed the sole Demo Tenant IT account and separate reviewed grant; the grant was canceled without submission. Final picker uses one server search and one page navigation.
- Employee invitation input inspected in desktop/mobile dark mode. The original light preference was restored. These two appearance saves are the only inspected setting writes; tenant branding is unchanged.
- Project and template creation inputs opened/canceled. Add-members empty state and request-configuration editor opened/canceled. Escape dismissed company association and restored focus to its entry button. Configuration keeps its entry mounted during refresh; reviewer inspection retains its trigger for native focus restoration.
- The browser remains at the current tenant's project administration for the user. Screenshots show an unsubmitted company review and employee invitation input, with no invitation tokens or credentials.

## Connected setup correction - 2026-10-03

The owner identified a disjointed invitation/grant flow and requested a live new-tenant walkthrough (Decision53). The project result now directs to Set up Project Admin. A single setup entry offers inviting the future administrator, inviting an employee profile first, or using an existing employee. The existing fixed independent Project Admin authority is assigned after acceptance; there is no custom role definition step.

Company selection explicitly offers Tenant company, Previously created company and Create new company. Tenant choices are the named internal companies with active Tenant IT affiliations, restricted to current project company scope for local admins. There is no canonical tenant-company field in the schema, so multiple affiliations are shown rather than guessed. Company registration reuses the shared wizard, keeps the parent invitation mounted and its command ownership held, and returns with the new company selected. Canceling that child preserves prior invitation values.

Invitation purpose is retained in the atomic administrative event. The setup inventory shows awaiting profile acceptance, ready to assign Project Admin, and assigned. Accepted invitations identify their bound current active employee and expose assignment directly. Acceptance creates Requester membership only. Disabled profiles/access are not offered for a new grant. Pending link creation still does not send email; the local demo makes that delivery status explicit.

The owner also hit a Login/Projects redirect loop. Cookie presence was redirecting away from Login while the protected layout rejected that stale cookie. Authentication pages now remain reachable; protected layouts/APIs retain authoritative session checks.

Current verification: strict/unused TypeScript and production build passed; two login-entry regression checks passed. Broader automated route checks were stopped after automatic approval review required explicit test authorization. The live tab is currently an error document blocked by the browser URL policy; the owner has been asked to reopen the corrected demo. Live acceptance and final grant are pending, not claimed complete.

### Resumed live walkthrough - 2026-10-03

- Reopened browser and signed in with the existing Demo Tenant IT credentials. Login reached Projects without a redirect cycle.
- Created a separate Project Admin Workflow Walkthrough project in SETUP through the normal project wizard. Project reference: e3acef37-8c38-4bbc-a23f-dcfce964bd21. Existing Bronco Station project was preserved.
- Opened setup from the project result. Tenant company preselected Demo General Contractor by its current Tenant IT affiliation.
- Created Walkthrough Internal Company as a GC from inside the invitation. The company was associated with the new project; returning selected it without leaving setup. Then selected Tenant company again for the intended administrator.
- Created the candidate-first invitation for walkthrough-admin@startup.example.test. The same dialog shows Awaiting profile acceptance and the explicit unsent local delivery status. No Project Admin grant was made.
- Opened the bound registration page in a second tab and prepared the synthetic name Walkthrough Project Admin. Stopped before credential entry; Computer Use policy requires the user to enter the new password and complete submission. The Tenant IT tab keeps the pending invitation open; do not sign into the recipient before checking acceptance if using the same browser cookie session.
- Screenshots: company-in-invitation.jpg proves the selected new company after return; profile-acceptance-handoff.jpg shows the prepared registration form without credentials or invitation token. Final profile acceptance, reviewed assignment, employee-first branch and mobile inspection remain pending. Automated route checks remain paused awaiting explicit authorization.


### Guidance refinement and member enrollment - 2026-10-03

- Live tenant administration now identifies Project Admin1 as the accepted, assigned administrator. The owner completed profile acceptance and assignment; the agent did not create their credential or perform that grant. Original pending notes above describe the earlier checkpoint.
- Decision54 moves optional procedure text into heading help with pointer, keyboard and touch support. Help stays within viewport bounds and Escape dismisses it. Active statuses, required labels, errors and mutation review remain visible. Project Admin setup now offers future-admin invitation or existing employee selection only.
- Four administration workspaces: Admin & personnel, Companies, Survey, Project settings. Member records show separate operational role and independent Project Admin authority. Table text stays intact; personnel dialogs are wider and narrow tables scroll inside their region.
- Owner chose intended role before invitation. The internal new-member wizard chooses company, email and one existing supported operational role, then reviews the role-bound invitation. The established Identity registration consumes that bound role under its existing transaction; no auto-admin grant. Subcontractor invitations remain Requester-only.
- Live inspection reached a non-submitted Survey Manager invitation review. No new internal invitation/profile/role grant was provisioned by this refinement pass. Selected-role acceptance, concurrency, lost responses, rollback and alternate-role behavior have not been executed for this patch. Prior automated test drafts remain unrun pending separate authorization.
- Inside a requester invitation, the UI created Walkthrough Subcontractor Company (SUBCONTRACTOR), reference ddf95d2e-4965-4086-93bd-b0cb497f24f5, and returned to the company step with it selected. A second canceled child registration returned with the existing company and requester email preserved. No subcontractor invitation was submitted.
- Reviewer help explains transfer of one Area review grant to an eligible current Superintendent with replacement coverage. First Survey Manager appointment and remaining staffing obligations are separate. Desktop reviewer table shows intact name, email, person type, access, count and Inspect action in one view.
- Verification: strict/unused types and pinned production build passed. Bounded desktop/mobile UI inspection completed; help near the right edge, keyboard Escape, touch-sized help, wizard footer and table width inspected. Design detector reports zero anti-patterns; two compact-text size advisories are documented, not failures. No automated tests executed in this pass.
- Final image swrtracker:admin-guidance manifest sha256:48a94dceae4ed77892ad6417a21190fe3a4d17677205fd6f8fd9a0d12d5b7ad9; localhost3120 retained database, attachments and environment. Prior web containers retained. Browser left in Admin & personnel with no pending task; viewport restored. Other runtimes and root dirty checkout preserved.
- Proof: admin-guidance-desktop.jpg, admin-guidance-mobile.jpg, reviewer-handover-layout.jpg, member-role-review.jpg and subcontractor-company-return.jpg. Images contain no credentials or invitation tokens.


### Home Organization and Settings Refinement - 2026-10-03

- Decision55: owner chose an explicit tenant home organization retaining its current company type, and a read-only Roles & Permissions reference. No editable custom role model is approved.
- Applied migration035 after verifying retained database at034. Nullable home_company_id has a same-tenant company FK; no backfill occurred. Home organization remains unset in this retained tenant until the owner chooses it. Set Home Organization is available in Project Settings, tenant Accounts or internal invitation company step.
- Project Admin Access moved under Invitations and Next Steps within Project Admin Setup. Headings/table titles use Title Case. Operational role list displays five rows and scrolls across all eight supported choices with readable labels. Tenant Company disables the company dropdown; Previously Created Company enables it. Home designation preview/cancel returns to the existing invitation.
- Created Walkthrough Full Crew Template through the normal foreground wizard: 5a2a4ec9-4aa1-4ba0-8e40-7b9c707ed716, FULL, no hierarchy/groups. The retained project still has no applied template. Saved template appears in Project Setup; applying it is a separate reviewed action.
- Live preview used role-list-preview@startup.example.test without submitting an invitation. No employee credential or new role/admin grant was created. Home designation review for Demo General Contractor was canceled; actual designation is left for the owner. Existing Project Admin1 remains assigned.
- Verification: two strict/unused type and production builds passed, known unrelated CSS warnings retained; bounded desktop/mobile browser inspection plus one confirmation round. Raw browser screenshots used for correct390px capture; dialog bounds fit the viewport with no document horizontal overflow. No automated tests run and existing drafts remain untracked. Home persistence, wrong-role/foreign-scope/concurrency/rollback/lost-response matrices and chosen-role profile acceptance remain unverified.
- Final image swrtracker:admin-home-organization manifest sha256:fd4dd5c7faecee48658bc439c6403370cfb59a66f20152a71ee7806e31b00c73; web67ec814ddc62, prior baseline/preview containers preserved. Named database, environment and attachment volume retained; no reset/seeds/purge. Original root and other runtimes preserved. Browser ready at Admin & Personnel with collapsed setup disclosures and no open task; viewport restored.
- Proof: template-created.png, admin-settings-home-organization.png, admin-settings-home-organization-full.png and admin-setup-access-placement.png. No tokens/credentials in proof.


### Custom Role Wizard - 2026-10-03

- Decision56: owner selected tenant-wide custom names inheriting existing permission profiles, managed only by Tenant IT. Roles & Permissions -> Custom Roles -> Create Custom Role launches the foreground four-step wizard. Saved definitions are immutable and independently listed; this increment does not support per-permission editing.
- Applied additive036 after retained database035. Existing rows keep their original base role with nullable custom_role_id; no access changed. Internal member enrollment/invitations preserve the selected definition, and Identity accepts only invite-bound metadata. Base-role changes clear stale labels; company/disabled access/current authority/protected workflow controls remain.
- Created Walkthrough Site Requester through the Tenant IT wizard, inheriting Requester with description Named Requester profile for the startup walkthrough. Inventory refresh shows it. Existing member picker selects the saved role; new member preview for custom-role-preview@startup.example.test reviews Walkthrough Site Requester (Requester profile), then was canceled without submitting. No invitation/credential/member/admin grant was created.
- Verification: strict/unused TypeScript and production build pass after correcting an initial optional array-index type diagnostic. Migration runner applied036 and skipped001-035. Bounded desktop/mobile inspection measured374px dialog in390px viewport with body scrollWidth390. Profile summaries react to selection; confirmation gates creation and successful saved result is visible. Actual enrollment/acceptance, fault/concurrency/replay and wrong-role/foreign-scope cases remain unverified. No automated tests run; existing test drafts remain untouched.
- Image swrtracker:admin-custom-roles manifest sha256:9ca1fd98762779c3a25c3aad3856d9fbead763e8bcadc7f54df3485480693f45; web4345ec738d1a. Previous web retained as swr-fresh-startup-web-before-custom-roles. Existing tenant/projects/template/home-company state/database/attachments/private env preserved; no reset/seed/purge. Browser ready at Project Settings with saved role listed, no unresolved task; viewport restored.
- Proof: custom-role-created.png, custom-role-review-mobile.png, custom-role-member-selection.png, custom-role-invitation-review.png. Screenshots contain no credentials or invitation tokens.
