# Project requester invitations

Mode: Operate. Extend project administration under owner approval on 2026-10-02: a Project Admin may invite a new employee/requester into an administered project, using an associated company and fixed Requester access.

## Direction contract

THESIS: An existing person is added; a new person is invited. Both paths are visible together under project members.

OWN-WORLD: Preserve Axiom, Roboto, white panels, existing native fields, square buttons and shared banners. No new tokens, imagery or motion.

STORY: Select a company and email, review the fixed Requester scope, confirm, create a link, and share it with the recipient. They complete registration and choose their password.

FIRST VIEWPORT: Preserve the member list and independent administrator grants. Directly after existing-member addition, show the new requester invitation section, then retain project company management below. Use stacked full-width controls on phones.

FORM: Precisely specified extension of the existing inline confirmation composition; code-led, no concept seed required. Share the administration command owner. Freeze uncertain invitation intent/key, require deliberate reload on conflicts, and expose pending invitations without tokens.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Evidence limits

User screenshots establish the incumbent Admin tab, member list, grants and existing-account selector. Automated browser access to the local tab was refused by browser security policy; no alternate browser or indirect UI automation is permitted. New rendered desktop/mobile acceptance requires user-supplied screenshots. Source and HTTP evidence do not substitute for that check.

## Implemented extension and documentation checkpoint (2026-10-02)

Source evidence: src/components/ui/requester-invitations.tsx places associated company and new requester email fields in the existing stacked field composition, followed by review, explicit confirmation and creation. src/components/ui/project-administration.tsx mounts the section after existing-account member addition and passes the shared administration command owner. The invitation path has fixed Requester copy and no role or password control. Success shows a read-only registration link, its seven-day expiry and the explicit fact that no email was sent; the recipient completes the existing bound, one-use registration and chooses their own password. The pending list exposes email, company and expiry, without invitation tokens. The source handles loading, company-empty and archived states, uncertain same-command retries and deliberate reload after stale state.

API evidence: src/app/api/projects/[projectId]/invites/handler.ts and route.ts expose scoped GET/POST using active authentication and the existing access-administrator authority. POST accepts only companyId and email, preserves exclusive transaction/current-authority revalidation and idempotency, rejects archived projects and appends user.invited administrative evidence with REQUESTER. src/modules/identity/application/requester-invitations.ts normalizes/validates email, rejects registered tenant accounts and active duplicate project invitations, and sets seven-day expiry. src/modules/identity/infrastructure/company-access.repository.ts limits selectable companies and active pending invites to 100, retains tenant/project association checks for GC, OWNER_REP and SUBCONTRACTOR, and inserts only REQUESTER invitations. A subcontractor company may also be eligible through an existing project member, preserving the incumbent association contract. Invitation creation is consolidated here; admin/subcontractor-access.tsx retains separate company-view grants and pending subcontractor invitations with guidance to this section.

The implementation reuses existing headings, fields, square shared buttons and state banners within the recorded Axiom world. This ordinary extension supplies no new global design rule. DESIGN.md, .impeccable/design.json, global CSS and brand assets are preserved. No new shipping raster was introduced. Shared token values, whole-surface layout and device behavior have not been re-audited in this documentation pass; no inferred rule or unverified visual result is canonized.

## Current evidence and finish limits (2026-10-02)

The supplied implementation verification records 553 tests at baseline and 563 current passing tests, TypeScript checking and production build. Confirmed bounded HTTP acceptance passed node scripts/dot-runtime.mjs smoke-invitations. Fresh lifecycle run 52bc2456-2488-4e8a-b8be-c9e9794c4208 on proof project e52a3768-10fe-4c68-87b2-e42572fc2886 completed the original lifecycle regression with 27 denials. Independent invitation run 9a28860d-5216-4229-9097-ee6a2f34d5d0 registered three fixed Requester accounts using GC, OWNER_REP and SUBCONTRACTOR companies, verified 40 denials, created their own DRAFTs, archived only its fresh proof project, and reconciled authoritative audit and identity records. These are bounded HTTP results; rendered recipient and other UI-state acceptance remains outstanding. A user-supplied desktop success screenshot was reviewed independently as a limited slice. That reviewer found no material source or visible desktop-slice defect and returned recapture because mobile, surrounding page context, confirmation, recipient registration UI, keyboard focus and recovery-state captures remain missing. The screenshot contains a local invitation token; its value and link are not reproduced in this brief or used as documentation evidence for registration acceptance.

Automated browser access remains explicitly blocked by browser security policy. No browser workaround was used for this pass. Source review and the confirmed HTTP proof do not establish rendered mobile behavior, the recipient registration UI or recovery/focus acceptance. Whole-surface visual ship disposition remains unestablished pending the missing user-supplied captures; the existing direction contract and historical evidence notes above are retained.
