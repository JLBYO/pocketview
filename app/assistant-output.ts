import { bankDate } from "./csv-import";

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

export type AssistantOutput = ReturnType<typeof buildAssistantOutput>;

/** Validate and rebuild server-side; never accept supplied totals or coercive values. */
export function validateAssistantOutput(value: unknown): AssistantOutput {
    if (!value || typeof value !== "object") throw new Error("Expected a Pocketview snapshot.");
    const data = value as Record<string, unknown>;
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
