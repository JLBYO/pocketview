# Building Your Transaction History

1. Choose **Add Bank CSV**. Select one or several ANZ exports.
2. Use the same **Bank** and **Account Name** for an existing account. Different
   accounts remain separate even when their transactions look identical.
3. Choose **Add New Transactions**. Existing transactions and saved classifications
   stay intact. The result shows how many rows were added or skipped.

Matching uses the account, date, signed amount, original bank description and
extended details, not the editable merchant or category. It compares occurrences
so genuine repeated payments are retained. Missing same-day or older transactions
can still be added; this is deliberately not just a newest-date cutoff. A bank
export with changed descriptions or missing extended details may not match the
original export. Keep the export format consistent. Without bank-issued unique
transaction IDs, identical payments in disjoint partial exports can be ambiguous.

## Storage And Recovery

The working history, knowledge, budgets and original imports are saved together
in this browser's IndexedDB database. Wait for **History Saved On This Device**.
If another tab changes the history, reload before continuing. The app rejects a
stale tab's save instead of overwriting newer records.

In **Master Data**, import history includes original CSV downloads. **Save Encrypted
History Backup** includes the full working history and source files. Save it in a
private Google Drive or OneDrive folder, keep its password safe, then use **Restore
History Backup** to move to another browser or device. Folder syncing is handled
by your storage provider; Pocketview does not automatically connect to either one.

Browser storage is not a backup: clearing browser data can remove it. Local archives
are also stored in that browser. Export encrypted backups regularly. Reset first
archives the current workspace and explicitly clears its active data and knowledge.

## Personal Life Assistant

**Master Data → Download Assistant JSON** produces a complete, unfiltered snapshot
of saved transactions. See [the output contract](ASSISTANT-OUTPUT.md). Automated
assistant access is not connected yet. The optional private published output is
separate from both the working database and your complete encrypted backups.
