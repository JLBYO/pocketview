import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", authEnv = {}, extraHeaders = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html", ...extraHeaders } }),
    { ...authEnv, ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("unconfigured production worker keeps the Pocketview workspace locked", async () => {
  const response = await render();
  assert.equal(response.status, 503);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Pocketview/i);
  assert.match(html, /workspace remains locked/);
  assert.doesNotMatch(html, /Money In And Out Over Time/);
});

test("configured production worker exposes login but gates documents and APIs", async () => {
  const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "synthetic-key", POCKETVIEW_OWNER_ID: "synthetic-owner", POCKETVIEW_OWNER_EMAIL: "owner@example.test", POCKETVIEW_DATA_OWNER: "synthetic-storage" };
  const login = await render("/login", env);
  assert.equal(login.status, 200); assert.match(await login.text(), /name="password"/);
  const document = await render("/", env);
  assert.equal(document.status, 303); assert.match(document.headers.get("location"), /^\/login/);
  const api = await render("/api/v1/assistant", env, { "oai-authenticated-user-id": "synthetic-owner" });
  assert.equal(api.status, 401); assert.equal(api.headers.get("cache-control"), "private, no-store");
});

test("keeps transaction classification user-driven", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function classify\(\) \{ return "Unclassified"; \}/);
  assert.doesNotMatch(page, /if\s*\([^)]*(?:ANZ|BIG\s*W)/i);
  assert.match(page, /Type Or Choose Detail/);
  assert.match(page, /deepDivePageSize = 25/);
  assert.match(page, /workbenchPageSize = 50/);
  assert.match(page, /Export JSON/);
  assert.match(page, /Export CSV/);
  assert.match(page, /matchTransfers/);
  assert.match(page, /recurringPayments/);
  assert.match(page, /30-DAY SPEND FORECAST/);
  assert.match(page, /Undo Latest Change/);
  assert.match(page, /Save Encrypted History Backup/);
  assert.match(page, /multiple type="file"/);
  assert.match(page, /Add Transactions To Your History/);
  assert.match(page, /duplicateKey/);
  assert.match(page, /View \$\{matchingTransactions.length\} Matches/);
  assert.match(page, /Manage Imported Accounts/);
  assert.match(page, /Bank", "Account Name", "Source File/);
  assert.match(page, /const canonicalKey = .*t\.description.*t\.note/);
  assert.match(page, /const legacyCanonicalKey =/);
  assert.match(page, /const mergeRules =/);
  assert.match(page, /snapshot = \(includeTransactions = true\)/);
  assert.match(page, /\.slice\(0, 100\)/);
  assert.match(page, /Open Learning Rules/);
  assert.match(page, /"Category Detail", "Place"/);
  assert.match(page, /Suburb, Town Or City/);
  assert.match(page, /const matchTerms = .*split\(\/\\s\*&\\s\*\//);
  assert.match(page, /terms\.every\(term => description\.includes\(term\)\)/);
  assert.match(page, /ruleId\?: string/);
  assert.match(page, /deleteMasterAndLinkedRule/);
  assert.match(page, /deleteRuleAndLinkedMaster/);
  assert.match(page, /Export Master JSON/);
  assert.match(page, /Linked Rule ID/);
  assert.match(page, /MASTER DATA CHANGE HISTORY/);
  assert.match(page, /Use Suggestions For Selected/);
  assert.match(page, /ABS Place Reference/);
  assert.match(page, /Archive And Clear All Data/);
  assert.match(page, /sourceText = await pending\.file\.text\(\), parsed = parseCsv\(sourceText, \{ bank, account/);
  assert.doesNotMatch(page, /parseCsv\(await pending\.file\.text\(\), rules/);
  assert.match(page, /every selected original CSV is stored/);
  assert.doesNotMatch(page, /const canonicalKey = .*replace\(\/\\b\\d\{4,/);
  assert.match(page, /const categories = \["Unclassified"\]/);
  assert.match(page, /const defaultBudget: Record<string, number> = \{\}/);
  assert.doesNotMatch(page, /const categories = \["Food"/);
  assert.match(page, /normalizeStoredPlace/);
  assert.match(page, /cleanTerms\.every\(term => description\.includes\(term\)\)/);
  assert.match(page, /SMART BATCHES/);
  assert.match(page, /Approve And Apply Batch/);
  assert.match(page, /const applySmartBatch/);
  assert.match(page, /let combined: Tx\[\] = \[\.\.\.txs\]/);
  assert.match(page, /existing transactions were skipped/);
  assert.match(page, /Add Transactions To Your History/);
  assert.match(page, /INCREMENTAL IMPORT HISTORY/);
  assert.match(page, /firstDate\?: string; lastDate\?: string/);
  assert.match(page, /sourceFiles = await listLocalSourceFiles\(\)/);
  assert.match(page, /await saveLocalWorkspace\(/);
});

test("bundles the official Australian locality reference and local archive support", async () => {
  const [places, intelligence, archive] = await Promise.all([
    readFile(new URL("../app/australian-places.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/place-intelligence.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/local-archive.ts", import.meta.url), "utf8"),
  ]);
  assert.match(places, /Australian Statistical Geography Standard/);
  assert.match(places, /Shepparton/);
  assert.match(places, /"count": 15334/);
  assert.match(intelligence, /predictAustralianPlace/);
  assert.match(intelligence, /uniqueStates\.size > 1/);
  assert.match(intelligence, /stateDisplayNames/);
  assert.match(intelligence, /b\.wordIndex - a\.wordIndex/);
  assert.match(archive, /indexedDB\.open/);
  assert.match(archive, /saveLocalArchive/);
  assert.match(archive, /source-files/);
  assert.match(archive, /replaceLocalSourceFiles/);
  assert.match(archive, /appendLocalSourceFiles/);
  assert.match(archive, /getLocalSourceFile/);
  assert.match(archive, /active-state/);
  assert.match(archive, /saveLocalActiveState/);
  assert.match(archive, /clearLocalActiveState/);
});

test("appends only new transaction occurrences while retaining legitimate repeats", async () => {
  const [source, ts] = await Promise.all([
    readFile(new URL("../app/incremental-import.ts", import.meta.url), "utf8"),
    import("typescript"),
  ]);
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  new Function("exports", "module", compiled)(testModule.exports, testModule);
  const { mergeUniqueByOccurrence } = testModule.exports;
  const existing = [{ key: "same", id: "old-1" }, { key: "same", id: "old-2" }, { key: "other", id: "old-3" }];
  const incoming = [{ key: "same", id: "csv-1" }, { key: "same", id: "csv-2" }, { key: "same", id: "csv-3" }, { key: "other", id: "csv-4" }, { key: "new", id: "csv-5" }];
  const first = mergeUniqueByOccurrence(existing, incoming, record => record.key);
  assert.deepEqual(first.added.map(record => record.id), ["csv-3", "csv-5"]);
  assert.equal(first.records.length, 5);
  assert.equal(first.skippedCount, 3);
  const repeated = mergeUniqueByOccurrence(first.records, incoming, record => record.key);
  assert.equal(repeated.added.length, 0);
  assert.equal(repeated.skippedCount, incoming.length);
});

test("formats Australian states and prefers the final locality in a bank description", async () => {
  const [placesSource, intelligenceSource, ts] = await Promise.all([
    readFile(new URL("../app/australian-places.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/place-intelligence.ts", import.meta.url), "utf8"),
    import("typescript"),
  ]);
  const dataStart = placesSource.indexOf("= ", placesSource.indexOf("export const australianPlaces")) + 2;
  const places = JSON.parse(placesSource.slice(dataStart, placesSource.lastIndexOf(";")));
  const testableSource = intelligenceSource.replace(
    'import { australianPlaces, australianPlaceSource } from "./australian-places";',
    "const { australianPlaces, australianPlaceSource } = globalThis.__placeFixture;",
  );
  const compiled = ts.transpileModule(testableSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  new Function("exports", "module", "globalThis", compiled)(testModule.exports, testModule, { __placeFixture: { australianPlaces: places, australianPlaceSource: { count: places.length } } });
  const { predictAustralianPlace } = testModule.exports;
  assert.equal(predictAustralianPlace("BWS LIQUOR/BENALLA RD SHEPPARTON").place, "Shepparton, Victoria");
  assert.equal(predictAustralianPlace("CARD PURCHASE COBURG VIC").place, "Coburg, Victoria");
  assert.equal(predictAustralianPlace("PAYMENT BEGA NSW").place, "Bega, NSW");
  assert.doesNotMatch(predictAustralianPlace("CARD PURCHASE SHEPPARTON").place, /, 2$/);
  assert.equal(testModule.exports.formatAustralianStateCode("2"), "Victoria");
});

test("includes the shared pastel interface system", async () => {
  const [css, features, layout] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/features.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /--lavender:#f0eeff/);
  assert.match(css, /\.actions button,.actions \.import/);
  assert.match(css, /button:focus-visible/);
  assert.match(features, /\.overviewActions>button\{width:184px;min-width:184px/);
  assert.match(features, /\.inboundBar\{background:linear-gradient\(180deg,#a99eee,#7469d7\)/);
  assert.match(features, /\.outboundBar\{background:linear-gradient\(180deg,#bce8d5,#83c9aa\)/);
  assert.match(features, /\.importModalBackdrop/);
  assert.match(features, /\.ruleMatchPanel/);
  assert.match(features, /\.accountManagement/);
  assert.match(features, /\.ruleMatchField/);
  assert.match(features, /\.masterRuleLink/);
  assert.match(layout, /Pocketview/);
});
