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
- OpenAI Responses API with web search, file search, Structured Outputs, and one vector store per report run
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
pnpm db:doctor
pnpm db:generate
pnpm db:migrate
```

5. Start the app.

```bash
pnpm dev
```

6. Open [http://localhost:3000](http://localhost:3000), submit a public company URL, and follow the public report page.

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
  `auto`, `inline`, or `vercel_queue`.
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

## Pipeline Behavior

### Inline vs queue mode

- `REPORT_PIPELINE_MODE=auto`
  Uses Vercel Queues on Vercel and inline execution locally.
- `REPORT_PIPELINE_MODE=inline`
  Runs the full pipeline in-process. Best for local development.
- `REPORT_PIPELINE_MODE=vercel_queue`
  Requires queue delivery. Use this when validating the real async path.

### Report creation protections

- Input URLs are normalized before any persistence or fetch.
- Localhost, private-network targets, link-local ranges, raw IP hosts, credentials in URLs, and non-standard ports are blocked.
- New report creation is rate-limited per requester fingerprint.
- Recent completed reports are reused for the same canonical domain when appropriate.
- Recently queued/running reports are deduped so repeated submits reuse the in-flight public report instead of creating a new expensive run.
- Recently failed reports are temporarily reused during a cooldown window to avoid immediate repeated retries.

### Reliability guards

- Crawl fetches and OpenAI calls use bounded retry/backoff.
- Expensive pipeline steps run with explicit timeouts.
- Step retries are capped; repeated failures open a circuit for that step on the run.
- Queue retries are logged and remain observable through both structured logs and persisted run events.

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
- Regenerate migration files after schema edits:

```bash
pnpm db:generate
```

## Postgres Setup Notes

- Any Postgres instance supported by `postgres` + Drizzle works locally.
- The app expects `DATABASE_URL` to point at the same database used for migrations.
- Report creation, request-rate auditing, report reuse lookup, queue status polling, sources, facts, exports, and artifacts all depend on the database.

## Vercel Queue Setup Notes

- Queue callback lives at [api/queues/report-runs.ts](/Users/jongalante/Desktop/account-atlas/api/queues/report-runs.ts).
- Queue topic name is defined in [src/server/pipeline/pipeline-dispatcher.ts](/Users/jongalante/Desktop/account-atlas/src/server/pipeline/pipeline-dispatcher.ts).
- [vercel.json](/Users/jongalante/Desktop/account-atlas/vercel.json) must route the queue callback correctly in deployed environments.
- In local development, missing queue config falls back to inline execution unless queue-only mode is forced.

## Vercel Blob Setup Notes

- Blob storage is optional locally.
- When configured, larger crawl artifacts, research bundles, Markdown exports, and PDF exports are stored in Blob and referenced by artifact metadata in Postgres.
- When Blob is not configured, local development falls back to inline artifact storage so report downloads still work.

## OpenAI Setup Notes

- OpenAI integration lives under [src/server/openai](/Users/jongalante/Desktop/account-atlas/src/server/openai) and [src/server/research](/Users/jongalante/Desktop/account-atlas/src/server/research).
- Each report run creates one vector store and uploads normalized crawl sources plus relevant first-party PDFs for file search.
- Missing `OPENAI_API_KEY` degrades gracefully in development: crawl still runs, but OpenAI-backed research/planning steps remain incomplete and the report stays explicit about thin or partial evidence.

## Vercel Deployment Notes

- Set `DATABASE_URL`, `OPENAI_API_KEY`, `REQUEST_FINGERPRINT_SALT`, and optionally `BLOB_READ_WRITE_TOKEN` in Vercel project env vars.
- Keep `REPORT_PIPELINE_MODE=auto` unless you need to force a mode.
- Confirm the queue callback is deployed and the queue topic is configured before relying on async mode in production.
- Review structured server logs for events such as `report.create.*`, `pipeline.run.*`, `pipeline.step.*`, `queue.report_run.*`, `crawl.fetch.retry`, and `openai.retry`.

## Validation Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
```

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
   - shows queued/in-progress/completed or failed status cleanly
   - reuses a recent report when you resubmit the same domain
   - offers Markdown and PDF downloads for completed runs

## Maintenance Hooks

- Retention helpers for stale vector stores and artifacts live in [src/server/maintenance/retention.ts](/Users/jongalante/Desktop/account-atlas/src/server/maintenance/retention.ts).
- They are intentionally TODO-marked and not yet wired to a scheduled cleanup job.
