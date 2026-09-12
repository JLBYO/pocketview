import { bankDate } from "./csv-import";
import { exactFields, realIsoDate, validateFinancialPlan } from "./financial-plan";
import type { FinancialPlan } from "./financial-plan";
import { containsOutputCredential } from "./output-safety";

export type OutputTransaction = {
    id: string; bank: string; account: string; date: string; amount: number;
    description: string; merchant: string; category: string; detail: string; place: string;
    note: string; sourceFile: string; importId: string;
};

/** A complete, unfiltered snapshot. Consumers replace their previous snapshot, not append it. */
export function buildAssistantOutput(rows: OutputTransaction[], generatedAt = new Date().toISOString()) {
    const ids = new Set<string>();
    const transactions = rows.map(row => {
        if (!row.id || ids.has(row.id)) throw new Error("Transaction IDs must be unique before exporting.");
        ids.add(row.id);
        const [day, month, year] = bankDate(row.date).split("/");
        const amountCents = Math.round(row.amount * 100);
        if (!Number.isSafeInteger(amountCents)) throw new Error("Invalid transaction amount.");
        return {
            id: row.id, bank: row.bank, accountName: row.account, date: `${year}-${month}-${day}`, amountCents,
            direction: amountCents >= 0 ? "Inbound" as const : "Outbound" as const,
            merchant: row.merchant, category: row.category || "Unclassified", categoryDetail: row.detail, place: row.place,
            description: row.description, extendedDetails: row.note, sourceFile: row.sourceFile, importId: row.importId,
            needsReview: !row.merchant.trim() || !row.category || row.category === "Unclassified" || !row.detail.trim()
        };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const inboundCents = transactions.reduce((sum, row) => sum + Math.max(0, row.amountCents), 0);
    const outboundCents = transactions.reduce((sum, row) => sum + Math.max(0, -row.amountCents), 0);
    if (!Number.isSafeInteger(inboundCents) || !Number.isSafeInteger(outboundCents)) throw new Error("Totals exceed the supported range.");
    return {
        schemaVersion: 1 as const, source: "pocketview" as const, kind: "transaction_snapshot" as const,
        snapshotId: crypto.randomUUID(), generatedAt, currency: "AUD" as const, complete: true as const,
        scope: "all_saved_transactions" as const, transfersExcluded: false as const,
        dateRange: { from: transactions[0]?.date || null, to: transactions.at(-1)?.date || null },
        totals: { transactionCount: transactions.length, inboundCents, outboundCents, netCents: inboundCents - outboundCents, needsReviewCount: transactions.filter(row => row.needsReview).length },
        transactions
    };
}

export type AssistantOutputV1 = ReturnType<typeof buildAssistantOutput>;
export type AssistantOutputV2 = Omit<AssistantOutputV1, "schemaVersion"> & { schemaVersion: 2; financialPlan: FinancialPlan };
export type AssistantOutput = AssistantOutputV1 | AssistantOutputV2;

/** V1 stays available; v2 adds a validated plan without changing raw movement totals. */
export function buildAssistantOutputV2(rows: OutputTransaction[], financialPlan: FinancialPlan, generatedAt = new Date().toISOString()): AssistantOutputV2 {
    return validateOutputV2({ ...buildAssistantOutput(rows, generatedAt), schemaVersion: 2, financialPlan });
}

const transactionFields = ["id", "bank", "accountName", "date", "amountCents", "direction", "merchant", "category", "categoryDetail", "place", "description", "extendedDetails", "sourceFile", "importId", "needsReview"];
const totalFields = ["transactionCount", "inboundCents", "outboundCents", "netCents", "needsReviewCount"];
function validateOutputV2(value: unknown): AssistantOutputV2 {
    exactFields(value, ["schemaVersion", "source", "kind", "snapshotId", "generatedAt", "currency", "complete", "scope", "transfersExcluded", "dateRange", "totals", "transactions", "financialPlan"], "v2 snapshot");
    const encoded = JSON.stringify(value);
    if (new TextEncoder().encode(encoded).byteLength > 12 * 1024 * 1024) throw new Error("V2 assistant snapshots must be no larger than 12 MiB.");
    if (containsOutputCredential(encoded)) throw new Error("Remove credentials, passwords and recovery codes before exporting. Nothing was published.");
    if (value.schemaVersion !== 2 || typeof value.snapshotId !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value.snapshotId) || typeof value.generatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.generatedAt) || !realIsoDate(value.generatedAt.slice(0, 10)) || !Number.isFinite(Date.parse(value.generatedAt)) || Date.parse(value.generatedAt) > Date.now() + 300000 || Number(value.generatedAt.slice(11, 13)) >= 24 || Number(value.generatedAt.slice(14, 16)) >= 60 || Number(value.generatedAt.slice(17, 19)) >= 60) throw new Error("Invalid snapshot identity or export time; check your device clock.");
    exactFields(value.dateRange, ["from", "to"], "date range"); exactFields(value.totals, totalFields, "totals");
    if (!Array.isArray(value.transactions) || value.transactions.length > 50000) throw new Error("At most 50,000 transactions can be exported.");
    for (const row of value.transactions) {
        exactFields(row, transactionFields, "transaction");
        for (const field of transactionFields.filter(field => !["amountCents", "needsReview"].includes(field))) if (typeof row[field] !== "string" || (row[field] as string).length > 12000 || (row[field] as string).includes("\0")) throw new Error("Invalid transaction text.");
        if (!(row.id as string).trim() || (row.id as string).length > 256 || !realIsoDate(row.date) || typeof row.amountCents !== "number" || row.direction !== (row.amountCents >= 0 ? "Inbound" : "Outbound") || typeof row.needsReview !== "boolean") throw new Error("Invalid transaction identity, date or direction.");
        if (new TextEncoder().encode(JSON.stringify(row)).byteLength > 56000) throw new Error("A transaction exceeds the assistant's text limit; shorten its notes.");
    }
    const base = validateAssistantOutput({ ...value, schemaVersion: 1 });
    if (totalFields.some(field => (value.totals as Record<string, unknown>)[field] !== base.totals[field as keyof typeof base.totals]) || value.dateRange.from !== base.dateRange.from || value.dateRange.to !== base.dateRange.to) throw new Error("Snapshot totals or dates do not match its transactions.");
    const originalRows = new Map(value.transactions.map(row => [row.id, row]));
    if (base.transactions.some(row => row.needsReview !== originalRows.get(row.id)?.needsReview)) throw new Error("Transaction review flags do not match the saved details.");
    const financialPlan = validateFinancialPlan(value.financialPlan, base.transactions, value.generatedAt);
    // Preserve export identity/time across publication and GET for consumer stale/idempotency checks.
    const transactions = base.transactions.map(row => ({ ...row, category: originalRows.get(row.id)!.category as string }));
    return { ...base, transactions, schemaVersion: 2, snapshotId: value.snapshotId, generatedAt: value.generatedAt, financialPlan };
}

