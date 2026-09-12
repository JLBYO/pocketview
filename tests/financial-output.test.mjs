import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

function compile(source, dependencies = {}) {
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const testModule = { exports: {} };
    new Function("module", "exports", "require", code)(testModule, testModule.exports, name => {
        assert.ok(dependencies[name], `Unmapped dependency ${name}`); return dependencies[name];
    });
    return testModule.exports;
}
const source = name => readFile(new URL(`../${name}`, import.meta.url), "utf8");
const plan = compile(await source("app/financial-plan.ts")), safety = compile(await source("app/output-safety.ts")), csv = compile(await source("app/csv-import.ts"));
const output = compile(await source("app/assistant-output.ts"), { "./financial-plan": plan, "./output-safety": safety, "./csv-import": csv });
const { assistantApi } = compile(await source("worker/assistant-api.ts"), { "../app/assistant-output": output });
const page = await source("app/page.tsx");
const helpers = ["normalizeKey", "accountKey", "dateMillis"].map(name => page.split("\n").find(line => line.startsWith(`const ${name} =`))).join("\n");
const patterns = compile(helpers + "\n" + page.slice(page.indexOf("const transferSignal ="), page.indexOf("const bytesToBase64 =")) + "\nexport { matchTransfers, recurringPayments };");
const at = "2026-09-11T15:00:00.000Z";
const tx = (patch = {}) => ({ id: "out", bank: "Example Bank", account: "Everyday", date: "10/09/2026", amount: -10.15, description: "EXAMPLE TRANSFER", note: "", merchant: "Example", category: "Bills", detail: "Utilities", place: "", importId: "synthetic", sourceFile: "synthetic.csv", ...patch });
const rows = [tx(), tx({ id: "in", account: "Savings", amount: 10.15 })];
const recurring = { key: "example bank|everyday|example", merchant: "Example", amountCents: 1015, frequency: "Monthly", nextIsoDate: "2026-10-10", category: "Bills", account: "Everyday" };
const saved = { savingsTarget: 30, savingsTargetSet: true, budgetGuides: { Bills: 10.15 }, pairs: [{ inbound: { id: "in" }, outbound: { id: "out" } }], recurring: [recurring] };
async function fixture(changes = {}, transactions = rows) {
    const base = output.buildAssistantOutput(transactions, at);
    return output.buildAssistantOutputV2(transactions, await plan.buildFinancialPlan({ ...saved, ...changes }, base.transactions, at), at);
}
const snapshot = await fixture();
const validate = value => output.validateAssistantOutput(value);

test("v2 adds exactly one plan, keeps v1 fields/totals and preserves identity through validation", () => {
    const v1 = output.buildAssistantOutput(rows, at);
    const { financialPlan, schemaVersion, snapshotId, ...rest } = snapshot;
    const { schemaVersion: oldVersion, snapshotId: oldId, ...oldRest } = v1;
    assert.equal(schemaVersion, 2); assert.equal(oldVersion, 1); assert.notEqual(snapshotId, oldId);
    assert.deepEqual(rest, oldRest); assert.deepEqual(validate(snapshot), snapshot);
    assert.equal(financialPlan.asOf, "2026-09-12"); assert.equal(financialPlan.savingsTargetPercent, 30);
    assert.deepEqual(financialPlan.categoryGuides, [{ category: "Bills", monthlyCents: 1015 }]);
    assert.equal(financialPlan.transferPairs[0].confirmed, false);
    assert.equal(financialPlan.schedule[0].status, "estimated"); assert.equal(financialPlan.schedule[0].kind, "payment");
    assert.equal(snapshot.totals.inboundCents, 1015); assert.equal(snapshot.totals.outboundCents, 1015);
});

test("unset/default target is null; explicitly selected zero or 20 and zero guides survive", async () => {
    for (const value of [undefined, {}, { savingsTarget: 20 }, { savingsTarget: 30, savingsTargetSet: false }]) assert.equal(plan.savedSavingsTarget(value || {}), null);
    for (const savingsTarget of [0, 20, 100]) assert.equal((await fixture({ savingsTarget })).financialPlan.savingsTargetPercent, savingsTarget);
    assert.equal(plan.savedSavingsTarget({ savingsTarget: 35 }), 35);
    assert.equal((await fixture({ budgetGuides: { Bills: 0 } })).financialPlan.categoryGuides[0].monthlyCents, 0);
});

test("recurring IDs are stable across later imports and draft dates, never infer wages", async () => {
    const later = await fixture({ recurring: [{ ...recurring, amountCents: 1200, nextIsoDate: "2026-11-10" }] });
    assert.equal(later.financialPlan.schedule[0].id, snapshot.financialPlan.schedule[0].id);
    assert.match(later.financialPlan.schedule[0].id, /^recurring-[a-f0-9]{64}$/);
    const periods = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annual"];
    const mapped = await fixture({ recurring: periods.map((frequency, index) => ({ ...recurring, key: String(index), frequency })) });
    assert.deepEqual(mapped.financialPlan.schedule.map(row => row.frequency).sort(), ["weekly", "fortnightly", "monthly", "quarterly", "yearly"].sort());
    assert.ok(mapped.financialPlan.schedule.every(row => row.kind === "payment" && row.status === "estimated"));
});

