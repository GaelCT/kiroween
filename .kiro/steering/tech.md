# Tech

## Stack

- Next.js (App Router) with TypeScript and React.
- Node.js LTS, installed with nvm.
- Tests: Vitest. Property tests use fast-check.
- Feed parsing: fast-xml-parser, for Atom and RSS 2.0.
- Full-text extraction: @mozilla/readability on linkedom, for feeds that only send excerpts.
- Story clustering: TF-IDF similarity of headlines and leads in `src/pipeline/cluster.ts`. No AI call.
- Scripts: tsx.
- AI provider: not chosen yet (issue #10). `src/pipeline/ai.ts` supports Anthropic and OpenAI, picked with `AI_PROVIDER`, `AI_MODEL`, and the provider's key in `.env.local` (see `.env.example`). Amazon Bedrock would need a third adapter.
- Hosting: Vercel (issue #22).

## Commands

- `npm run dev`: start the dev server.
- `npm run build`: production build.
- `npm test`: run all tests once.
- `npm run lint`: lint.
- `npm run typecheck`: type-check.
- `npm run sample:build`: publish `data/sample/stories/` as Atom feeds in `public/sample-feeds/`. Run it after every story change; a test fails if the feeds are out of date.
- `npm run sample:cluster`: score story clustering against the story files.
- `npm run pipeline:sample`: run the AI pipeline on the starter pack and save the results in `data/sample/results/`. Needs the AI key.
- `npm run accuracy`: score the saved results against the fact tables. Fails below 8 of every 10 "+" lines. `-- --rerun` reruns the pipeline on three check stories first; the agent hook does this when a file in `src/pipeline/` is saved.
- `npm run pipeline:try -- <feed URLs>`: the Day-3 test on real feeds. Writes a checklist to `.cache/day3/`.

## Conventions

- The "adds" logic in `src/lib/adds.ts` is made of pure functions. It runs in the browser and never calls an AI model.
- Pipeline code (fetching, feed parsing, text extraction, fact extraction, clustering) lives in `src/pipeline/`. It runs on the server or at build time, never in the browser.
- Reading history and live feeds live in the browser's localStorage. There are no accounts.
- Any change to `src/lib/adds.ts` must keep the property tests in `tests/adds.property.test.ts` passing.
- Secrets only come from environment variables (`.env.local` locally, Vercel settings in production). Never commit them, and never log them.
- Every URL a visitor types goes through `src/pipeline/safe-fetch.ts`, which blocks private addresses and caps time and size.
- OPML imports are parsed in the browser (`src/lib/opml.ts`, loaded on first use). Only their feed URLs go to the server, through `/api/feeds`, the same way a typed URL does.
- `data/sample/results/` is pipeline output. Never edit it by hand: fix the pipeline and rerun `npm run pipeline:sample`.
- Real publisher text only lives in memory, in the visitor's browser, and in the gitignored `.cache/`. Never commit it.
