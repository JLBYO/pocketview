import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Use Wrangler's installed runtime: Node-only mocks cannot catch Workers API incompatibilities.
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve("wrangler"))("miniflare");
const origin = "https://pocketview.example.test";
const owner = { id: "fixture-owner", email: "owner@example.test", email_confirmed_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600 };

test("compiled Worker authenticates and recovers through the real Cloudflare fetch runtime", async t => {
    let providerMode = "success";
    const calls = [];
    const mf = new Miniflare({
        modules: true, scriptPath: fileURLToPath(new URL("../dist/server/index.js", import.meta.url)),
        modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }],
        compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
        bindings: { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_PUBLISHABLE_KEY: "fixture-key", POCKETVIEW_OWNER_ID: owner.id, POCKETVIEW_OWNER_EMAIL: owner.email, POCKETVIEW_DATA_OWNER: "original-storage-owner", PERSONAL_ASSISTANT_LOGIN_URL: "https://assistant.example.test/" },
        outboundService: async request => {
            const url = new URL(request.url);
            assert.equal(url.origin, "https://fixture.supabase.co");
            assert.equal(request.headers.get("apikey"), "fixture-key");
            calls.push({ path: url.pathname, query: url.searchParams, body: request.method === "POST" ? await request.json() : null });
            if (providerMode === "redirect") return new Response(null, { status: 307, headers: { Location: "https://untrusted.example.test/" } });
            if (providerMode === "quota") return Response.json({ error_code: "over_email_send_rate_limit" }, { status: 429 });
            if (providerMode === "invalid") return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
            return Response.json(url.pathname.endsWith("/user") ? owner : url.pathname.endsWith("/recover") ? {} : session);
        }
    });
    const post = (path, body) => mf.dispatchFetch(origin + path, { method: "POST", redirect: "manual", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
    try {
        await t.test("password login reaches provider and sets HttpOnly cookies", async () => {
            const response = await post("/auth/login", { email: owner.email, password: "fixture-password" });
            assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/");
            assert.equal(calls.length, 2); assert.equal(calls[0].path, "/auth/v1/token");
            assert.match(response.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
        });
        await t.test("session verification and refresh work in the Worker", async () => {
            const response = await mf.dispatchFetch(origin + "/auth/session", { headers: { cookie: "__Host-pocketview-refresh=fixture-refresh" } });
            assert.equal(response.status, 200); assert.equal((await response.json()).authenticated, true);
            assert.match(response.headers.get("set-cookie"), /__Host-pocketview-access/);
        });
        await t.test("wrong passwords are rejected, not reported as a transport outage", async () => {
            providerMode = "invalid";
            const response = await post("/auth/login", { email: owner.email, password: "deliberately-wrong" });
            assert.equal(response.headers.get("location"), "/login?reason=invalid");
        });
        await t.test("redirects cannot forward credentials to another host", async () => {
            providerMode = "redirect"; const before = calls.length;
            const response = await post("/auth/login", { email: owner.email, password: "fixture-password" });
            assert.equal(response.headers.get("location"), "/login?reason=unavailable"); assert.equal(calls.length, before + 1);
            assert.equal(response.headers.get("set-cookie"), null);
        });
        await t.test("recovery uses only the approved email and server-set destination", async () => {
            providerMode = "success";
            const response = await post("/auth/recover", { email: owner.email, redirect_to: "https://untrusted.example.test/" });
            assert.equal(response.headers.get("location"), "/recover?reason=requested");
            assert.equal(calls.at(-1).path, "/auth/v1/recover");
            assert.equal(calls.at(-1).query.get("redirect_to"), "https://assistant.example.test/");
            assert.deepEqual(calls.at(-1).body, { email: owner.email });
            const before = calls.length;
            assert.equal((await post("/auth/recover", { email: "foreign@example.test" })).headers.get("location"), "/recover?reason=requested");
            assert.equal(calls.length, before);
            const foreign = await mf.dispatchFetch(origin + "/auth/recover", { method: "POST", headers: { origin: "https://foreign.example.test" }, body: "email=owner@example.test" });
            assert.equal(foreign.status, 403); assert.equal(calls.length, before);
        });
        await t.test("email limits have an actionable message, never false success", async () => {
            providerMode = "quota";
            assert.equal((await post("/auth/recover", { email: owner.email })).headers.get("location"), "/recover?reason=quota");
            const page = await mf.dispatchFetch(origin + "/recover?reason=quota");
            assert.match(await page.text(), /No new email was sent/);
            assert.equal((await mf.dispatchFetch(origin + "/api/v1/assistant")).status, 401);
        });
    } finally { await mf.dispose(); }
});
