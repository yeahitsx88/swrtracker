# Edge Case Register

## Template
- Agent:
- Edge case:
- Risk:
- Proposed execution plan:
- Priority:

## Agent 1 - Domain/Data Core
- Agent: Agent 1
- Edge case: Existing projects with NULL/invalid lead-time values after manual DB edits.
- Risk: Submit logic could mis-evaluate required date windows.
- Proposed execution plan: Add DB check constraint + normalization fallback test path; add diagnostics query for invalid rows.
- Priority: High

- Agent: Agent 1
- Edge case: Historical tickets have null `field_contact`/`field_channel`.
- Risk: UI display regressions or null access assumptions.
- Proposed execution plan: Keep nullable schema, render-safe fallback (`-`), and include read-path tests for nulls.
- Priority: Medium

- Agent: Agent 1
- Edge case: Lead-time bound requested above supported max in migration seed scripts.
- Risk: Writes fail unexpectedly post-deploy.
- Proposed execution plan: Validate in app before DB write and expose clear error message.
- Priority: Medium

- Agent: Agent 1
- Edge case: Date-only storage interpreted differently across timezone boundaries.
- Risk: Off-by-one-day behavior near midnight.
- Proposed execution plan: Add explicit timezone-focused submit tests and normalize requested date parsing strategy.
- Priority: High

- Agent: Agent 1
- Edge case: Concurrent migration runners applying same constraint.
- Risk: deployment race/noise.
- Proposed execution plan: Keep migration idempotent (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`) and use single migrator lock process.
- Priority: Low

## Agent 2 - Application/AuthZ
- Agent: Agent 2
- Edge case: `PROJECT_ADMIN` removed while editing config.
- Risk: Unauthorized config mutation succeeds via stale session.
- Proposed execution plan: keep role lookup per request/session; add targeted revocation test.
- Priority: High

- Agent: Agent 2
- Edge case: Enforcement disabled with very low requested date.
- Risk: conflicting assumptions between UX and backend.
- Proposed execution plan: keep explicit bypass in submit when disabled and document behavior in API response help text.
- Priority: Medium

- Agent: Agent 2
- Edge case: Tenant admin not project member updates config.
- Risk: ambiguous authorization policy.
- Proposed execution plan: preserve tenant-admin override; add explicit API test for non-member tenant-admin path.
- Priority: Medium

- Agent: Agent 2
- Edge case: Clock skew between app server nodes.
- Risk: inconsistent submit acceptance near threshold.
- Proposed execution plan: centralize time source tolerance via DB-time or monotonic clock abstraction in future hardening pass.
- Priority: Medium

- Agent: Agent 2
- Edge case: leadTimeDays changed between draft save and submit.
- Risk: requester confusion when previously valid date becomes invalid.
- Proposed execution plan: expose current policy in submit errors/UI reload and add user guidance message.
- Priority: High

## Agent 3 - API/Contracts
- Agent: Agent 3
- Edge case: PATCH payload uses decimal `leadTimeDays` (e.g., 2.5).
- Risk: unclear error handling.
- Proposed execution plan: keep integer validation at service layer and add contract example in API docs.
- Priority: Medium

- Agent: Agent 3
- Edge case: Missing `fieldContact`/`fieldChannel` on older clients.
- Risk: hard failures for outdated app versions.
- Proposed execution plan: publish API change note and roll forward client update before enforcing on production clients.
- Priority: High

- Agent: Agent 3
- Edge case: Request-config GET called by authenticated non-member requester.
- Risk: potential project metadata leakage.
- Proposed execution plan: keep project membership gate and test 403 path.
- Priority: High

- Agent: Agent 3
- Edge case: PATCH request on archived project.
- Risk: configuration mutation on read-only project.
- Proposed execution plan: rely on repository archived guard and add direct route test.
- Priority: Medium

- Agent: Agent 3
- Edge case: Very long field contact/channel strings.
- Risk: oversized payloads and poor UI rendering.
- Proposed execution plan: add max-length validation (future batch) and client-side character counters.
- Priority: Medium

## Agent 4 - UI
- Agent: Agent 4
- Edge case: Browser with stale tab keeps old lead-time config.
- Risk: user selects date that server rejects.
- Proposed execution plan: refresh config on page focus or pre-submit validation call.
- Priority: High

- Agent: Agent 4
- Edge case: Date input locale formatting inconsistencies.
- Risk: invalid date serialization in older browsers.
- Proposed execution plan: keep ISO serialization and add fallback parse guard before submit.
- Priority: Medium

- Agent: Agent 4
- Edge case: Admin enters non-numeric lead-time days.
- Risk: NaN sent to API.
- Proposed execution plan: client-side sanitize + disable save on invalid number.
- Priority: Medium

- Agent: Agent 4
- Edge case: Craft set to "Other" but custom text empty.
- Risk: blocked submit confusion.
- Proposed execution plan: inline helper text and red validation message beside custom field.
- Priority: Low

- Agent: Agent 4
- Edge case: Mobile keyboard auto-correct modifies channel text.
- Risk: wrong contact channel stored.
- Proposed execution plan: set `autoCorrect="off"`/`autoCapitalize="none"` for channel field.
- Priority: Low

## Agent 5 - Verification/QA
- Agent: Agent 5
- Edge case: Attachment upload after adding new required create fields.
- Risk: create route changes inadvertently break attachment workflow.
- Proposed execution plan: keep attachment tests in regression suite and add smoke scenario with new fields + upload.
- Priority: High

- Agent: Agent 5
- Edge case: Attachment list access by unauthorized role after config changes.
- Risk: accidental auth regression.
- Proposed execution plan: preserve and extend attachment read-route unauthorized tests.
- Priority: High

- Agent: Agent 5
- Edge case: Ticket created with config disabled then config re-enabled before submit.
- Risk: inconsistent user expectations.
- Proposed execution plan: integration test that confirms submit uses current config snapshot.
- Priority: High

- Agent: Agent 5
- Edge case: Project config API returns defaults when project missing config row.
- Risk: silent policy mismatch.
- Proposed execution plan: explicit default contract assertion in route tests and diagnostics.
- Priority: Medium

- Agent: Agent 5
- Edge case: Submit near day boundary (23:59 local vs UTC).
- Risk: false reject/accept.
- Proposed execution plan: add deterministic timezone boundary tests with fixed clocks.
- Priority: High

## Lead Deduped Prioritization
1. High: timezone/day-boundary correctness for lead-time checks (Agents 1/5 overlap).
2. High: stale-client/stale-config mismatch messaging and refresh behavior (Agents 2/4 overlap).
3. High: backward compatibility strategy for older clients missing coordination fields (Agent 3).
4. Medium: archived-project config mutation route test hardening (Agent 3).
5. Medium: max-length validation for coordination fields + UI counters (Agent 3/4).