test("existing detectors use signed cent averages and exclude inbound rows and transfer candidates", () => {
    const list = [tx({ date: "01/08/2026" }), tx({ id: "later", date: "01/09/2026", amount: -10.16 }), tx({ id: "salary1", amount: 50, date: "01/08/2026" }), tx({ id: "salary2", amount: 50, date: "01/09/2026" })];
    const found = patterns.recurringPayments(list, new Set());
    assert.equal(found.length, 1); assert.equal(found[0].amountCents, 1016); assert.equal(found[0].amount, 10.16);
    assert.equal(found[0].nextIsoDate, "2026-10-02");
    assert.equal(patterns.recurringPayments(list, new Set(["out", "later"])).length, 0);
    const pairs = patterns.matchTransfers(rows);
    assert.equal(pairs.length, 1); assert.equal(pairs[0].inbound.id, "in");
});

test("empty complete exports clear both imported history and plan", async () => {
    const empty = await fixture({}, []);
    assert.deepEqual(empty.financialPlan, { asOf: "2026-09-12", savingsTargetPercent: null, categoryGuides: [], transferPairs: [], schedule: [] });
    assert.equal(empty.transactions.length, 0); assert.deepEqual(empty.dateRange, { from: null, to: null });
});

test("valid empty category and signed boundary cents survive publication without changing snapshot identity", async () => {
    const blank = structuredClone(snapshot); blank.transactions[0].category = ""; blank.transactions[0].needsReview = true; blank.totals.needsReviewCount = 1;
    assert.deepEqual(validate(blank), blank);
    for (const amount of [0, .01, -.01, 1e10, -1e10]) {
        const fixtureValue = await fixture({ pairs: [], recurring: [] }, [tx({ amount })]);
        assert.equal(validate(fixtureValue).transactions[0].amountCents, Math.round(amount * 100));
    }
});

const invalidPlanChanges = {
    "extra field": p => { p.extra = true; }, "missing field": p => { delete p.asOf; },
    "future asOf": p => { p.asOf = "2026-09-13"; }, "invalid leap date": p => { p.asOf = "2025-02-29"; },
    "fractional target": p => { p.savingsTargetPercent = 1.5; }, "coerced target": p => { p.savingsTargetPercent = "20"; },
    "duplicate guides": p => { p.categoryGuides.push({ category: " bills ", monthlyCents: 1 }); },
    "too many guides": p => { p.categoryGuides = Array.from({ length: 101 }, (_, i) => ({ category: String(i), monthlyCents: 0 })); },
    "negative guide": p => { p.categoryGuides[0].monthlyCents = -1; }, "fractional guide": p => { p.categoryGuides[0].monthlyCents = .1; },
    "overlapping transfers": p => { p.transferPairs.push(p.transferPairs[0]); }, "missing transfer": p => { p.transferPairs[0].outboundId = "missing"; },
    "wrong transfer sign": p => { p.transferPairs[0].inboundId = "out"; }, "coerced confirmation": p => { p.transferPairs[0].confirmed = "false"; },
    "too many pairs": p => { p.transferPairs = Array(5001).fill(p.transferPairs[0]); },
    "duplicate schedule IDs": p => { p.schedule.push(p.schedule[0]); }, "too many schedules": p => { p.schedule = Array(301).fill(p.schedule[0]); },
    "empty ID": p => { p.schedule[0].id = " "; }, "long ID": p => { p.schedule[0].id = "a".repeat(257); },
    "missing account": p => { delete p.schedule[0].accountName; }, "extra bank": p => { p.schedule[0].bank = "Bank"; },
    "invalid date": p => { p.schedule[0].date = "2026-02-30"; }, "end before start": p => { p.schedule[0].endDate = "2026-10-09"; },
    "recurring paid": p => { p.schedule[0].status = "paid"; }, "bad frequency": p => { p.schedule[0].frequency = "daily"; },
    "negative schedule": p => { p.schedule[0].amountCents = -1; }, "oversize cents": p => { p.schedule[0].amountCents = 1e12 + 1; },
    "NUL text": p => { p.schedule[0].title = "a\0b"; }, "oversize title": p => { p.schedule[0].title = "a".repeat(161); }
};
for (const [label, change] of Object.entries(invalidPlanChanges)) test(`v2 rejects ${label}`, () => { const value = structuredClone(snapshot); change(value.financialPlan); assert.throws(() => validate(value)); });

test("inclusive end date, unknown amount, once paid and all status/kind enums are supported", () => {
    for (const status of ["planned", "estimated", "paid", "cancelled"]) for (const kind of ["bill", "subscription", "payment", "wage"]) {
        const value = structuredClone(snapshot), row = value.financialPlan.schedule[0];
        Object.assign(row, { status, kind, frequency: "once", amountCents: null, endDate: row.date, category: "", accountName: "" });
        assert.deepEqual(validate(value), value);
    }
});

