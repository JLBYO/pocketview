# Repository Guidelines

## Project Structure & Module Organization

Pocketview is a Vinext/React 19 application. Product UI and client-side budgeting logic live in `app/page.tsx`; shared styling is split between `app/globals.css` and `app/features.css`. `app/layout.tsx` defines site metadata, while `app/chatgpt-auth.ts` contains optional authentication helpers. Static assets belong in `public/`.

The Cloudflare worker entry point is `worker/index.ts`. `db/` and `drizzle/` contain the optional D1/Drizzle schema and migrations; `examples/d1/` is reference code, not production functionality. Tests live in `tests/`. Generated directories such as `dist/`, `.vinext/`, `.wrangler/`, `outputs/`, and `work/` must not be committed.

## Build, Test, and Development Commands

Use Node.js 22.13 or newer and pnpm:

- `pnpm install` — install locked dependencies.
- `pnpm dev` — run the local Vinext development server.
- `pnpm lint` — run the Next.js TypeScript and Core Web Vitals ESLint rules.
- `pnpm build` — create the Cloudflare-compatible production build in `dist/`.
- `pnpm test` — build, then run the Node test suite against rendered output and source invariants.
- `pnpm db:generate` — generate Drizzle migrations after schema changes.

## Coding Style & Naming Conventions

TypeScript is strict; do not introduce implicit `any` or bypass errors. Use PascalCase for React components and types, camelCase for functions, state, and variables, and descriptive camelCase CSS classes. Follow the existing four-space indentation inside block bodies and preserve the repository’s compact CSS style. Avoid broad formatting changes. ESLint is the authoritative style check; no separate formatter is configured.

Keep transaction classification user-driven. Do not add hard-coded merchant or bank categorisation. When changing browser-persisted data, retain normalization and backward-compatible defaults for existing imports, rules, and Master Data.

## Testing Guidelines

Tests use Node’s built-in `node:test` and `node:assert`. Name new files `*.test.mjs` under `tests/`. Add regression assertions for parsing, classification, persistence, or UI contracts affected by a change. There is no numeric coverage threshold, but `pnpm lint` and `pnpm test` must pass before review. Visually test responsive UI changes at desktop and narrow widths.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects such as `Fix overview filter chart and drilldown` or `Add multi-account imports`. Keep each commit focused.

Pull requests should include a concise behavior summary, testing performed, and any persistence or migration impact. Link related issues when available and include before/after screenshots for visible UI changes. Never commit `.env` files, credentials, bank exports, or real transaction data.
