import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import ts from "typescript";

const source = await readFile(new URL("../app/local-archive.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function tab(database) {
    const testModule = { exports: {} };
    new Function("exports", "module", "indexedDB", compiled)(testModule.exports, testModule, database);
    return testModule.exports;
}
const csv = { id: "synthetic-source", name: "synthetic.csv", text: "Date,Amount,Description", size: 23, lastModified: 1, type: "text/csv" };
test("one commit saves workspace and original file; reload recovers both", async () => {
    const database = new IDBFactory(), a = tab(database);
    await a.getLocalActiveState("workspace");
    await a.saveLocalWorkspace({ transactions: ["one"], imports: [csv.id], rules: ["approved"] }, [csv]);
    const reload = tab(database);
    assert.deepEqual(await reload.getLocalActiveState("workspace"), { transactions: ["one"], imports: [csv.id], rules: ["approved"] });
    assert.deepEqual(await reload.listLocalSourceFiles(), [csv]);
});
test("a stale tab cannot overwrite a newer import", async () => {
    const database = new IDBFactory(), a = tab(database), b = tab(database);
    await a.getLocalActiveState("workspace"); await b.getLocalActiveState("workspace");
    await a.saveLocalWorkspace({ transactions: ["new-record"] }, [csv]);
    await assert.rejects(b.saveLocalWorkspace({ transactions: [] }), /another Pocketview tab/);
    assert.deepEqual(await a.getLocalActiveState("workspace"), { transactions: ["new-record"] });
    assert.equal((await a.listLocalSourceFiles()).length, 1);
});
test("invalid source files reject before replacing workspace or clearing originals", async () => {
    const database = new IDBFactory(), a = tab(database);
    await a.getLocalActiveState("workspace"); await a.saveLocalWorkspace({ transactions: ["keep"] }, [csv]);
    await assert.rejects(a.saveLocalWorkspace({ transactions: [] }, [{}], true), /Invalid source files/);
    await assert.rejects(a.saveLocalWorkspace({ transactions: [] }, {}, true), /Invalid source files/);
    assert.deepEqual(await a.getLocalActiveState("workspace"), { transactions: ["keep"] });
    assert.deepEqual(await a.listLocalSourceFiles(), [csv]);
});
test("a synchronous clone failure aborts all queued writes", async () => {
    const database = new IDBFactory(), a = tab(database);
    await a.getLocalActiveState("workspace"); await a.saveLocalWorkspace({ transactions: ["keep"] }, [csv]);
    await assert.rejects(a.saveLocalWorkspace({ transactions: [] }, [{ ...csv, cannotClone: () => {} }], true));
    assert.deepEqual(await a.getLocalActiveState("workspace"), { transactions: ["keep"] });
    assert.deepEqual(await a.listLocalSourceFiles(), [csv]);
});
test("queued saves keep their ordering and clear is an explicit empty workspace", async () => {
    const database = new IDBFactory(), a = tab(database);
    await a.getLocalActiveState("workspace");
    await Promise.all([a.saveLocalWorkspace({ version: 1 }, [csv]), a.saveLocalWorkspace({ version: 2 })]);
    assert.deepEqual(await a.getLocalActiveState("workspace"), { version: 2 });
    await a.saveLocalWorkspace({ transactions: [], rules: [], master: [], categories: [] }, [], true);
    assert.deepEqual(await a.listLocalSourceFiles(), []);
    assert.deepEqual(await tab(database).getLocalActiveState("workspace"), { transactions: [], rules: [], master: [], categories: [] });
});
