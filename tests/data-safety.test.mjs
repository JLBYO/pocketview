import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const loaded = new Map();
async function load(path, dependencies = {}) {
    if (loaded.has(path)) return loaded.get(path);
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const testModule = { exports: {} };
    new Function("exports", "module", "require", compiled)(testModule.exports, testModule, name => {
        assert.ok(dependencies[name], `Unmapped dependency ${name}`); return dependencies[name];
    });
    loaded.set(path, testModule.exports); return testModule.exports;
}
const csv = await load("../app/csv-import.ts");
const merge = await load("../app/incremental-import.ts");
const plan = await load("../app/financial-plan.ts"), safety = await load("../app/output-safety.ts");
const output = await load("../app/assistant-output.ts", { "./csv-import": csv, "./financial-plan": plan, "./output-safety": safety });
const { assistantApi: rawAssistantApi } = await load("../worker/assistant-api.ts", { "../app/assistant-output": output });
const assistantApi = (request, storage) => rawAssistantApi(request, storage, request.headers.get("oai-authenticated-user-id") || undefined);
const audit = await load("../app/audit-history.ts");
const { validateWorkspaceState, validateWorkspaceAudit } = await load("../app/workspace-validation.ts", { "./csv-import": csv });
const transaction = (patch = {}) => ({ id: "synthetic-1", bank: "Example Bank", account: "Everyday", date: "12/09/2026", amount: -10.15, description: "EXAMPLE SHOP", note: "", merchant: "Example", category: "Food", detail: "Groceries", place: "", importId: "synthetic-import", sourceFile: "synthetic.csv", ...patch });