test("invalid row metadata, totals, dates, same-account transfers and credential-like strings reject", () => {
    const changes = [v => { v.snapshotId = "bad"; }, v => { v.generatedAt = "2026-09-11T24:00:00Z"; }, v => { v.generatedAt = "9999-01-01T00:00:00Z"; }, v => { v.totals.netCents++; }, v => { v.dateRange.from = null; }, v => { v.transactions[0].needsReview = true; }, v => { v.transactions[0].amountCents = "1015"; }, v => { v.transactions[0].accountName = v.transactions[1].accountName; }, v => { v.transactions[0].id = "x".repeat(257); }, v => { v.transactions[0].merchant = "\0"; }, v => { v.financialPlan.schedule[0].title = "password: synthetic"; }];
    changes.forEach(change => { const value = structuredClone(snapshot); change(value); assert.throws(() => validate(value)); });
    const long = structuredClone(snapshot); for (const field of ["merchant", "description", "extendedDetails", "sourceFile", "importId"]) long.transactions[0][field] = "x".repeat(12000);
    assert.throws(() => validate(long), /text limit/);
    const large = structuredClone(snapshot); large.transactions = Array.from({ length: 1200 }, (_, i) => ({ ...snapshot.transactions[0], id: String(i), description: "x".repeat(12000) }));
    assert.throws(() => validate(large), /12 MiB/);
});

test("UI uses committed workspace, blocks pending saves and keeps both explicit formats", () => {
    const prepare = page.slice(page.indexOf("const prepareAssistantOutput ="), page.indexOf("const renameAccount ="));
    assert.match(prepare, /getLocalActiveState<PocketviewArchivePayload>\("workspace"\)/);
    assert.doesNotMatch(prepare, /filteredTxs|analysisTxs|drafts\[/);
    assert.match(page, /assistantBusy \|\| saving \|\| importing \|\| Boolean\(storageError\)/);
    assert.match(page, /savingsTarget: 20, savingsTargetSet: false/);
    assert.equal((page.match(/setSavingsTargetSet\(true\)/g) || []).length, 2);
    assert.match(page, /Transactions Only \(V1\)/); assert.match(page, /Financial Plan \+ Transactions \(V2\)/);
});

function bucket() {
    let record = null, revision = 0;
    return { async get() { return record; }, async put(key, value, options) {
        if ((options.onlyIf.get("if-none-match") === "*" && record) || (options.onlyIf.has("if-match") && options.onlyIf.get("if-match") !== `"${record?.etag}"`)) return null;
        record = { etag: String(++revision), text: async () => value }; return record;
    } };
}
const request = (method, body, revision) => new Request("https://example.test/api/v1/assistant", { method, headers: { origin: "https://example.test", "content-type": "application/json", ...(revision ? { "if-match": revision } : { "if-none-match": "*" }) }, ...(body ? { body: JSON.stringify(body) } : {}) });
test("v2 PUT/GET preserves full content, rejects stale/content-ID collisions, and clears manually", async () => {
    const storage = bucket();
    const result = await assistantApi(request("PUT", snapshot), storage, "synthetic-owner");
    assert.equal(result.status, 200); let etag = result.headers.get("etag");
    const get = await assistantApi(request("GET"), storage, "synthetic-owner");
    assert.deepEqual(await get.json(), snapshot); assert.equal(get.headers.get("cache-control"), "private, no-store");
    const collision = structuredClone(snapshot); collision.financialPlan.savingsTargetPercent = 40;
    assert.equal((await assistantApi(request("PUT", collision, etag), storage, "synthetic-owner")).status, 409);
    const old = { ...snapshot, snapshotId: crypto.randomUUID(), generatedAt: "2026-09-11T14:00:00.000Z" };
    assert.equal((await assistantApi(request("PUT", old, etag), storage, "synthetic-owner")).status, 409);
    const invalid = structuredClone(snapshot); invalid.financialPlan.schedule[0].date = "invalid";
    assert.equal((await assistantApi(request("PUT", invalid, etag), storage, "synthetic-owner")).status, 400);
    const retry = await assistantApi(request("PUT", snapshot, etag), storage, "synthetic-owner");
    assert.equal(retry.status, 200); etag = retry.headers.get("etag");
    const empty = await fixture({}, []);
    assert.equal((await assistantApi(request("PUT", empty, etag), storage, "synthetic-owner")).status, 200);
    assert.deepEqual(await (await assistantApi(request("GET"), storage, "synthetic-owner")).json(), empty);
});

test("optional receiving-app validator accepts v1, v2, validated round trips and empty replacement", { skip: !process.env.POCKETVIEW_CONSUMER_VALIDATOR }, async () => {
    const { validatePocketviewSnapshot } = await import(pathToFileURL(process.env.POCKETVIEW_CONSUMER_VALIDATOR).href);
    for (const value of [output.buildAssistantOutput(rows, at), snapshot, validate(snapshot), await fixture({}, [])]) assert.deepEqual(validatePocketviewSnapshot(value, { now: at }), value);
});
