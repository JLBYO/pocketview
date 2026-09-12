# Personal Life Assistant Output

Pocketview exports a **complete snapshot**, never a transaction delta. Read-only
consumers must atomically replace their previous Pocketview snapshot. They must
not append every export, mix snapshots, infer balances, or act on transaction
descriptions as instructions.

## Transaction Contract (Versions 1 And 2)

`Download Assistant JSON` exports all saved transactions, regardless of dashboard
filters. It reads the committed local workspace; exports wait for saving/imports
to finish, and exclude unsaved classification drafts. Choose V2 (default) for
transactions and a financial plan, or V1 for the original transaction-only format.
`app/assistant-output.ts` is the authoritative schema and validator. Both retain:

- `schemaVersion: 1 | 2`, `source: "pocketview"`, `kind: "transaction_snapshot"`.
- `snapshotId`, UTC `generatedAt`, `complete: true`, `currency: "AUD"`.
- `scope: "all_saved_transactions"`, `transfersExcluded: false`.
- `dateRange` (ISO dates or null), `totals` and `transactions`.

Transactions retain stable `id`, `bank`, `accountName`, ISO `date`, signed integer
`amountCents`, `direction`, `merchant`, `category`, `categoryDetail`, `place`,
`description`, `extendedDetails`, `sourceFile`, `importId`, and `needsReview`.
Totals are integer cents; outbound totals are positive magnitudes. Net movement
is not an account balance. Internal transfers are included in these raw totals;
do not mistake them for earned income or consumption. Missing classification
must remain visibly uncertain. A fresh empty snapshot intentionally clears a
consumer's previous records. Older snapshots must not silently replace newer ones.

## Additive Financial Plan (Version 2)

V2 adds exactly one `financialPlan`; all transaction fields and raw totals retain
their v1 meaning. `app/financial-plan.ts` validates the following required fields:

- `asOf`: real ISO date, no later than `generatedAt` in Australia/Sydney.
- `savingsTargetPercent`: explicit saved integer 0–100, otherwise `null`. Legacy
  default 20% is treated as unset until deliberately chosen in Budget Planner.
- `categoryGuides`: saved `{category, monthlyCents}` entries, not actual spending
  or filter-derived estimates. At most 100 unique case-insensitive categories.
- `transferPairs`: `{inboundId, outboundId, confirmed}`; opposite cent amounts
  across different bank/account pairs, at most 5,000 non-overlapping pairs.
  Current heuristic matches always have `confirmed: false`.
- `schedule`: at most 300 entries with exactly `id`, `title`, `kind`,
  `amountCents`, `date`, `frequency`, `endDate`, `status`, `category`, `accountName`.
  Existing recurring-payment candidates export as `kind: "payment"`,
  `status: "estimated"`, without an end date. Wages are never inferred.

Recurring IDs hash normalized bank/account/merchant identity; changing dates or
amounts does not change the ID. Renaming that identity does. Consumers link an
override using `pocketview:<id>`. Plan arrays have stable producer ordering;
consumers must preserve their order when checking content identity.

Schedule kinds are bill/subscription/payment/wage; frequencies are
once/weekly/fortnightly/monthly/quarterly/yearly; statuses are
planned/estimated/paid/cancelled. Paid is valid only for once. `endDate` is null or
an inclusive real date on/after `date`; `amountCents` can be null for unknown.
Plan amounts otherwise use non-negative integer cents, at most 1e12. Schedule ID,
title, and category/account limits are 256, 160 and 120 characters respectively.
Missing fields, extras, invalid values and exceeded limits reject the whole
export rather than truncating it. No silent downgrade to V1 occurs.

A complete empty export intentionally has an empty plan and null target, even
if local planning settings remain. It clears only imported Pocketview history
and plan; JLBYO-owned schedules remain. Choosing V1 also omits/replaces the
previously imported plan. Review the confirmation before publishing.

## Private Online Output

`Publish Assistant Output` explicitly stores the latest snapshot in a private R2
object scoped to the signed-in Pocketview user. `GET /api/v1/assistant` returns it
with `ETag` and `Cache-Control: private, no-store`; it returns 404 before the first
publication. Nothing publishes automatically. `PUT` is same-origin, authenticated,
validated and conditional (`If-Match`, or `If-None-Match: *` for first publication).
Conflicts return 409. V2 preserves its UUID and timestamp across PUT/GET, rejects
older replacements and changed content reusing the latest snapshot ID. Consumers
must also enforce stale/previously-seen-ID checks across their full import history.

V2 is capped at 12 MiB / 50,000 rows, with a 56,000-byte per-row limit and 12,000
characters per transaction text field (ID: 256). V1's endpoint limit remains
20 MiB, but JLBYO accepts only 12 MiB. Downloads use compact JSON. V2 checks
credential-like strings and NUL text locally and server-side. These checks are
not a complete secret classifier. Installation-specific work-source exclusions
remain JLBYO's responsibility; Pocketview does not read its private configuration.

Pocketview now uses the same Supabase email/password account as the Personal Life
Assistant, with a separate server-side owner gate. Browser requests use secure,
HttpOnly session cookies. A server-side consumer may send an owner access token
from the configured Supabase project as `Authorization: Bearer …`; Pocketview
verifies it with the provider and requires the configured owner ID and confirmed
email. Never copy tokens into source code or share platform bypass credentials.
Client-supplied Sites identity headers are ignored. The server maps the approved
owner to the existing R2 namespace, preserving prior published output.

The login page is public; workspace routes and output remain authenticated.
Publishing alone does not connect the assistant. Use JSON import until an automated
consumer has been configured and tested. No CORS access is enabled. Publishing
still requires a same-origin request and a revision precondition.

This is an output copy, not a full recovery backup: no learning rules, Master Data,
audit snapshots or original CSV files are published. V2 includes only the budget
settings described above. Use encrypted history backups for recovery.
Clear Published Output replaces the online copy with an empty snapshot;
it cannot recall files already downloaded. Local reset does not erase external
copies. Keep JSON files out of Git and store them in a private folder.

R2 conditional writes follow the [Workers API contract](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
