import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import * as jsx from "react/jsx-runtime";

async function load(file, dependencies = {}) {
    const source = await readFile(new URL(file, import.meta.url), "utf8"), testModule = { exports: {} };
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    new Function("exports", "module", "require", compiled)(testModule.exports, testModule, name => { assert.ok(dependencies[name], name); return dependencies[name]; });
    return testModule.exports;
}
const login = await load("../worker/login-page.ts"), auth = await load("../worker/account-auth.ts", { "./login-page": login });
const help = await load("../app/help-content.ts"), { default: TabHelp } = await load("../app/tab-help.tsx", { "./help-content": help, "react/jsx-runtime": jsx });
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_PUBLISHABLE_KEY: "synthetic-key", POCKETVIEW_OWNER_ID: "synthetic-owner", POCKETVIEW_OWNER_EMAIL: "owner@example.test", POCKETVIEW_DATA_OWNER: "existing-storage-owner", PERSONAL_ASSISTANT_LOGIN_URL: "https://assistant.example.test/" };
const owner = { id: env.POCKETVIEW_OWNER_ID, email: env.POCKETVIEW_OWNER_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "synthetic-access", refresh_token: "synthetic-refresh", expires_in: 3600 };
const req = (path, options = {}) => new Request(`https://pocketview.example.test${path}`, options);
const passwordRequest = (overrides = {}) => req("/auth/login", { method: "POST", headers: { origin: "https://pocketview.example.test", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: env.POCKETVIEW_OWNER_EMAIL, password: "synthetic-test-password", ...overrides }) });
const backend = async url => Response.json(url.endsWith("/user") ? owner : session);

test("every tab including Deep Dive has readable contextual help and rule guidance", () => {
    assert.deepEqual(Object.keys(help.tabGuides).sort(), ["overview", "budget", "transactions", "rules", "master", "category"].sort());
    for (const [view, guide] of Object.entries(help.tabGuides)) {
        const html = renderToStaticMarkup(createElement(TabHelp, { view, open: true, onToggle() {} }));
        assert.ok(html.includes(`How To Use ${guide.name}`)); assert.match(html, /aria-expanded="true"/);
        assert.match(html, /How Learning Rules And Master Data Work/); assert.match(html, /Privacy, Saving And Recovery/);
        for (const step of guide.steps) assert.ok(step.text.length > 50);
    }
    const collapsed = renderToStaticMarkup(createElement(TabHelp, { view: "rules", open: false, onToggle() {} }));
    assert.match(collapsed, /aria-expanded="false"/); assert.doesNotMatch(collapsed, /class="helpSteps"/);
});

test("login never reflects arbitrary query text; missing configuration fails closed", async () => {
    const response = login.loginPage('<script>alert(1)</script>', false, 'javascript:alert(1)');
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("referrer-policy"), "same-origin", "Native POST forms must retain their same-origin Origin header for CSRF checks");
    const html = await response.text(); assert.doesNotMatch(html, /<script>|javascript:/); assert.match(html, /disabled/);
    assert.equal((await auth.accountGate(req("/api/v1/assistant"), {}, backend)).response.status, 503);
});

test("anonymous and forged platform headers cannot open documents or output", async () => {
    const headers = { "oai-authenticated-user-id": "forged", "oai-authenticated-user-email": env.POCKETVIEW_OWNER_EMAIL };
    const document = await auth.accountGate(req("/", { headers }), env, backend);
    assert.equal(document.response.status, 303); assert.equal(document.response.headers.get("location"), "/login?reason=session");
    assert.equal((await auth.accountGate(req("/api/v1/assistant", { headers }), env, backend)).response.status, 401);
});

test("password sign-in verifies the exact confirmed owner and sets private cookies", async () => {
    const result = await auth.accountGate(passwordRequest(), env, backend);
    assert.equal(result.response.status, 303); assert.equal(result.response.headers.get("location"), "/");
    const cookies = result.response.headers.getSetCookie(); assert.equal(cookies.length, 2);
    for (const value of cookies) assert.match(value, /Path=\/; HttpOnly; Secure; SameSite=Lax/);
    assert.equal(result.response.headers.get("cache-control"), "private, no-store");
    const foreign = await auth.accountGate(passwordRequest(), env, async url => Response.json(url.endsWith("/user") ? { ...owner, id: "someone-else" } : session));
    assert.match(foreign.response.headers.get("location"), /invalid/);
});

test("login rejects foreign origins, wrong email, unsupported methods and oversized bodies", async () => {
    const foreign = new Request(passwordRequest(), { headers: { origin: "https://other.example.test" } });
    assert.equal((await auth.accountGate(foreign, env, backend)).response.status, 403);
    assert.equal((await auth.accountGate(req("/auth/login"), env, backend)).response.status, 405);
    const result = await auth.accountGate(passwordRequest({ email: "other@example.test" }), env, async () => { throw Error("Must not contact provider for another email"); });
    assert.match(result.response.headers.get("location"), /invalid/);
    assert.equal((await auth.accountGate(passwordRequest({ password: "x".repeat(9000) }), env, backend)).response.status, 413);
});

test("verified sessions retain the existing storage namespace and ignore client IDs", async () => {
    const result = await auth.accountGate(req("/api/v1/assistant", { headers: { authorization: "Bearer synthetic-access", "oai-authenticated-user-id": "other" } }), env, backend);
    assert.equal(result.owner, "existing-storage-owner"); assert.equal(result.response, undefined);
    for (const denied of [{ ...owner, email_confirmed_at: null }, { ...owner, email: "someone@example.test" }, { ...owner, id: "other" }]) {
        const result = await auth.accountGate(req("/api/v1/assistant", { headers: { authorization: "Bearer synthetic-access" } }), env, async () => Response.json(denied));
        assert.equal(result.response.status, 401);
    }
});

test("expired access refreshes server-side; failures do not leak tokens", async () => {
    const result = await auth.accountGate(req("/auth/session", { headers: { cookie: "__Host-pocketview-refresh=synthetic-refresh" } }), env, backend);
    assert.deepEqual(await result.response.clone().json(), { authenticated: true }); assert.equal(result.cookies.length, 2);
    const response = auth.applySessionHeaders(result.response, result.cookies); assert.equal(response.headers.getSetCookie().length, 2);
    const failed = await auth.accountGate(req("/auth/session", { headers: { cookie: "__Host-pocketview-access=synthetic-access" } }), env, async () => new Response(null, { status: 503 }));
    assert.equal(failed.response.status, 503); assert.equal(failed.cookies.length, 0);
});

test("logout is same-origin POST, revokes only this login, and clears both cookies", async () => {
    let target;
    const request = req("/auth/logout", { method: "POST", headers: { origin: "https://pocketview.example.test", cookie: "__Host-pocketview-access=synthetic-access" } });
    const result = await auth.accountGate(request, env, async url => { target = url; return new Response(null, { status: 204 }); });
    assert.match(target, /\/logout\?scope=local$/);
    assert.equal(result.response.headers.getSetCookie().length, 2);
    for (const cookie of result.response.headers.getSetCookie()) assert.match(cookie, /Max-Age=0/);
    assert.match(result.response.headers.get("location"), /signedout/);
});
