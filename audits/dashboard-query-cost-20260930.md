# Dashboard query-cost follow-up

AUDITOR: read-only follow-up to the phase5 completion-evidence report. Existing production query builders were executed against the owned local PostgreSQL15 Sabine simulation in `BEGIN READ ONLY`, with a10-second statement timeout. Current active account/version, project membership and server visibility were resolved: Survey Manager in live, Viewer in history. No role was invented to run historical Manager activity. No source, schema, index, database settings or preview image changed.

## Current query measurements

Three sequential EXPLAIN ANALYZE/BUFFERS samples per case, warm database cache, no concurrent load. Times are database execution, not HTTP latency or a production percentile. All cases reported zero shared blocks read; cache was not flushed. Chart queries include existing bounded facets and groups. Historical review includes its ordinary10-item first page. Area/completed selects the largest existing Area in each project. Activity spans2026-09-01 through2026-09-30 UTC.

| Query | Median execution ms | Observed range ms | Event-table scan loops |
|---|---:|---:|---:|
| Live charts, all84 |252.293|248.816–258.963|84|
| Live charts, open70 |212.830|204.477–221.376|70|
| Live charts, Area/completed7 |22.987|22.699–23.878|7|
| Live command,30days |34.257|33.099–34.585|1|
| Historical charts, all20,025 |124.046|117.892–125.734|1|
| Historical charts, open33 |120.499|118.954–125.094|33|
| Historical charts, Area/completed6,550 |51.314|50.439–51.888|1|
| Historical review, all |163.129|158.326–169.207|1|
| Historical review, Area/completed |74.677|73.163–75.808|1|

The narrow chart populations repeatedly sequential-scan20,025 tenant import-event rows inside a nested loop. Live/all recorded91,665 shared-hit blocks in repeated samples despite only84 requests. This is a measured query-plan optimization target; the all-history sequential scans themselves are not evidence of a missing index. Historical all-chart uses temporary blocks3558 read/1423 written and a disk sort; all-review uses14289/1299 temporary blocks. Parent plan block totals are inclusive and were not summed across children.

## Read-only alternatives, not shipped

An initial materialized import-event CTE retained full payloads. Live medians changed to140.737ms(all),122.612ms(open),26.567ms(Area/completed), with764 temporary blocks written. Raw live JSON equality passed. The historical raw equality assertion stopped that pilot before historical measurements; its cause was not established. Do not claim this pilot was fully validated.

A second candidate projected tenant/ticket IDs and aggregated the existing synthetic-completion boolean before a materialized join. Six populations each passed raw JSON equality as well as order-insensitive bucket comparison. Eighteen plan samples each scanned the event table once:

| Population | Current median ms | Projected candidate median ms |
|---|---:|---:|
| Live/all |252.293|27.611|
| Live/open |212.830|138.893|
| Live/Area-completed |22.987|35.825|
| History/all |124.046|124.713|
| History/open |120.499|52.979|
| History/Area-completed |51.314|68.211|

This candidate is not a general improvement: it slows narrow Area selections, introduces roughly767/768 temporary blocks read/written in the narrow cases, and remains costly for live/open. Sequential samples are not randomized paired trials. Neither variant is committed to production; neither is a complete role/tenant/provenance regression assessment. A next bounded Reporting investigation should compare scoped semi-joins/project-aware event selection against these cases, including empty populations, duplicate/mixed provenance, generated completion exclusion and all authorized cohorts. Preserve tenant/project/visibility fences and the current result contract. Do not add global planner switches, memory settings, caches or indexes based on this pilot alone.

## Safety and limits

All transactions rolled back; public request count20,109 and ID/status/row-version fingerprint `22fcffc03ee306d3b65c8c3eda4997b3` remained identical. No credentials, query parameter values or request/person records were emitted. Final nonincremental TypeScript and367/367 unit tests pass. This supersedes the earlier absence of fresh plans for these nine cases only. It does not complete concurrent-user load, physical-device interaction/INP, deployment or security acceptance. The existing loopback3106 preview remains unchanged.

## Implemented follow-up: scoped hashed membership (Batch62)

The prior join is now a tenant/ticket membership predicate against the already-authorized and filtered CTE, wrapped in `IS TRUE`. This preserves SQL WHERE semantics, duplicate-event `bool_or`, draft exclusion and all visibility/filter/denominator boundaries while allowing PostgreSQL15 to build a hashed SubPlan. It does not materialize full payloads, add indexes, change memory/planner settings, or expose events outside the filtered population. The two earlier materialization candidates remain rejected.

The guarded `tests/beta/metrics-provenance-plan.ts` compares current content with only the former provenance join substituted as a test comparator. Forty real scope/filter comparisons cover five accounts in live/history (all/open/Area-completed/empty); four additional comparisons use explicitly qualified, rollback-only UUID temp fixtures with50,000 requests and105,000 event rows. Equality normalizes bucket order but not metric values. Fifty-two existing/extended PostgreSQL cases cover roles, company/tenant/project fences, duplicate/mixed/null provenance, wrong-tenant events, draft/other-project events, generated completion exclusions and empty populations. The synthetic linked42 and own25,000 populations verify coverage and cycle counts explicitly.

Three paired plan samples per measured case alternate query order. Fresh medians:

| Case | Former join ms | Current membership ms |
|---|---:|---:|
| Live/all84 |276.591|5.903|
| Live/open70 |214.075|5.264|
| Live/Area-completed7 |22.804|4.549|
| History/all20,025 |119.286|119.020|
| History/open33 |126.015|24.633|
| History/Area-completed6,550 |50.902|50.502|
| Synthetic/all50,000 |384.514|392.215|
| Synthetic/Area84 |1307.491|125.396|

Every current measured event scan ran once or zero times for empty sets and used the hashed predicate. Full-history/synthetic-all remain dominated by existing aggregate/temp work; the50,000 all-population median is about2% slower in this small local run, not a universal speedup. No timing threshold assertion hides that result. Narrow populations improve without the earlier candidate's added temporary payload spool. Tests assert the relevant event scan shape as well as contents; these are PostgreSQL15/local fixture results, not a portable planner guarantee under arbitrary memory/data/version conditions.

Windows and Linux production builds plus368 unit tests pass. The owned loopback3106 preview now runs `swrtracker:sabine-provenance-20260930`, ID `sha256:a83abb8137701425bfba101f7765690d29a68960b16603c559fae97f5d1fcbe0`; prior web retained as `swrtracker-sabine-web-before-provenance-20260930`. Database/attachment/session settings are identical; no migration/reset/reseed or request/staffing writes. Deployed167 six-account HTTP checks pass (historical12,198 decoded bytes/120ms single sample), along with navigation810/390/1902 and all eight pinned-close1440/390 browser cases. Existing dependency/autoprefixer build warnings remain; no UI/design source changed.

A bounded local mixed-read check warms four endpoints, then issues three rounds of eight concurrent requests:24 successes, zero errors, consistent authorized counts/page bounds/provenance and unchanged request fingerprint. Six samples per endpoint: live charts35.9–72.6ms(median41.2), historical charts157.8–208.3(176.0), live30-day activity54.9–92.1(60.3), historical10-item review202.7–261.0(210.3). These are loopback end-to-end response/body-read times, not independent users, production percentiles, a soak test or INP. Its test login was revoked and reuse returned401. All20,109 public request IDs/statuses/versions remain unchanged.
