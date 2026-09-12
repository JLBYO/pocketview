import { loginPage, recoveryDestination } from "./login-page";

export type AccountEnv = {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    POCKETVIEW_OWNER_ID?: string;
    POCKETVIEW_OWNER_EMAIL?: string;
    POCKETVIEW_DATA_OWNER?: string;
    PERSONAL_ASSISTANT_LOGIN_URL?: string;
};
type Session = { access_token: string; refresh_token: string; expires_in: number };
type Owner = { id: string; email: string; email_confirmed_at: string };
type Gate = { response?: Response; owner?: string; cookies: string[] };
type AuthFetch = typeof fetch;
const accessName = "__Host-pocketview-access", refreshName = "__Host-pocketview-refresh";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "same-origin" };
const cookie = (name: string, value: string, maxAge: number) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const clearCookies = () => [cookie(accessName, "", 0), cookie(refreshName, "", 0)];
const readCookie = (request: Request, name: string) => { try { return decodeURIComponent(request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || ""); } catch { return ""; } };
const redirect = (path: string, cookies: string[] = []) => { const headers = new Headers({ ...privateHeaders, Location: path }); cookies.forEach(value => headers.append("Set-Cookie", value)); return new Response(null, { status: 303, headers }); };
const json = (message: string, status: number) => Response.json({ error: message }, { status, headers: privateHeaders });

export function accountConfigured(env: AccountEnv): boolean {
    return Boolean(/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(env.SUPABASE_URL || "") && env.SUPABASE_PUBLISHABLE_KEY && env.POCKETVIEW_OWNER_ID && env.POCKETVIEW_OWNER_EMAIL && env.POCKETVIEW_DATA_OWNER);
}

async function authRequest(env: AccountEnv, path: string, backend: AuthFetch, init: RequestInit = {}): Promise<Response> {
    try {
        // Workers rejects redirect: "error" before making a request. Never follow a
        // redirect carrying passwords/tokens; inspect the manual response instead.
        const response = await backend(`${env.SUPABASE_URL}/auth/v1${path}`, { ...init, signal: AbortSignal.timeout(10000), redirect: "manual", headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY!, "Content-Type": "application/json", ...init.headers } });
        if (response.status >= 300 && response.status < 400) throw new Error("Unexpected authentication redirect");
        return response;
    } catch (error) {
        // Never log request bodies, credentials, tokens, emails or provider messages.
        console.error(JSON.stringify({ event: "auth_transport_failure", operation: path.split("?")[0], kind: error instanceof Error && ["TypeError", "TimeoutError", "AbortError"].includes(error.name) ? error.name : "RequestError" }));
        throw error;
    }
}

async function failureReason(response: Response): Promise<string> {
    let code = "unknown";
    try { const body = await response.json() as { error_code?: unknown }; if (typeof body.error_code === "string" && /^[a-z_]{1,60}$/.test(body.error_code)) code = body.error_code; } catch { /* Provider may return a non-JSON outage response. */ }
    console.error(JSON.stringify({ event: "auth_provider_failure", status: response.status, code }));
    return response.status === 429 ? code === "over_email_send_rate_limit" ? "quota" : "limited" : response.status >= 500 ? "unavailable" : "invalid";
}

async function verifyOwner(access: string, env: AccountEnv, backend: AuthFetch): Promise<Owner | null> {
    if (!access || access.length > 3600) return null;
    const response = await authRequest(env, "/user", backend, { headers: { Authorization: `Bearer ${access}` } });
    if (response.status >= 500 || response.status === 429) throw new Error("Authentication unavailable");
    if (!response.ok) return null;
    const user = await response.json() as Partial<Owner>;
    return user.id === env.POCKETVIEW_OWNER_ID && typeof user.email === "string" && user.email.toLowerCase() === env.POCKETVIEW_OWNER_EMAIL!.toLowerCase() && Boolean(user.email_confirmed_at) ? user as Owner : null;
}

function sessionCookies(value: unknown): { session: Session; cookies: string[] } {
    const session = value as Session;
    if (!session || typeof session.access_token !== "string" || !session.access_token || session.access_token.length > 3600 || typeof session.refresh_token !== "string" || !session.refresh_token || session.refresh_token.length > 3600 || !Number.isFinite(session.expires_in) || session.expires_in <= 0) throw new Error("Invalid session");
    // Tokens never enter JavaScript/localStorage. The provider controls session expiry/revocation.
    return { session, cookies: [cookie(accessName, session.access_token, Math.min(session.expires_in, 3600)), cookie(refreshName, session.refresh_token, 14 * 86400)] };
}

