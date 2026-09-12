/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { assistantApi } from "./assistant-api";
import type { SnapshotBucket } from "./assistant-api";
import { accountGate, applySessionHeaders } from "./account-auth";
import type { AccountEnv } from "./account-auth";

interface Env extends AccountEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET?: SnapshotBucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const auth = await accountGate(request, env);
    if (auth.response) return applySessionHeaders(auth.response, auth.cookies);
    if (url.pathname === "/api/v1/assistant") return applySessionHeaders(await assistantApi(request, env.BUCKET, auth.owner), auth.cookies);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return applySessionHeaders(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths), auth.cookies);
    }

    return applySessionHeaders(await handler.fetch(request, env, ctx), auth.cookies);
  },
};

export default worker;