test("CSV parser preserves quoted multiline notes, escaped quotes and empty fields", () => {
    const rows = csv.parseBankCsv('\uFEFFDate,Amount,Description,Note\r\n12/09/2026,-10.15,"CARD\nSHOP ""EXAMPLE""","Line 1\nLine 2"\r\n13/09/2026,0,Zero,""\r\n');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].description, 'CARD\nSHOP "EXAMPLE"');
    assert.equal(rows[0].note, "Line 1\nLine 2");
    assert.equal(rows[1].note, "");
    assert.equal(rows[1].amount, 0);
});
test("headerless ISO/DD-MM dates and extended exports are supported", () => {
    assert.equal(csv.parseBankCsv('2026-09-12,"($1,234.50)",Merchant,,,,,Extended')[0].amount, -1234.5);
    assert.equal(csv.parseBankCsv("12-09-2026,+10.01,Merchant")[0].date, "12/09/2026");
    const result = csv.parseBankCsv("Date,Amount,Bank Description,Extended Details\n12/09/2026,-1,Original,Reference")[0];
    assert.equal(result.description, "Original"); assert.equal(result.note, "Reference");
});
for (const bad of ["31/02/2026", "29/02/2025", "00/09/2026", "12/13/2026", "not-a-date"]) {
    test(`invalid calendar date ${bad} rejects the entire import`, () => assert.throws(() => csv.parseBankCsv(`Date,Amount,Description\n12/09/2026,-1,Valid\n${bad},-5,Invalid`), /Nothing from this import was saved/));
}
test("malformed amounts, missing descriptions, header-only and truncated CSV reject", () => {
    for (const text of ['Date,Amount,Description', 'Date,Amount,Description\n12/09/2026,nope,Shop', 'Date,Amount,Description\n12/09/2026,-1,', 'Date,Amount,Description\n12/09/2026,-1,"Shop']) assert.throws(() => csv.parseBankCsv(text));
    assert.throws(() => csv.amountInCents("1,2")); assert.throws(() => csv.amountInCents("1.123"));
    assert.equal(csv.bankDate("29/02/2024"), "29/02/2024");
});
test("incremental import retains classifications and adds same-day and older late records", () => {
    const old = transaction();
    const incoming = [transaction({ id: "repeat", merchant: "RAW NAME", category: "Unclassified", date: "2026-09-12" }), transaction({ id: "late", description: "LATE", date: "01/09/2026" }), transaction({ id: "same-day", description: "SECOND" })];
    const result = merge.mergeUniqueByOccurrence([old], incoming, csv.transactionIdentity);
    assert.strictEqual(result.records[0], old);
    assert.deepEqual(result.added.map(row => row.id), ["late", "same-day"]);
    assert.equal(merge.mergeUniqueByOccurrence(result.records, incoming, csv.transactionIdentity).added.length, 0);
});
test("matching is account-aware and preserves punctuation and references", () => {
    const old = transaction();
    for (const patch of [{ account: "Savings" }, { bank: "Another Bank" }, { description: "EXAMPLE SHOP #A" }, { note: "Ref 1" }]) assert.equal(merge.mergeUniqueByOccurrence([old], [transaction(patch)], csv.transactionIdentity).added.length, 1);
    assert.notEqual(csv.transactionIdentity(transaction({ description: "AB-12" })), csv.transactionIdentity(transaction({ description: "AB 12" })));
});
test("legitimate identical occurrences survive overlapping multi-file imports", () => {
    const first = [transaction(), transaction({ id: "synthetic-2" })];
    const second = [...first, transaction({ id: "synthetic-3" })];
    const result = merge.mergeUniqueByOccurrence(first, second, csv.transactionIdentity);
    assert.equal(result.records.length, 3); assert.equal(result.added.length, 1);
    assert.equal(merge.mergeUniqueByOccurrence(result.records, second, csv.transactionIdentity).added.length, 0);
});
test("3900-record overlap is a linear merge without replacing existing objects", () => {
    const existing = Array.from({ length: 3900 }, (_, i) => transaction({ id: String(i), description: `SYNTHETIC ${i}` }));
    const incoming = [...existing.slice(2000), transaction({ id: "new", description: "NEW" })];
    let calls = 0;
    const result = merge.mergeUniqueByOccurrence(existing, incoming, row => { calls++; return csv.transactionIdentity(row); });
    assert.equal(result.records.length, 3901); assert.equal(calls, existing.length + incoming.length);
    assert.strictEqual(result.records[0], existing[0]);
});
test("new undo snapshots retain transactions; legacy stripped snapshots cannot clear history", () => {
    const snapshots = audit.keepRecentAudit([{ snapshot: { fullSnapshot: true, txs: [transaction()] } }]);
    assert.equal(snapshots[0].snapshot.txs.length, 1);
    assert.equal(audit.usableUndo(snapshots[0].snapshot), true);
    assert.equal(audit.usableUndo({ txs: [] }), false);
    assert.equal(audit.usableUndo({ fullSnapshot: true, txs: [] }), true);
});
test("backup validation rejects corrupt knowledge before any restore", () => {
    const state = { txs: [transaction()], rules: [], master: [], imports: [], categories: [] };
    assert.doesNotThrow(() => validateWorkspaceState(state));
    for (const patch of [{ rules: [null] }, { master: [{ merchant: 12 }] }, { txs: [transaction({ amount: NaN })] }, { categories: [2] }, { budgetGuides: { Food: -1 } }, { imports: [{ importedAt: "invalid" }] }]) assert.throws(() => validateWorkspaceState({ ...state, ...patch }));
});
test("backup validation rejects corrupt import counters and audit entries", () => {
    const state = { txs: [], rules: [], master: [], imports: [] };
    for (const addedCount of [{ bad: true }, -1, "3", Infinity]) assert.throws(() => validateWorkspaceState({ ...state, imports: [{ importedAt: "2026-09-12T00:00:00Z", addedCount }] }));
    const entry = { id: "synthetic-audit", at: "2026-09-12T00:00:00Z", action: "Import", detail: "Synthetic", snapshot: state };
    assert.doesNotThrow(() => validateWorkspaceAudit([entry]));
    assert.doesNotThrow(() => validateWorkspaceAudit([{ ...entry, snapshot: { rules: [], master: [] } }]));
    for (const invalid of [[null], [{ ...entry, at: "invalid" }], [{ ...entry, action: {} }], [{ ...entry, snapshot: null }], [{ ...entry, snapshot: { ...state, txs: [transaction({ amount: "10" })] } }]]) assert.throws(() => validateWorkspaceAudit(invalid));
});

