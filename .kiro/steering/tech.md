# Tech

## Stack

- Next.js (App Router) with TypeScript and React.
- Node.js LTS, installed with nvm.
- Tests: Vitest. Property tests use fast-check.
- Feed parsing: fast-xml-parser, for Atom and RSS 2.0.
- Scripts: tsx.
- AI provider: not chosen yet (issue #10). Options are OpenAI, Anthropic, and Amazon Bedrock.
- Hosting: Vercel (issue #22).

## Commands

- `npm run dev`: start the dev server.
- `npm run build`: production build.
- `npm test`: run all tests once.
- `npm run lint`: lint.
- `npm run typecheck`: type-check.
- `npm run sample:build`: publish `data/sample/stories/` as Atom feeds in `public/sample-feeds/`. Run it after every story change; a test fails if the feeds are out of date.

## Conventions

- The "adds" logic in `src/lib/adds.ts` is made of pure functions. It runs in the browser and never calls an AI model.
- Pipeline code (fetching, feed parsing, text extraction, fact extraction, clustering) lives in `src/pipeline/`. It runs on the server or at build time, never in the browser.
- Reading history lives in the browser's localStorage. There are no accounts.
- Any change to `src/lib/adds.ts` must keep the property tests in `tests/adds.property.test.ts` passing.
- Secrets only come from environment variables (`.env.local` locally, Vercel settings in production). Never commit them, and never log them.
