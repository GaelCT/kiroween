# Structure

| Path | What goes there |
|---|---|
| `.kiro/steering/` | These steering docs |
| `.kiro/specs/` | Specs: `requirements.md`, `design.md`, `tasks.md` per feature |
| `.kiro/agents/` | Custom agents (JSON only; prompts live in `docs/agents/`) |
| `.kiro/hooks/` | Agent hooks |
| `data/sample/` | Fact tables for the starter pack. Each one is also the answer key for the accuracy check. |
| `docs/agents/` | Prompts for custom agents |
| `public/sample-feeds/` | Atom feeds for the fictional outlets |
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
