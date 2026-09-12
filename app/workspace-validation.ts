import { bankDate } from "./csv-import";

/** Validate a complete restore before any write; tolerate absent legacy optional fields. */
export function validateWorkspaceState(value: unknown): void {
    if (!value || typeof value !== "object") throw new Error("Invalid backup state.");
    const state = value as Record<string, unknown>;
    for (const name of ["txs", "rules", "master"]) if (!Array.isArray(state[name])) throw new Error(`Backup is missing ${name}.`);
    const rows = (name: string, fields: string[]) => {
        const list = state[name];
        if (list === undefined && name === "imports") return;
        if (!Array.isArray(list)) throw new Error(`Invalid ${name}.`);
        for (const entry of list) {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`Invalid ${name} record.`);
            for (const field of fields) if (entry[field] !== undefined && typeof entry[field] !== "string") throw new Error(`Invalid ${name} ${field}.`);
        }
    };
    rows("txs", ["id", "bank", "account", "date", "description", "note", "merchant", "category", "detail", "place", "importId", "sourceFile"]);
    rows("rules", ["id", "match", "merchant", "category", "detail", "place", "mode", "sourceDescription"]);
    rows("master", ["id", "ruleId", "direction", "originalMerchant", "merchant", "category", "detail", "place"]);
    rows("imports", ["id", "bank", "account", "sourceFile", "importedAt", "firstDate", "lastDate"]);
    const ids = new Set<string>();
    for (const row of state.txs as Record<string, unknown>[]) {
        bankDate(String(row.date || ""));
        if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || !Number.isSafeInteger(Math.round(row.amount * 100))) throw new Error("Invalid backup amount.");
        if (row.id) { if (ids.has(String(row.id))) throw new Error("Duplicate transaction IDs in backup."); ids.add(String(row.id)); }
    }
    if (state.categories !== undefined && (!Array.isArray(state.categories) || state.categories.some(value => typeof value !== "string"))) throw new Error("Invalid categories.");
    if (state.budgetGuides !== undefined && (!state.budgetGuides || typeof state.budgetGuides !== "object" || Array.isArray(state.budgetGuides) || Object.values(state.budgetGuides).some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0))) throw new Error("Invalid budget guides.");
    if (state.savingsTarget !== undefined && (typeof state.savingsTarget !== "number" || !Number.isFinite(state.savingsTarget) || state.savingsTarget < 0 || state.savingsTarget > 100)) throw new Error("Invalid savings target.");
    for (const field of ["fullSnapshot", "excludeTransfers"]) if (state[field] !== undefined && typeof state[field] !== "boolean") throw new Error(`Invalid ${field}.`);
    for (const entry of (state.imports || []) as Record<string, unknown>[]) {
        if (typeof entry.importedAt !== "string" || !Number.isFinite(Date.parse(entry.importedAt))) throw new Error("Invalid import history date.");
        for (const field of ["rowCount", "addedCount", "skippedCount", "fileSize", "lastModified"]) if (entry[field] !== undefined && (typeof entry[field] !== "number" || !Number.isSafeInteger(entry[field]) || entry[field] < 0)) throw new Error(`Invalid import ${field}.`);
        for (const field of ["firstDate", "lastDate"]) if (entry[field]) bankDate(String(entry[field]));
    }
}

export function validateWorkspaceAudit(value: unknown): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) throw new Error("Invalid change history.");
    for (const entry of value) {
        if (!entry || typeof entry !== "object") throw new Error("Invalid change history entry.");
        for (const field of ["id", "at", "action", "detail"]) if (typeof entry[field] !== "string") throw new Error(`Invalid change history ${field}.`);
        if (!Number.isFinite(Date.parse(entry.at))) throw new Error("Invalid change history date.");
        if (!entry.snapshot || typeof entry.snapshot !== "object" || Array.isArray(entry.snapshot)) throw new Error("Invalid change history snapshot.");
        // Older compact history omitted transactions. It stays readable but cannot Undo.
        validateWorkspaceState({ ...entry.snapshot, txs: entry.snapshot.txs ?? [] });
    }
}
