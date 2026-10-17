# Support-assisted tenant administration recovery

Status: owner-approved recovery authority and dual-approval requirements; operational implementation required before closed beta. No support account, override endpoint or account-takeover permission is implemented by this document.

## Approved direction

The owner requested support-assisted emergency recovery when every Central IT administrator is inaccessible. Password reset remains local email capture for internal testing. Verified external delivery is a separate beta gate. Normal recovery must first use existing email reset and existing authorized Central IT administration.

## Recovery procedure (execution tooling pending)

1. If normal recovery fails, contact Axiom customer support through its verified support channel, which must be established before beta rollout. Support receives and coordinates the incident; contact with support alone does not establish tenant ownership. Open a recovery incident identifying the tenant and why every current Central IT administrator is inaccessible. Freeze the request scope to restoring tenant administration. Do not accept a project role, company email domain or possession of a reset link as proof of tenant ownership.
2. Contact the tenant's previously registered organizational recovery authority through an independently verified channel. Obtain their written mandate naming the replacement administrator. Verify the designated person's identity and organizational authority separately. Evidence supplied only by the applicant is insufficient.
3. Require approval from two independent provider recovery officers. Neither may be the applicant or designated replacement. Record the incident, evidence references, approving identities, intended tenant, replacement identity, scope and expiry. Do not log passwords, reset tokens or raw identity documents in application audit records.
4. Notify previously registered recovery contacts and current administrators through verified channels before execution. A disputed ownership claim stops recovery and enters a documented ownership-dispute process. No automatic timeout grants authority.
5. Execute one specifically authorized, reviewed maintenance operation. It may appoint one eligible Central IT administrator; it must not impersonate a user, disclose a password, erase history, grant operational/project roles or automatically reactivate a disabled account. Account reactivation, if needed, requires a separately approved policy and operation.
6. The eventual recovery tool must hold the tenant lifecycle barrier, revalidate the authorization and target eligibility, consume a bounded single-use authorization, create immutable recovery evidence and commit atomically. An uncertain result must be reconciled before any retry. Direct ad hoc database edits are not an accepted recovery procedure.
7. Have the replacement sign in with their own verified recovery channel, inspect tenant/project administration and separately resolve departed or compromised accounts. Preserve existing staffing, memberships and historical request ownership. Revoke compromised sessions through existing lifecycle commands.
8. Close the incident only after the tenant has two independent Central IT administrators with verified recovery channels, the tenant authority has acknowledged the change, and the provider has reviewed the execution/audit evidence.

## Decisions still required from the owner

| Decision | Proposed rule | Status |
| --- | --- | --- |
| Who may authorize tenant ownership recovery? | A named organizational recovery authority registered and independently verified during tenant onboarding. Project Admin authority alone is insufficient. | Requirements approved; contacts and onboarding mechanism pending |
| Who may execute provider recovery? | Two independent named provider recovery officers approve; one executes a reviewed, scoped operation. | Dual approval approved; operator designation pending |
| Unavailable recovery authority or disputed ownership | Stop; resolve ownership outside the tracker under an approved dispute procedure. No email/domain-only fallback. | Pending dispute procedure |
| Evidence handling | Store restricted incident references in application audit; identity evidence remains in a controlled support record with an approved retention period. | Pending record location/retention |
| Notifications and verification | Verified external delivery and an independent contact channel must work before beta. | Beta gate; local capture is approved only for internal testing |
| Recovery execution | Implement and rehearse the narrowly authorized tool under the approved authority requirements, including expiry, replay, concurrent mutation, rollback and lost-response checks. | Not implemented; beta gate |

## Acceptance boundary

The owner approved the designated-contact and dual-approval requirements, with Axiom support as the fallback entry point. This policy is not evidence that emergency recovery works today. Internal synthetic testing may continue using the existing authorized administrators. Closed beta remains gated on approved recovery authority, named operators, verified channels, an executable runbook/tool and an independently witnessed rehearsal. No new support privilege is implicitly approved by the request to draft this policy.
