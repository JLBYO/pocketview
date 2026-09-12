import { validateAssistantOutput } from "../app/assistant-output";

type StoredObject = { etag: string; text(): Promise<string> };
export type SnapshotBucket = {
    get(key: string): Promise<StoredObject | null>;
    put(key: string, value: string, options: { onlyIf: Headers; httpMetadata: { contentType: string } }): Promise<{ etag: string } | null>;
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...headers } });

export async function assistantApi(request: Request, bucket?: SnapshotBucket): Promise<Response> {
    // Sites dispatch supplies this identity after applying the existing private audience policy.
    // Never expose this handler on a deployment that allows clients to forge that header.
    const user = request.headers.get("oai-authenticated-user-id");
    if (!user) return json({ error: "ChatGPT sign-in is required." }, 401);
    if (!["GET", "PUT"].includes(request.method)) return json({ error: "Method not allowed." }, 405, { Allow: "GET, PUT" });
    if (!bucket) return json({ error: "Assistant output storage is unavailable. Download Assistant JSON instead." }, 503);
    const bytes = new TextEncoder().encode(user);
    const key = `assistant/${Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("")}.json`;
    try {
        if (request.method === "GET") {
            const current = await bucket.get(key);
            if (!current) return json({ error: "No published snapshot. Publish Assistant Output from Pocketview first." }, 404);
            return new Response(await current.text(), { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ETag: `"${current.etag}"` } });
        }
        if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Publish must be performed from Pocketview." }, 403);
        if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected application/json." }, 415);
        const match = request.headers.get("if-match"), none = request.headers.get("if-none-match");
        if (!match && none !== "*") return json({ error: "A snapshot revision is required." }, 428);
        const limit = 20 * 1024 * 1024;
        if (Number(request.headers.get("content-length")) > limit) return json({ error: "Snapshot exceeds 20 MB." }, 413);
        const reader = request.body?.getReader();
        if (!reader) return json({ error: "Missing snapshot." }, 400);
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > limit) { await reader.cancel(); return json({ error: "Snapshot exceeds 20 MB." }, 413); } chunks.push(next.value); }
        const body = new Uint8Array(size); let position = 0;
        for (const chunk of chunks) { body.set(chunk, position); position += chunk.byteLength; }
        let payload;
        try { payload = validateAssistantOutput(JSON.parse(new TextDecoder().decode(body))); }
        catch { return json({ error: "Invalid Pocketview snapshot. No published data was changed." }, 400); }
        const condition = new Headers(match ? { "If-Match": match } : { "If-None-Match": "*" });
        const result = await bucket.put(key, JSON.stringify(payload), { onlyIf: condition, httpMetadata: { contentType: "application/json" } });
        if (!result) return json({ error: "The published snapshot changed on another device. Reload its status before publishing again." }, 409);
        return json({ snapshotId: payload.snapshotId, generatedAt: payload.generatedAt, transactionCount: payload.transactions.length }, 200, { ETag: `"${result.etag}"` });
    } catch { return json({ error: "Could not access published output. Your local history is unchanged; try again." }, 503); }
}
