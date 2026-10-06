# Survey org-chart workspace

Accepted V1 reference: dda015ed3ddc2fe85d1c52c95e3b1a668dcbe1a3 on origin/codex/survey-team-org-poc. No redesign or operational staffing integration is included.

- survey-org-chart-workspace.tsx owns the accepted chart, local fixture state, native dragging, collapse, zoom and move reviews. Extraction retains its render/state structure to protect V1 rather than splitting the interaction into smaller pieces in this increment.
- fixtures.ts is the same mock hierarchy and immutable move projection.
- survey-org-chart.css retains V1 styling. Document-level selectors apply only to a directly mounted standalone chart; overlay hosts are unaffected.
- SurveyOrgChartLauncher opens a large native modal workspace. The unscaled wrapper header closes the workspace; body scrolling exposes available personnel below the fixed chart panel. Nested chooser/review dialogs retain native focus and Escape behavior. Closing/reopening starts fresh local state. No persistence or staffing API is added.
- TeamManagementEntry exposes the Demo launcher only after its existing workforce context resolves to SURVEY_MANAGER. Existing CommandOwner exclusion disables launching during operational editor/command activity. No new role authority is introduced; chart moves remain mock-only.

Standalone compatibility: /prototypes/survey-team. Development-only launcher harness: /prototypes/survey-team/workspace. The ?entry=1 harness mounts the real TeamManagementEntry against browser-intercepted read-only fixture responses; real API authentication is unchanged.

Run tests/ui/survey-team-prototype-browser.mjs with the documented loopback origin/Playwright settings; SWR_POC_OVERLAY=1 runs the same V1 matrix in the dialog (23 groups versus22 standalone). tests/ui/survey-org-chart-entry-browser.mjs checks Manager launcher, existing-editor exclusion, Superintendent/denied-context exclusion with zero mutation requests. API doubles establish UI gating only; real database/security acceptance is not claimed. Original V1 evidence is tracked in tests/ui/survey-org-chart-v1-evidence.json. Current captures remain ignored locally.

The implementation preserves V1 visual styling, native scaled-coordinate hit testing, 50-150% zoom, fixed viewport, pinned toolbar and local review/cancel/confirm semantics. No alpha1-ui-redesign modification, merge or rebase occurs in this increment.