test("assistant snapshot is complete, uses cents, derives direction and includes raw transfers", () => {
    const result = output.buildAssistantOutput([transaction(), transaction({ id: "income", amount: 100.01, direction: "Outbound" })]);
    assert.equal(result.complete, true); assert.equal(result.transfersExcluded, false);
    assert.deepEqual(result.totals, { transactionCount: 2, inboundCents: 10001, outboundCents: 1015, netCents: 8986, needsReviewCount: 0 });
    assert.equal(result.transactions.find(row => row.id === "income").direction, "Inbound");
    assert.equal(result.transactions[0].date, "2026-09-12");
    const empty = output.buildAssistantOutput([]);
    assert.deepEqual(empty.dateRange, { from: null, to: null }); assert.equal(empty.totals.transactionCount, 0);
});
test("assistant output rejects duplicate IDs and recomputes tampered totals", () => {
    assert.throws(() => output.buildAssistantOutput([transaction(), transaction()]), /unique/);
    const result = output.buildAssistantOutput([transaction()]); result.totals.outboundCents = 1;
    assert.equal(output.validateAssistantOutput(result).totals.outboundCents, 1015);
    result.transactions[0].amountCents = "100";
    assert.throws(() => output.validateAssistantOutput(result), /amountCents/);
});

function bucket() {
    const records = new Map(); let revision = 0;
    return { records, async get(key) { return records.get(key) || null; }, async put(key, value, options) {
        const current = records.get(key), match = options.onlyIf.get("if-match");
        if ((match && `"${current?.etag}"` !== match) || (options.onlyIf.get("if-none-match") === "*" && current)) return null;
        const object = { etag: String(++revision), text: async () => value }; records.set(key, object); return object;
    } };
}
const request = (method = "GET", headers = {}, body) => new Request("https://example.test/api/v1/assistant", { method, headers: { "oai-authenticated-user-id": "synthetic-user", ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
test("output endpoint rejects unauthenticated access and cross-origin writes", async () => {
    assert.equal((await assistantApi(new Request("https://example.test/api/v1/assistant"), bucket())).status, 401);
    assert.equal((await assistantApi(request("PUT", { origin: "https://evil.example" }), bucket())).status, 403);
    assert.equal((await assistantApi(request("DELETE"), bucket())).status, 405);
    assert.equal((await assistantApi(request(), undefined)).status, 503);
});
test("output publication is scoped, validated, conditional and private", async () => {
    const storage = bucket(), payload = output.buildAssistantOutput([transaction()]);
    const headers = { origin: "https://example.test", "content-type": "application/json", "if-none-match": "*" };
    assert.equal((await assistantApi(request(), storage)).status, 404);
    assert.equal((await assistantApi(request("PUT", headers, payload), storage)).status, 200);
    assert.equal((await assistantApi(request("PUT", headers, payload), storage)).status, 409);
    const response = await assistantApi(request(), storage);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await response.json()).transactions.length, 1);
    assert.equal((await assistantApi(request("GET", { "oai-authenticated-user-id": "other-user" }), storage)).status, 404);
    assert.equal((await assistantApi(request("PUT", { ...headers, "if-match": response.headers.get("etag") }, {}), storage)).status, 400);
    assert.equal((await assistantApi(request("PUT", { ...headers, "if-none-match": "", "if-match": response.headers.get("etag") }, output.buildAssistantOutput([])), storage)).status, 200);
    assert.equal((await (await assistantApi(request(), storage)).json()).transactions.length, 0);
});
test("output endpoint requires a revision and handles storage failures", async () => {
    assert.equal((await assistantApi(request("PUT", { origin: "https://example.test", "content-type": "application/json" }, {}), bucket())).status, 428);
    assert.equal((await assistantApi(request(), { get: async () => { throw Error("offline"); } })).status, 503);
});
