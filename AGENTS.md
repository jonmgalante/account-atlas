# Account Atlas

## Goal
Build a public web app that accepts any company URL and produces an evidence-backed enterprise account plan.

## Locked Decisions
- Public app in v1 with no user auth.
- Reports are saved server-side, have shareable public URLs, and also appear in a browser-local recent reports list.
- Stack: Next.js App Router, TypeScript, Tailwind, shadcn/ui, pnpm, Drizzle ORM, Postgres, Vercel, Vercel Queues, Vercel Blob.
- AI: OpenAI Responses API with web search, file search, Structured Outputs, one vector store per report run, `gpt-5.4` for synthesis/planning, `gpt-5.4-mini` for extraction/classification.
- Exports: Markdown and polished PDF.
- Exclusions for v1: no CRM sync, outbound email, billing, or private data connectors.

## Output Rules
- The report must cover: company brief, fact base, AI maturity signals, prioritized use cases, recommended motion (`workspace`, `API platform`, or `hybrid`), stakeholder hypotheses, objections, discovery questions, 90-day pilot plan, expansion scenarios, and citations.
- Every major recommendation must be source-backed.
- Explicitly label facts vs inferences vs hypotheses.
- Expose research completeness and confidence by section.
- Degrade gracefully when evidence is thin.

## Engineering Rules
- Keep secrets server-side only.
- Validate and normalize company URLs carefully.
- Block localhost and private-network SSRF targets.
- Keep background and queue consumers idempotent.
- Prefer minimal, well-maintained dependencies.
- If setup or env requirements change, update `README` and `.env.example` in the same change.
- Keep diffs coherent and production-minded.

## Working Style
- Inspect the repo before changing code.
- Do not give upfront plans unless explicitly asked.
- Make changes directly.
- Run `pnpm lint`, `pnpm typecheck`, and relevant tests before stopping.
- End with a concise summary of changed files, commands run, and blockers.
