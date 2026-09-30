# Native Windows attachment-storage decision

Date: 2026-09-29. Role: AUDITOR. No production code or test change.

## Evidence

- `tests/attachment/local-storage.test.ts` checks file mode `0600` and directory mode `0700`. The Windows baseline reports `0666` for the file; 247 other tests pass.
- `LocalAttachmentStorage.write` in `src/modules/attachment/infrastructure/index.ts` relies on Node `mkdir` and `writeFile` modes, with no Windows ACL establishment or validation.
- Node documents that Windows does not implement the owner/group/other distinction through these APIs: https://nodejs.org/download/release/latest-jod/docs/api/fs.html#file-modes
- Read-only inspection of `.data/sabine` shows one explicit FullControl ACL entry for the current Windows user and no inherited entries. The simulation launcher separately establishes this ACL. The source import contains no attachments.
- The Dockerfile targets Linux Node 22; `.node-version` specifies 22.23.3. The native Windows demo uses Node 24.13.1.

## Interpretation and decision

The mode failure alone does not establish cross-user exposure. Accepting `0666` would not establish owner-only protection either. Native Windows protection currently depends on the enclosing ACL, outside the storage class's contract. No cross-user access was attempted.

Options:

1. Use the existing Linux container path as the supported attachment runtime. Retain the protection assertions and verify the complete suite on Linux. Document native Windows limitations. Recommended to align with the current deployment stack.
2. Explicitly support native Windows attachment storage with ACL enforcement/validation, including preexisting roots, service identities, and inheritance. This needs an approved permission contract, not merely a changed test assertion.

Do not skip the test, weaken protection, or silently rewrite ACLs on existing user-selected storage trees. The user's security/permissions decision gate requires direction before implementation. Current simulation data and services remain intact.

## Owner decision — 2026-09-29

The user selected the Linux container. Sabine's web image is now pinned to Linux Node 22.23.3 and runs as the non-root `node` user with a persistent attachment volume. All 248 tests pass in that image build, including the original 0600/0700 assertions. No Windows-specific bypass or weakened test was introduced. This closes the runtime-choice gate, not the native Windows ACL-support gap.
