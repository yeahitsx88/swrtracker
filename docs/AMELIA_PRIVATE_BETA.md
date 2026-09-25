# Entergy Amelia private beta

This runbook starts the device-local Entergy Amelia beta with sample identities and five representative SWRs. It is intended for private workflow testing on the developer's computer before operational IT setup or a one-month field pilot.

## Prerequisites

- Node.js 22.23.3
- pnpm 11.19.0
- PostgreSQL 15 command-line tools (`initdb`, `pg_ctl`, `psql`, and `createdb`)

If PostgreSQL 15 is installed outside a standard Homebrew location and `pg_ctl` is not on `PATH`, set `SWR_PG_BIN` to its `bin` directory before running the beta commands.

Run all commands from the product repository root:

```sh
cd "/Users/xavier/Programming/SWR Tracker/product"
```

## Set up the beta

Install the checked-in dependencies if needed, then initialize the local database, apply all migrations, and seed the Amelia sample records:

```sh
pnpm install --frozen-lockfile
pnpm beta:setup
```

Setup stops PostgreSQL after it finishes. It can be run again: migrations skip versions already applied and the seed skips the existing Amelia tenant.

## Start and stop

Start the beta:

```sh
pnpm beta:start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Keep the terminal running while testing.

To stop cleanly, press `Ctrl-C` in the terminal running the beta. If the application exits without stopping PostgreSQL, run this from another terminal:

```sh
pnpm beta:stop
```

## Shared beta identifiers

The login currently requires the tenant ID in addition to the user credentials. After sign-in, choose **Entergy Amelia** from the project launcher; the project ID remains useful for direct links and troubleshooting.

| Field | Value |
|---|---|
| Tenant ID | `10000000-0000-4000-8000-000000000001` |
| Project ID | `10000000-0000-4000-8000-000000000002` |
| Password for every sample account | `AmeliaBeta!2026` |

## Sample accounts

| Account | Project role | Expected access |
|---|---|---|
| `requester@amelia.local` | Subcontractor requester | Create SWRs; read and change only their own drafts or returned SWRs; read their own active and completed SWRs |
| `authority@amelia.local` | Subcontractor requester with company authority | Submit and change their own SWRs; read every Amelia Civil Subcontractor SWR; cannot change another employee's SWR |
| `lead@amelia.local` | Survey Lead (`SURVEY_MANAGER`) | Review every project SWR; approve, return, assign, revise priority or Need-By, cancel, validate unassigned-chain inability reports, review metrics, and capture local messages |
| `chief@amelia.local` | Party Chief | Read assigned work; assign an Instrument Man on that work; validate inability reports when captured as reviewer; add supporting files while work is active |
| `instrument@amelia.local` | Instrument Man | Read assigned work; start, delay, resume, report inability, flag stop-work, complete, and add supporting files while work is active |
| `admin@amelia.local` | Project and tenant administrator | Review and change project request configuration, including the per-SWR attachment count limit |

The navigation shows a common set of links. The API still enforces the signed-in account's project role, ticket ownership, company authority, and assignment.

## Seeded SWRs

Setup creates five sample SWRs across North Area and South Area:

- a submitted request awaiting Survey review;
- an approved, overdue request with no Instrument Man;
- an in-progress request assigned to the sample Party Chief and Instrument Man;
- a completed request for cycle-time and sealed-record checks; and
- a returned request ready for the original requester to correct and resubmit.

The seeded queue is designed to populate the Survey Operations priorities and all four initial measures: open SWRs by Area and status, approved work without an Instrument Man, overdue Need-By dates, and completed work with submission-to-completion cycle time.

## Suggested walkthrough

Use a private browser window or sign out between roles so each step uses the intended identity.

1. **Requester correction and resubmission**
   - Sign in as `requester@amelia.local` using the tenant ID above.
   - Choose **Entergy Amelia** in **Project Launcher**, then open **My Requests**.
   - Open the returned SWR, change a requester field, and save it.
   - Upload a replacement instruction file, then select **Resubmit for Approval**. The same SWR number should remain in use through the new approval cycle.

2. **New request and instruction file**
   - As the requester, open **New Request** and create a draft.
   - Attach a PDF, JPEG, PNG, text, CSV, Word, or Excel file. Each file must be no larger than 30 MB.
   - Submit the draft. If the Need-By date is inside the configured two-day lead time, enter an urgent reason.
   - Confirm that requester instruction uploads are no longer accepted after submission unless Survey returns that SWR for correction.

3. **Survey review and assignment**
   - Sign in as `lead@amelia.local`, choose **Entergy Amelia**, and open **Survey Operations**.
   - Confirm **Approved Work Needing Assignment** includes the seeded overdue request.
   - Approve a submitted SWR, then assign an Instrument Man. A Party Chief may be selected or left empty.
   - Exercise **Return**, **Set High/Normal**, or **Revise Need-By** and confirm a reason is required.
   - Use **Capture Queued** under **Local Message Preview** to render the durable notices generated by the workflow.

4. **Field execution and evidence**
   - Sign in as `instrument@amelia.local` and open **Crew Work**.
   - Open assigned work, add a file labeled **Field support or evidence**, and exercise start and completion.
   - On a separate active SWR, report an inability to perform. The captured Party Chief reviews it when assigned; otherwise the Survey Lead reviews it.
   - A validated inability returns the same SWR to the requester. A rejected inability report resumes the prior field state.

5. **Company authority boundary**
   - Sign in as `authority@amelia.local` and open **My Requests**.
   - Confirm the authority can read SWRs submitted by the other Amelia Civil Subcontractor requester.
   - Confirm the authority can edit only their own draft or returned SWR.

6. **Traceability and metrics**
   - As the Survey Lead, refresh **Survey Operations**, capture queued messages, and compare the queue cards with the actions just completed.
   - Open ticket details to review the newest-first SWR History and download attachments. Downloads recheck visibility and append an audit event.
   - As the original requester, open a completed SWR and select **Create Follow-Up SWR**. Confirm the completed parent stays closed and the linked child opens as an editable draft.

## Attachment and instruction rules

- Requesters upload instruction files only on their own draft or returned SWR.
- Submitting or resubmitting freezes that instruction revision. A later instructional change requires Survey to return the same SWR for correction and fresh approval.
- The Survey Lead and assigned Party Chief or Instrument Man may append supporting or evidence files while work is active. Supporting files do not silently replace approved instructions.
- Completed and canceled SWRs do not accept more files.
- The allowed beta types are PDF, JPEG, PNG, plain text, CSV, Word, and Excel. The per-file limit is 30 MB.
- Project IT can set the maximum number of files per SWR in **Admin**. An empty value means no configured count cap; the accepted range is 1 through 100.

## Local data

All beta state stays under `product/.data/beta/`, which is ignored by Git:

| Path | Contents |
|---|---|
| `.data/beta/postgres/` | PostgreSQL cluster and all beta records |
| `.data/beta/attachments/` | Uploaded attachment bytes, grouped by tenant and SWR storage keys |
| `.data/beta/beta.env` | Local database URL, generated JWT secret, and attachment-root setting |
| `.data/beta/postgres.log` | Local PostgreSQL log |
| `.data/beta/socket/` | Local Unix socket while PostgreSQL is running |

Treat this directory as one beta dataset. Do not copy its sample credentials or records into an operational environment.

## Current boundaries

- The site listens only on `127.0.0.1` and is intended for testing on this device.
- Status notices are durable local previews; no email is sent.
- Attachment storage is local and has no organization-owned backup, restore, retention, or malware-scanning service.
- The identities and password are sample credentials for this private beta.
- SharePoint remains the historical system. V1 does not import or synchronize SharePoint records.
- Central or project IT onboarding, real subcontractor identities, hosted storage, real mail delivery, the backup Survey Lead, and one-month pilot operations remain later gates.
