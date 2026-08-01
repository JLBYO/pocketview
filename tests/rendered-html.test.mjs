import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("serves the Pocketview application", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /Pocketview/i);
});

test("keeps transaction classification user-driven", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /function classify\(\) \{ return "Unclassified"; \}/);
  assert.doesNotMatch(page, /if\s*\([^)]*(?:ANZ|BIG\s*W)/i);
  assert.match(page, /Type or choose detail/);
  assert.match(page, /deepDivePageSize = 25/);
  assert.match(page, /workbenchPageSize = 50/);
  assert.match(page, /Export JSON/);
  assert.match(page, /Export CSV/);
});

test("includes the shared pastel interface system", async () => {
  const [css, layout] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /--lavender:#f0eeff/);
  assert.match(css, /\.actions button,.actions \.import/);
  assert.match(css, /button:focus-visible/);
  assert.match(layout, /Pocketview/);
});