/** All document/API requests go through this boundary; client and Sites identity headers are not trusted. */
export async function accountGate(request: Request, env: AccountEnv, backend: AuthFetch = fetch): Promise<Gate> {
    const path = new URL(request.url).pathname, sameOrigin = request.headers.get("origin") === new URL(request.url).origin;
    const configured = accountConfigured(env);
    if (path === "/login" && request.method === "GET") return { response: loginPage(new URL(request.url).searchParams.get("reason"), configured, env.PERSONAL_ASSISTANT_LOGIN_URL), cookies: [] };
    if (path === "/recover" && request.method === "GET") return { response: loginPage(new URL(request.url).searchParams.get("reason"), configured, env.PERSONAL_ASSISTANT_LOGIN_URL, "recover"), cookies: [] };
    if (!configured) return { response: path.startsWith("/api/") || path.startsWith("/auth/") ? json("Sign-in is not configured. Your private workspace remains locked.", 503) : loginPage(null, false), cookies: [] };
    if (["/auth/login", "/auth/logout", "/auth/recover"].includes(path)) {
        if (request.method !== "POST") return { response: json("Method not allowed.", 405), cookies: [] };
        if (!sameOrigin) return { response: json("Use Pocketview to perform this action.", 403), cookies: [] };
        if (path === "/auth/logout") {
            const access = readCookie(request, accessName);
            if (access) { try { await authRequest(env, "/logout?scope=local", backend, { method: "POST", headers: { Authorization: `Bearer ${access}` } }); } catch { /* Always clear this browser's cookies, including during an outage. */ } }
            return { response: redirect("/login?reason=signedout", clearCookies()), cookies: [] };
        }
        const recovering = path === "/auth/recover", returnPath = recovering ? "/recover" : "/login";
        try {
            if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return { response: json("Expected a sign-in form.", 415), cookies: [] };
            const reader = request.body?.getReader(); if (!reader) return { response: redirect(`${returnPath}?reason=invalid`), cookies: [] };
            const chunks: Uint8Array[] = []; let length = 0;
            while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 8192) { await reader.cancel(); return { response: json("Sign-in form too large.", 413), cookies: [] }; } chunks.push(part.value); }
            const bytes = new Uint8Array(length); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; }
            const form = new URLSearchParams(new TextDecoder().decode(bytes)), email = (form.get("email") || "").trim(), password = form.get("password") || "";
            if (recovering) {
                const destination = recoveryDestination(env.PERSONAL_ASSISTANT_LOGIN_URL);
                if (!destination) return { response: loginPage(null, false, undefined, "recover"), cookies: [] };
                // No signup, account enumeration or client-controlled redirect destination.
                if (email.toLowerCase() !== env.POCKETVIEW_OWNER_EMAIL!.toLowerCase()) return { response: redirect("/recover?reason=requested"), cookies: [] };
                const response = await authRequest(env, `/recover?redirect_to=${encodeURIComponent(destination)}`, backend, { method: "POST", body: JSON.stringify({ email }) });
                if (!response.ok) { const reason = await failureReason(response); return { response: redirect(`/recover?reason=${reason === "invalid" ? "unavailable" : reason}`), cookies: [] }; }
                return { response: redirect("/recover?reason=requested"), cookies: [] };
            }
            if (email.toLowerCase() !== env.POCKETVIEW_OWNER_EMAIL!.toLowerCase() || !password || password.length > 1024) return { response: redirect("/login?reason=invalid"), cookies: [] };
            const response = await authRequest(env, "/token?grant_type=password", backend, { method: "POST", body: JSON.stringify({ email, password }) });
            if (!response.ok) return { response: redirect(`/login?reason=${await failureReason(response)}`), cookies: [] };
            const { session, cookies } = sessionCookies(await response.json());
            if (!await verifyOwner(session.access_token, env, backend)) return { response: redirect("/login?reason=invalid", clearCookies()), cookies: [] };
            return { response: redirect("/", cookies), cookies: [] };
        } catch { return { response: redirect(`${returnPath}?reason=unavailable`), cookies: [] }; }
    }
    if (path.startsWith("/auth/") && path !== "/auth/session") return { response: json("Not found.", 404), cookies: [] };
    try {
        const bearer = request.headers.get("authorization");
        let access = bearer ? bearer.match(/^Bearer ([^\s]+)$/i)?.[1] || "" : readCookie(request, accessName), owner = await verifyOwner(access, env, backend), cookies: string[] = [];
        if (!owner && !bearer) {
            const refresh = readCookie(request, refreshName);
            if (refresh && refresh.length <= 3600) {
                const response = await authRequest(env, "/token?grant_type=refresh_token", backend, { method: "POST", body: JSON.stringify({ refresh_token: refresh }) });
                if (response.status >= 500 || response.status === 429) throw new Error("Authentication unavailable");
                if (response.ok) { const renewed = sessionCookies(await response.json()); access = renewed.session.access_token; owner = await verifyOwner(access, env, backend); if (owner) cookies = renewed.cookies; }
            }
        }
        if (!owner) {
            const response = path.startsWith("/api/") || path === "/auth/session" ? json("Sign in to Pocketview to continue.", 401) : redirect("/login?reason=session", clearCookies());
            return { response, cookies: [] };
        }
        if (path === "/auth/session") {
            if (request.method !== "GET") return { response: json("Method not allowed.", 405), cookies: [] };
            const response = Response.json({ authenticated: true }, { headers: privateHeaders });
            return { response, cookies };
        }
        return { owner: env.POCKETVIEW_DATA_OWNER, cookies };
    } catch { return { response: path.startsWith("/api/") || path.startsWith("/auth/") ? json("Could not verify sign-in. Please try again.", 503) : loginPage("unavailable", true, env.PERSONAL_ASSISTANT_LOGIN_URL), cookies: [] }; }
}

export function applySessionHeaders(response: Response, cookies: string[]): Response {
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("X-Content-Type-Options", "nosniff");
    cookies.forEach(value => result.headers.append("Set-Cookie", value));
    return result;
}
