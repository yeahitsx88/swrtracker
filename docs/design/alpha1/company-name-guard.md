# Duplicate Company Name Prevention

Owner's final Project Admin annotation is addressed after role/support checkpoint `eb928d6`. New company creation rejects an existing tenant name regardless of capitalization, whitespace or company type. Other tenants may use the same name. Punctuation remains significant.

Both tenant and project creation check under their existing EXCLUSIVE lifecycle transaction, before insert/evidence. Concurrent authorized writers therefore create one company; a duplicate returns409. The Companies form disables review for a loaded project match with field-linked feedback. A tenant-only conflict preserves the name and requires deliberate reload. Reuse the existing Company ID for another project's association. Existing duplicate IDs, users, requests, associations and history are preserved. No migration or historical consolidation is required; operator SQL remains outside application enforcement.

Verification: strict/unused types,584 units and pinned production build pass, as do all30 PostgreSQL suites and24 focused HTTP/browser checks including concurrent project/tenant writers, variant rejection, unchanged evidence, replay, foreign tenant, ID association and1107/390 feedback/reload. Independent review: ship at this correction's scope; documenter preserves incumbent DESIGN/sidecar and reports existing drift. [Sanitized evidence](../../../audits/alpha1-ui-redesign/company-name-evidence.json) pins the new source digest; previous receipts remain immutable.

The local demo3124 now runs this verified image with its original environment, schema and file volume. Before/after digests match companies and retained operational records. Actual Alex Rivera Companies inspection rejects the reported “SC Company 1” name before review. No push/merge/Alpha2 initialization.

## Implementation and Tests

- [src/modules/tenancy/application/project-administration.ts](../../../src/modules/tenancy/application/project-administration.ts)
- [src/modules/tenancy/application/create-company.ts](../../../src/modules/tenancy/application/create-company.ts)
- [src/modules/tenancy/infrastructure/company-name-availability.ts](../../../src/modules/tenancy/infrastructure/company-name-availability.ts)
- [src/modules/tenancy/domain/company-name.ts](../../../src/modules/tenancy/domain/company-name.ts)
- [src/components/ui/project-administration.tsx](../../../src/components/ui/project-administration.tsx)
- [tests/beta/project-administration-postgres.ts](../../../tests/beta/project-administration-postgres.ts)
- [tests/beta/company-name-acceptance.mjs](../../../tests/beta/company-name-acceptance.mjs)
- [audits/phase5-lifecycle-writers.json](../../../audits/phase5-lifecycle-writers.json)
