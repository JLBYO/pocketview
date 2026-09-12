# Verification — Incremental History And Assistant Output

Run `pnpm lint`, `pnpm typecheck` and `pnpm test`. The test command builds production
output and runs Node's built-in test runner. All 31 tests passed on 12 September 2026.

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
