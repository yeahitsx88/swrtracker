# Source-bound acceptance archive

`INDEX.json` maps every former path to its source checkpoint, preserved receipts,
fixture prerequisites and reproduction command. Run relocated modules from the
repository root. Original receipts and CODEX references remain unchanged.

Current package/CI commands and A1–A7 criteria determine maintenance. Named
checkpoints and their executable dependency closure stay active; superseded
standalone prototype entry and unreferenced batch runners are archived. The
classification is conservative and recorded in the index. Private fixture and
runtime manifests are prerequisites, never permission to reset retained data.

Every browser module imports a preflight requiring an absolute
`SWR_PLAYWRIGHT_MODULE` path or file URL before fixture mutation. The module must
exist and import successfully. Provide an installed matching browser; Edge
runners use its Playwright channel rather than a machine-specific executable.

The retired prototype URLs require an isolated checkout at the indexed original
checkpoint (V1 `dda015ed3ddc2fe85d1c52c95e3b1a668dcbe1a3`). The current live entry is
verified by `tests/beta/reconciliation-browser.mjs` against a newly owned project.

`node scripts/check-acceptance-syntax.mjs` checks maintained and archived modules
in CI. Syntax does not establish browser correctness. Browser acceptance remains
an explicit separate gate against the source-matching owned runtime.
