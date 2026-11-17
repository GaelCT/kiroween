# Reader Resurrection

Google Reader helped people organize information; ours tells you what each source actually adds.

Reader is a feed reader for journalists and researchers who follow many sources. It groups articles about the same event into one story. For each source, it shows the facts you haven't read yet, with the sentence that states each one. Built for [Kiroween 2026](https://kiroween.devpost.com/) in the Resurrection category.

## Run it locally

1. Install Node.js with [nvm](https://github.com/nvm-sh/nvm):

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
   nvm install --lts
   ```

2. Install dependencies and start the dev server:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:3000.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run all tests (Vitest) |
| `npm run lint` | Lint with ESLint |
| `npm run typecheck` | Type-check with TypeScript |

## How this was planned

- `grill-me-session.md` is the planning session with Kiro's grill-me agent, including its verdict.
- `.kiro/` holds the steering docs, the comparison pipeline spec, and the grill-me custom agent.
- The backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues), grouped into milestones.

## License

[MIT](LICENSE)
