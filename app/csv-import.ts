/** Bank import primitives. Never use the editable classification as a bank identity. */
export function csvRows(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [], field = "", quoted = false, closed = false;
    const finish = () => { row.push(field.trim()); field = ""; closed = false; };
    const input = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (quoted) {
            if (char === '"' && input[i + 1] === '"') { field += '"'; i++; }
            else if (char === '"') { quoted = false; closed = true; }
            else field += char;
        } else if (char === '"' && !field.trim() && !closed) { quoted = true; field = ""; }
        else if (char === ",") finish();
        else if (char === "\n" || char === "\r") {
            if (char === "\r" && input[i + 1] === "\n") i++;
            finish(); if (row.some(Boolean)) rows.push(row); row = [];
        } else if (closed && char.trim()) throw new Error("Unexpected text after a quoted CSV value.");
        else if (!closed) field += char;
    }
    if (quoted) throw new Error("The CSV has an unfinished quoted value. Export the file again.");
    finish(); if (row.some(Boolean)) rows.push(row);
    return rows;
}

export function bankDate(value: string): string {
    const parts = value.trim().match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/);
    if (!parts) throw new Error(`Invalid transaction date: ${value}`);
    const iso = parts[1].length === 4;
    const year = Number(iso ? parts[1] : parts[3]), month = Number(parts[2]), day = Number(iso ? parts[3] : parts[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 2200 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`Invalid transaction date: ${value}`);
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function amountInCents(value: string): number {
    const raw = value.trim().replace(/\$/g, "");
    const negative = /^\(.*\)$/.test(raw);
    const number = negative ? raw.slice(1, -1) : raw;
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(number)) throw new Error("Invalid amount; expected dollars and cents.");
    const cents = Math.round(Number(number.replace(/,/g, "")) * 100) * (negative ? -1 : 1);
    if (!Number.isSafeInteger(cents)) throw new Error("The amount is outside the supported range.");
    return cents;
}

export type BankRow = { date: string; amount: number; description: string; note: string };
export function parseBankCsv(text: string): BankRow[] {
    const rows = csvRows(text);
    if (!rows.length) throw new Error("No transactions found in the CSV.");
    const headed = !/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(rows[0][0]);
    let date = 0, amount = 1, description = 2, note = 7;
    if (headed) {
        const headers = rows.shift()!.map(value => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
        const find = (...names: string[]) => { for (const name of names) { const index = headers.indexOf(name); if (index >= 0) return index; } return -1; };
        date = find("date", "transaction date", "posting date", "posted date");
        amount = find("amount", "transaction amount", "amount aud");
        description = find("bank description", "description", "transaction description", "narrative", "details");
        note = find("extended details", "extended transaction details", "note", "notes", "memo");
        if (date < 0 || amount < 0 || description < 0) throw new Error("Could not identify Date, Amount and Description columns. Use a bank CSV with a signed Amount column.");
    }
    if (!rows.length) throw new Error("The CSV contains headers but no transactions.");
    return rows.map((row, index) => {
        try {
            if (!row[description]?.trim()) throw new Error("A transaction description is missing.");
            return { date: bankDate(row[date] || ""), amount: amountInCents(row[amount] || "") / 100, description: row[description], note: note >= 0 ? row[note] || "" : "" };
        } catch (error) {
            throw new Error(`CSV record ${index + (headed ? 2 : 1)}: ${error instanceof Error ? error.message : "Invalid record"} Nothing from this import was saved.`);
        }
    });
}

export function transactionIdentity(row: BankRow & { bank: string; account: string }): string {
    // Keep punctuation/reference numbers; normalize only inconsequential case and spacing.
    const text = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
    return JSON.stringify([text(row.bank), text(row.account), bankDate(row.date), Math.round(row.amount * 100), text(row.description), text(row.note)]);
}
