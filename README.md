# Reader Resurrection

Google Reader helped people organize information; ours tells you what each source actually adds.

Reader is a feed reader for journalists and researchers who follow many sources. Built for [Kiroween 2026](https://kiroween.devpost.com/) in the Resurrection category.

## What it does

When twenty outlets report the same event, most of what you read is repetition. Reader groups articles about the same event into one story and opens it on one primary article. Next to it, a panel lists what every other source adds that you haven't read yet.

- **"+" lines are facts, not topics.** You see "+ Draws 320 W under load", not "Power consumption".
- **Every fact links to its sentence.** Click a "+" line and the article opens with that sentence highlighted. A fact without a verbatim sentence is never shown.
- **Lists shrink as you read.** Once you've read a fact anywhere in the story, it drops off every other source's list. A source with nothing left says "No significant new information".
- **Duplicate scores** show how much of a source repeats what you've read.
- **It's still Reader:** "All items", starred items, unread counts, "Mark all as read", and J/K/N/P keys. X pulls an article out of a story when it was grouped wrongly.
- **Add your own feeds** with "Add a subscription". Real feeds run live: the server fetches them, gets the full text when a feed only sends excerpts, groups stories, and compares them with an AI model. Articles stay in your browser, and Reader never deletes them, so the archive reaches back past what a feed currently lists.

Reading history, stars, and added feeds live in your browser's localStorage. There are no accounts.

## Sample data

The app opens on a starter pack of 127 articles in 34 stories from 6 outlets. Every outlet, company, product, person, and event in it is fictional, and the app labels it "Sample data". Its links use the reserved `.example` domain.

Each sample story has a hand-written fact table (`data/sample/stories/`), which is also the answer key for the accuracy check. The starter pack's facts come from those fact tables until `npm run pipeline:sample` has run the AI pipeline on it. After that, they come from AI results computed ahead of time and saved in `data/sample/results/`, so reading the starter pack never calls an AI model. The "Sample data" label's tooltip says which is the case.

## Run it locally

1. Install [Node.js](https://nodejs.org/) LTS. On macOS or Linux you can use [nvm](https://github.com/nvm-sh/nvm):

   ```bash
   nvm install --lts
   ```

2. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

   On Windows PowerShell, if `npm` doesn't run, use `npm.cmd` instead.

3. Open http://localhost:3000.

The starter pack works without any setup. Live feeds also work, but comparing them needs an AI key.

## Set up the AI key

Fact extraction uses an AI model. Reader supports Anthropic and OpenAI.

1. Copy `.env.example` to `.env.local`. `.env.local` is gitignored, so the key never gets committed.
2. Fill in:
   - `AI_PROVIDER`: `anthropic` or `openai`
   - `AI_MODEL`: a model ID from your provider's model list
   - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
3. Restart `npm run dev`.

In production, set the same variables in your host's environment settings (on Vercel: Project → Settings → Environment Variables). `LIVE_ARTICLE_LIMIT` caps how many articles one visitor can send for comparison per day (default 60).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run all tests (Vitest) |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with TypeScript |
| `npm run sample:build` | Publish the sample stories as Atom feeds |
| `npm run sample:check` | Check story files and print what each outlet adds |
| `npm run sample:cluster` | Score story clustering against the story files |
| `npm run pipeline:sample` | Run the AI pipeline on the starter pack and save the results (needs the key) |
| `npm run accuracy` | Score the saved results against the fact tables; fails below 8 of every 10 "+" lines |
| `npm run pipeline:try -- <feed URLs>` | Run real feeds through the pipeline and write a checklist to `.cache/day3/` |

## How it works

- `src/pipeline/` runs on the server: feed parsing, full-text extraction, story clustering, and fact extraction with the AI model. Each fact keeps the exact sentence it came from, and facts whose sentence isn't verbatim in the article are dropped.
- `src/lib/adds.ts` runs in the browser: from saved facts and your reading history, it works out each source's "+" lines, duplicate score, and highlights. It never calls an AI model.
- The rules are in `.kiro/steering/product.md`, and the design is in `.kiro/specs/comparison-pipeline/`.

## How this was planned

- `grill-me-session.md` is the planning session with Kiro's grill-me agent, including its verdict.
- `.kiro/` holds the steering docs, the comparison pipeline spec, the grill-me custom agent, and the accuracy-check hook.
- The backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues), grouped into milestones.

## License

[MIT](LICENSE)
