# Verification — Incremental History And Assistant Output

Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. The test command builds production
output and runs Node's built-in test runner. The original history review passed 31
tests; the shared-login update passes 40 tests on 12 September 2026.

Regression coverage includes strict CSV dates/amounts and multiline quoting,
account-aware overlap matching, legitimate repeats, late records, immutable saved
classifications, linear merge work at 3,900 records, safe Undo snapshots, malformed
backup rejection, atomic IndexedDB writes, stale-tab conflicts and aborted writes.
Assistant tests cover schema validation, integer-cent totals, user isolation,
authentication, same-origin writes and conditional publication conflicts.

Browser checks used synthetic files on an isolated localhost origin, not real
bank data or the production workspace:

- Three-row import survived reload.
- Overlapping five-row export added two rows and skipped three; a saved merchant
  and category were retained. Undo restored the prior transaction history.
- Multiple learning rules created linked Master Data entries.
- Invalid knowledge JSON was rejected without removing existing rules.
- A 3,900-row import retained the original three rows. Reimporting the same file
  added zero and skipped all 3,900.
- Master Data remained within the viewport at 390 px; new output actions stack.

These checks are not a guarantee of defect-free software. Cloud publication is
conditional on trusted Sites authentication; no real financial snapshot was
uploaded during testing. Automated cross-app consumption and Drive/OneDrive sync
are not implemented. The final browser reset check was inconclusive because the
browser control connection timed out; storage reset is covered by executable tests.

## Shared Login And Tab Guides

The additional checks cover all six contextual guides, owner-only authentication,
forged-header rejection, login/logout CSRF checks, secure cookies, session renewal,
missing-configuration failure, and the compiled Worker's anonymous route boundary.
A browser test with a synthetic provider exercised the actual production bundle:
sign-in, session check, workspace opening, contextual guides, sign-out and blocked
re-entry afterward. Help was checked at desktop and 390 px widths without overflow.
The login form's referrer policy preserves the Origin needed for same-origin POST
validation; this browser-discovered regression is now asserted in tests.

The real owner's password was not read or used. Production identity configuration
was matched to the shared provider's confirmed owner record without modifying it.

## Hosted Login And Recovery Regression

The earlier synthetic browser harness used Node fetch, which did not detect that
Cloudflare rejects `redirect: "error"` before contacting the provider. This was
reproduced in Wrangler's actual Worker runtime. Authentication now uses manual
redirect handling and rejects all 3xx responses without forwarding credentials.

`tests/worker-auth.test.mjs` loads the compiled production Worker into Miniflare
with production compatibility flags and ESM module rules. It exercises password
login, secure cookies, session refresh, invalid credentials, forbidden redirects,
approved-email recovery, destination tampering, CSRF and email sending quotas.
The full suite now contains 48 passing tests, including these runtime cases.

Recovery now starts with a local Pocketview form. The shared provider sends the
email and the existing assistant handles its verified password-update callback.
Provider acceptance does not prove inbox delivery; the owner must open the newest
email and set their password themselves. Tests never change a real password.
