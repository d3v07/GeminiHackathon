# Copilot Code Review Instructions — Metropolis

## Project Context
Metropolis is a real-time NPC simulation engine. Backend uses Node.js + Temporal.io + Gemini AI. Frontend is Next.js 16 + React 19 + Tailwind. Data layer: Firebase Firestore + Pinecone + Upstash Redis.

## Review Priorities (in order)
1. **Security** — No hardcoded API keys, secrets, or credentials. All sensitive values must come from `process.env`. No `eval()`, no unsanitized user input in prompts.
2. **Model references** — All Gemini model names must use `selectModel()` from `lib/model-router.js` (backend) or `GEMINI_FLASH`/`GEMINI_PRO` constants (orchestrator). Never hardcode model version strings.
3. **Error handling** — API routes must return proper HTTP status codes with structured JSON errors. No unhandled promise rejections. Temporal activities must not swallow errors silently.
4. **Input validation** — All API routes in `orchestrator/src/app/api/` must validate input using Zod schemas from `orchestrator/src/lib/schemas.ts`.
5. **Type safety** — TypeScript files must not use `any` unless absolutely necessary. Prefer explicit types.
6. **Firebase rules** — Changes to `firestore.rules` must maintain deny-by-default with explicit per-collection allowances.

## Patterns to Flag
- `gemini-2.5-flash` or `gemini-2.5-pro` or any literal model string in source files (should use model-router)
- `console.log` in production code (use structured logging via `lib/telemetry.js`)
- Missing `try/catch` in async route handlers
- `allow read, write: if true` in Firestore rules
- Unused imports or dead code
- Docker images not pinned to specific versions

## Patterns to Accept
- `process.env.VARIABLE || 'dummy_key_for_build'` in top-level module scope (needed for Next.js build)
- Temporal workflow/activity patterns (signal handlers, sleep loops, continue-as-new)
- `firebase-admin-key.json` referenced in code but gitignored