/** Validate and rebuild server-side; never accept supplied totals or coercive values. */
export function validateAssistantOutput(value: unknown): AssistantOutput {
    if (!value || typeof value !== "object") throw new Error("Expected a Pocketview snapshot.");
    const data = value as Record<string, unknown>;
    if (data.schemaVersion === 2) return validateOutputV2(data);
    if (data.schemaVersion !== 1 || data.source !== "pocketview" || data.kind !== "transaction_snapshot" || data.currency !== "AUD" || data.complete !== true || data.scope !== "all_saved_transactions" || data.transfersExcluded !== false || !Array.isArray(data.transactions) || data.transactions.length > 50000) throw new Error("Unsupported Pocketview snapshot.");
    const rows = data.transactions.map((entry: unknown) => {
        if (!entry || typeof entry !== "object") throw new Error("Invalid transaction.");
        const row = entry as Record<string, unknown>;
        for (const field of ["id", "bank", "accountName", "date", "merchant", "category", "categoryDetail", "place", "description", "extendedDetails", "sourceFile", "importId"]) {
            if (typeof row[field] !== "string" || (row[field] as string).length > 12000) throw new Error(`Invalid ${field}.`);
        }
        if (!Number.isSafeInteger(row.amountCents) || Math.abs(row.amountCents as number) > 1e12) throw new Error("Invalid amountCents.");
        return { id: row.id, bank: row.bank, account: row.accountName, date: row.date, amount: (row.amountCents as number) / 100, merchant: row.merchant, category: row.category, detail: row.categoryDetail, place: row.place, description: row.description, note: row.extendedDetails, sourceFile: row.sourceFile, importId: row.importId } as OutputTransaction;
    });
    return buildAssistantOutput(rows);
}
