# Structure

| Path | What goes there |
|---|---|
| `.kiro/steering/` | These steering docs |
| `.kiro/specs/` | Specs: `requirements.md`, `design.md`, `tasks.md` per feature |
| `.kiro/agents/` | Custom agents (JSON only; prompts live in `docs/agents/`) |
| `.kiro/hooks/` | Agent hooks |
| `data/sample/` | Starter pack: `sources.json` (fictional outlets) and `stories/*.json` (one fact table per story, also the answer key for the accuracy check). Format in `data/sample/README.md`. |
| `docs/agents/` | Prompts for custom agents |
| `public/sample-feeds/` | Atom feeds generated from the story files by `npm run sample:build`. Never edit by hand. |
| `scripts/` | Dev scripts, run with tsx |
| `src/app/` | Next.js routes and global styles |
| `src/components/` | React components |
| `src/lib/` | Browser-safe logic and shared types |
| `src/pipeline/` | Server and build-time pipeline code |
| `tests/` | Vitest tests (`*.test.ts`) and property tests (`*.property.test.ts`) |

## Naming

- Files use kebab-case, except React components, which use PascalCase (`SourcePanel.tsx`).
- Fact IDs are `f01`, `f02`, and so on, unique within a cluster's fact table.
- Sample feed entry IDs use `urn:reader-sample:<outlet>:<story>`.
- Sample links use the reserved `.example` domain, so they never point at a real site.
