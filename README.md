# Account Atlas

Account Atlas is a public Next.js app that accepts a company URL and produces an evidence-backed enterprise account plan with citations, section-level confidence, thin-evidence warnings, shareable public report URLs, and downloadable Markdown/PDF exports.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui patterns
- pnpm
- Drizzle ORM + Postgres
- Vercel Queues
- Vercel Blob
- OpenAI Responses API with web search, Structured Outputs, and one canonical stored report JSON per run
- Zod for env and request validation
- Vitest for unit tests

## Local Setup

1. Install dependencies.

```bash
pnpm install
```

2. Copy env defaults.

```bash
cp .env.example .env.local
```

3. Set at least `DATABASE_URL`.
4. Generate or apply migrations.

```bash
pnpm db:generate
pnpm db:migrate
pnpm preflight
```

5. Start the app.

```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000), submit a public company URL, and follow the public report page.

## Env File Hygiene

- Use `.env.example` as the template for local development and copy it to `.env.local`.
- Keep real secrets in `.env.local`, shell env vars, or Vercel project env vars only. Do not commit `.env`, `.env.local`, or other `.env.*` files.
- Configure Vercel environment variables outside the repo. Local report generation needs `DATABASE_URL` and `OPENAI_API_KEY`; `REQUEST_FINGERPRINT_SALT` is recommended for production-like runs.

## Required Env Vars

- `DATABASE_URL`
  Required for report persistence, request-rate auditing, artifacts, and all report lookups.
- `OPENAI_API_KEY`
  Required for the OpenAI-backed research, fact-base, and account-planning steps.
- `REQUEST_FINGERPRINT_SALT`
  Strongly recommended in production so per-request fingerprints are salted consistently.

## Optional Env Vars

- `BLOB_READ_WRITE_TOKEN`
  Enables Blob-backed storage for larger crawl artifacts and Markdown/PDF exports. Without it, exports still work in local development via inline artifact storage.
- `REPORT_PIPELINE_MODE`
  Legacy pipeline toggle kept only for rollback testing. New reports use the single deep-research background job path.
- `REPORT_CREATE_RATE_LIMIT_MAX`
- `REPORT_CREATE_RATE_LIMIT_WINDOW_MS`
- `REPORT_DOMAIN_ACTIVE_COOLDOWN_MS`
- `REPORT_DOMAIN_FAILED_COOLDOWN_MS`
- `REPORT_RECENT_REUSE_WINDOW_MS`
- `CRAWL_MAX_HTML_PAGES`
- `CRAWL_MAX_PDF_LINKS`
- `CRAWL_MAX_CONCURRENCY`
- `CRAWL_REQUEST_TIMEOUT_MS`
- `CRAWL_MAX_RESPONSE_BYTES`
- `CRAWL_MAX_PDF_BYTES`

See [.env.example](/Users/jongalante/Desktop/account-atlas/.env.example) for the current defaults.

## Report Generation Architecture

### Primary flow for new reports

- Normalize and validate the submitted company URL.
- Reuse a recent ready report for the same canonical domain when possible.
- Create one report run and start one OpenAI Responses background job with the canonical prompt and canonical schema.
- Poll the background response through the existing report/status routes.
- Parse and persist the canonical report JSON plus safe model metadata.
- Run one thin publish safety check.
- If safe, publish the full canonical brief.
- If unsafe, downgrade to a grounded fallback brief and still publish the grounded company snapshot.
- Render the report page, Markdown export, and PDF export from the stored canonical report JSON.

### Legacy modules

- The older crawl/research/account-plan pipeline modules are still present for rollback and compatibility work, but they are no longer the critical path for new reports.
- Existing stored reports that depend on legacy `researchSummary` and `accountPlan` data remain readable through the current fallback read path.

### Report creation protections

- Input URLs are normalized before any persistence or fetch.
- Localhost, private-network targets, link-local ranges, raw IP hosts, credentials in URLs, and non-standard ports are blocked.
- New report creation is rate-limited per requester fingerprint.
- Recent completed reports are reused for the same canonical domain when appropriate.
- Recently queued/running reports are deduped so repeated submits reuse the in-flight public report instead of creating a new expensive run.
- Recently failed reports are temporarily reused during a cooldown window to avoid immediate repeated retries.

### Reliability guards

- OpenAI background job polling uses bounded retry/backoff.
- Report creation, background sync, and export generation are idempotent at the run level.
- Export failures stay non-blocking to report availability.
- Queue retry logic remains available only for the legacy pipeline path.

### Public report honesty

- Facts, inferences, and hypotheses stay explicitly labeled.
- Thin-evidence warnings remain visible in the report and exports.
- Partial reports are labeled as partial when a run fails after persisting some evidence.
- No fake AI findings or fake citations should appear in the public UI.

## Database and Migrations

- Schema lives in [src/server/db/schema.ts](/Users/jongalante/Desktop/account-atlas/src/server/db/schema.ts).
- Generated SQL migrations live in [drizzle](/Users/jongalante/Desktop/account-atlas/drizzle).
- CLI database commands read `DATABASE_URL` from the shell first, then `.env`, then `.env.local`.
- Use `pnpm db:doctor` to confirm the target database, key tables, and Drizzle migration state without printing secrets.
- Use `pnpm preflight` before demos or manual testing. It checks env/config readiness, database/migration state, queue mode, OpenAI presence, crawl/export configuration, and runs the deterministic report smoke matrix.
- Regenerate migration files after schema edits:

```bash
pnpm db:generate
```

## Postgres Setup Notes

- Any Postgres instance supported by `postgres` + Drizzle works locally.
- The app expects `DATABASE_URL` to point at the same database used for migrations.
- Report creation, request-rate auditing, report reuse lookup, queue status polling, sources, facts, exports, and artifacts all depend on the database.

## Vercel Queue Setup Notes

- New reports do not rely on Vercel Queues for the primary deep-research flow.
- Queue callback lives at [route.ts](/Users/jongalante/Desktop/account-atlas/src/app/api/queues/report-runs/route.ts).
- Queue topic name is defined in [src/server/pipeline/pipeline-dispatcher.ts](/Users/jongalante/Desktop/account-atlas/src/server/pipeline/pipeline-dispatcher.ts).
- [vercel.json](/Users/jongalante/Desktop/account-atlas/vercel.json) only matters if you are validating the legacy queue-backed path.
- In local development, missing queue config does not block the main deep-research flow.

## Vercel Blob Setup Notes

- Blob storage is optional locally.
- When configured, larger crawl artifacts, research bundles, Markdown exports, and PDF exports are stored in Blob and referenced by artifact metadata in Postgres.
- When Blob is not configured, local development falls back to inline artifact storage so report downloads still work.

## OpenAI Setup Notes

- OpenAI integration lives under [src/server/openai](/Users/jongalante/Desktop/account-atlas/src/server/openai) and [src/server/deep-research](/Users/jongalante/Desktop/account-atlas/src/server/deep-research).
- New reports use one Responses background job with the canonical prompt and schema.
- Missing `OPENAI_API_KEY` prevents the primary report-generation flow from producing a seller-facing brief.

## Vercel Deployment Notes

- Set `DATABASE_URL`, `OPENAI_API_KEY`, `REQUEST_FINGERPRINT_SALT`, and optionally `BLOB_READ_WRITE_TOKEN` in Vercel project env vars.
- Keep `REPORT_PIPELINE_MODE=auto` unless you need to force a mode.
- Confirm the queue callback is deployed and the queue topic is configured before relying on async mode in production.
- Review structured server logs for events such as `report.create.*`, `pipeline.run.*`, `pipeline.step.*`, `queue.report_run.*`, `crawl.fetch.retry`, and `openai.retry`.

## Validation Commands

```bash
pnpm preflight
pnpm lint
pnpm typecheck
pnpm test
```

## Reliability Checks

- `pnpm preflight`
  Runs the practical readiness gate for demos and manual QA:
  - env/config consistency
  - DB connectivity and migration state
  - OpenAI presence for the deep-research background job
  - export dependency readiness
  - deterministic smoke coverage for the single-job report flow and grounded fallback boundaries
- `pnpm report:smoke`
  Runs the focused deterministic test matrix without the config/DB checks.

## Local Smoke Test

1. Set `DATABASE_URL` in `.env.local`.
2. Optionally set `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`.
3. Run:

```bash
pnpm db:migrate
pnpm dev
```

4. Submit a public URL such as `https://example.com`.
5. Confirm the app:
   - redirects to `/reports/[shareId]`
   - shows queued/in-progress/completed or grounded-fallback status cleanly
   - reuses a recent report when you resubmit the same domain
   - renders from stored canonical report JSON
   - offers Markdown and PDF downloads for completed runs

## Maintenance Hooks

- Retention helpers for stale vector stores and artifacts live in [src/server/maintenance/retention.ts](/Users/jongalante/Desktop/account-atlas/src/server/maintenance/retention.ts).
- They are intentionally TODO-marked and not yet wired to a scheduled cleanup job.
