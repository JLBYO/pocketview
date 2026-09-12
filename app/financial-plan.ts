export type PlanTransaction = { id: string; bank: string; accountName: string; amountCents: number };
export type ScheduleEntry = {
    id: string; title: string; kind: "bill" | "subscription" | "payment" | "wage";
    amountCents: number | null; date: string;
    frequency: "once" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
    endDate: string | null; status: "planned" | "estimated" | "paid" | "cancelled";
    category: string; accountName: string;
};
export type FinancialPlan = {
    asOf: string; savingsTargetPercent: number | null;
    categoryGuides: { category: string; monthlyCents: number }[];
    transferPairs: { inboundId: string; outboundId: string; confirmed: boolean }[];
    schedule: ScheduleEntry[];
};

export function exactFields(value: unknown, keys: string[], label: string): asserts value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error(`Invalid ${label} fields.`);
}
export function realIsoDate(value: unknown): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000") && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
}
export function sydneyDate(at: string): string {
    const parts = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(at));
    return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}
const text = (value: unknown, max: number, label: string, empty = false): string => {
    if (typeof value !== "string" || value.length > max || value.includes("\0") || (!empty && !value.trim())) throw new Error(`Invalid ${label}; use ${empty ? "up to" : "1–"}${max} characters.`);
    return value;
};
const cents = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1e12) throw new Error("Plan amounts must be non-negative integer cents, at most 1e12.");
    return value;
};
const list = (value: unknown, max: number, label: string): unknown[] => {
    if (!Array.isArray(value) || value.length > max) throw new Error(`The financial plan supports at most ${max} ${label}; nothing was exported.`);
    return value;
};

export function validateFinancialPlan(value: unknown, transactions: PlanTransaction[], generatedAt: string): FinancialPlan {
    exactFields(value, ["asOf", "savingsTargetPercent", "categoryGuides", "transferPairs", "schedule"], "financial plan");
    if (!realIsoDate(value.asOf) || value.asOf > sydneyDate(generatedAt)) throw new Error("Plan date must be a real date no later than the export date in Sydney.");
    const target = value.savingsTargetPercent;
    if (target !== null && (typeof target !== "number" || !Number.isInteger(target) || target < 0 || target > 100)) throw new Error("Savings target must be an integer from 0 to 100, or unset.");
    const categories = new Set<string>(), ids = new Set<string>(), paired = new Set<string>(), rows = new Map(transactions.map(row => [row.id, row]));
    const categoryGuides = list(value.categoryGuides, 100, "category guides").map(entry => {
        exactFields(entry, ["category", "monthlyCents"], "category guide");
        const category = text(entry.category, 120, "guide category"), key = category.trim().toLowerCase();
        if (categories.has(key)) throw new Error("Merge duplicate category guides before exporting.");
        categories.add(key); return { category, monthlyCents: cents(entry.monthlyCents) };
    });
    const transferPairs = list(value.transferPairs, 5000, "transfer pairs").map(entry => {
        exactFields(entry, ["inboundId", "outboundId", "confirmed"], "transfer pair");
        const inboundId = text(entry.inboundId, 256, "inbound ID"), outboundId = text(entry.outboundId, 256, "outbound ID"), inbound = rows.get(inboundId), outbound = rows.get(outboundId);
        if (!inbound || !outbound || inbound.amountCents <= 0 || outbound.amountCents !== -inbound.amountCents || (inbound.bank === outbound.bank && inbound.accountName === outbound.accountName) || paired.has(inboundId) || paired.has(outboundId) || typeof entry.confirmed !== "boolean") throw new Error("Invalid or overlapping transfer pair.");
        paired.add(inboundId); paired.add(outboundId); return { inboundId, outboundId, confirmed: entry.confirmed };
    });
    const schedule = list(value.schedule, 300, "schedule entries").map(entry => {
        exactFields(entry, ["id", "title", "kind", "amountCents", "date", "frequency", "endDate", "status", "category", "accountName"], "schedule entry");
        const id = text(entry.id, 256, "schedule ID");
        if (ids.has(id)) throw new Error("Schedule IDs must be unique."); ids.add(id);
        const title = text(entry.title, 160, "schedule title"), category = text(entry.category, 120, "schedule category", true), accountName = text(entry.accountName, 120, "schedule account", true);
        if (typeof entry.kind !== "string" || !["bill", "subscription", "payment", "wage"].includes(entry.kind) || typeof entry.frequency !== "string" || !["once", "weekly", "fortnightly", "monthly", "quarterly", "yearly"].includes(entry.frequency) || typeof entry.status !== "string" || !["planned", "estimated", "paid", "cancelled"].includes(entry.status) || (entry.status === "paid" && entry.frequency !== "once")) throw new Error("Invalid schedule kind, frequency or status.");
        if (!realIsoDate(entry.date) || (entry.endDate !== null && (!realIsoDate(entry.endDate) || entry.endDate < entry.date))) throw new Error("Invalid schedule date or inclusive end date.");
        return { id, title, kind: entry.kind, amountCents: entry.amountCents === null ? null : cents(entry.amountCents), date: entry.date, frequency: entry.frequency, endDate: entry.endDate, status: entry.status, category, accountName } as ScheduleEntry;
    });
    return { asOf: value.asOf, savingsTargetPercent: target, categoryGuides, transferPairs, schedule };
}

export type PlanSource = {
    savingsTarget?: number; savingsTargetSet?: boolean; budgetGuides?: Record<string, number>;
    pairs: { inbound: { id: string }; outbound: { id: string } }[];
    recurring: { key: string; merchant: string; amountCents: number; frequency: string; nextIsoDate: string; category: string; account: string }[];
};
export function savedSavingsTarget(source: Pick<PlanSource, "savingsTarget" | "savingsTargetSet">): number | null {
    // Older saves don't identify whether the default 20% was deliberately chosen.
    return source.savingsTargetSet === false || source.savingsTarget === undefined || (source.savingsTargetSet !== true && source.savingsTarget === 20) ? null : source.savingsTarget;
}
export async function buildFinancialPlan(source: PlanSource, transactions: PlanTransaction[], generatedAt: string): Promise<FinancialPlan> {
    const asOf = sydneyDate(generatedAt);
    if (!transactions.length) return { asOf, savingsTargetPercent: null, categoryGuides: [], transferPairs: [], schedule: [] };
    if (source.recurring.length > 300) throw new Error("More than 300 recurring candidates. Use the v1 transaction-only format until these can be reviewed.");
    const frequencies: Record<string, ScheduleEntry["frequency"]> = { Weekly: "weekly", Fortnightly: "fortnightly", Monthly: "monthly", Quarterly: "quarterly", Annual: "yearly" };
    const schedule = await Promise.all(source.recurring.map(async row => {
        const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(row.key));
        const id = "recurring-" + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
        if (!frequencies[row.frequency]) throw new Error("Unsupported recurring frequency.");
        return { id, title: row.merchant, kind: "payment", amountCents: row.amountCents, date: row.nextIsoDate, frequency: frequencies[row.frequency], endDate: null, status: "estimated", category: row.category, accountName: row.account };
    }));
    return validateFinancialPlan({ asOf, savingsTargetPercent: savedSavingsTarget(source), categoryGuides: Object.entries(source.budgetGuides || {}).sort(([a], [b]) => a.localeCompare(b)).map(([category, amount]) => ({ category, monthlyCents: Math.round(amount * 100) })), transferPairs: source.pairs.map(pair => ({ inboundId: pair.inbound.id, outboundId: pair.outbound.id, confirmed: false })).sort((a, b) => a.inboundId.localeCompare(b.inboundId)), schedule: schedule.sort((a, b) => a.id.localeCompare(b.id)) }, transactions, generatedAt);
}
