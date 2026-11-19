# How we built Reader Resurrection with Kiro

Draft for the Kiroween submission (issue #28). Sections marked **To do** need a person to fill in before submitting. Only describe what was actually built and used.

## Planning with a custom agent: grill-me

Before writing code, we ran the plan past `grill-me`, a custom Kiro agent defined in `.kiro/agents/grill-me.json`, with its prompt in `docs/agents/grill-me.md`. It plays five critics in turn: the Visionary, the Designer, the Engineering Manager, the Gravekeeper, and the Judge. Each asks three to five questions and pushes back on vague answers. The Judge then scores the plan.

The whole session and its verdict are in `grill-me-session.md`. Several of the project's hardest rules came out of it:

- the Day-3 test: at least 8 of every 10 "+" lines right on three real stories, or fix the comparison before building anything else
- the cut order when behind: folders, then OPML import, then search
- a frozen starter pack with AI results computed ahead of time, so judging needs no AI calls
- reading history kept in each visitor's browser, so judges never see each other's reads

## Steering docs

`.kiro/steering/` holds three always-included docs, so every Kiro session starts with the same rules:

- `product.md`: what a source "adds", the rules for "+" lines, the keyboard, the Google Reader details, and the content rules for the starter pack
- `tech.md`: the stack, the commands, and conventions such as "the adds logic never calls an AI model" and "never commit real publisher text"
- `structure.md`: where each kind of file goes, and naming rules

## Spec-driven development for the comparison pipeline

The comparison is the riskiest part of the app, so it got its own spec in `.kiro/specs/comparison-pipeline/`:

- `requirements.md`: eleven requirements in EARS form, from "facts with evidence" to "live comparisons"
- `design.md`: the data model, the comparison as set operations on fact IDs, a worked example on the fictional Corvid RV-90 launch, and eight correctness properties
- `tasks.md`: the implementation plan, with each task linked to a GitHub issue

## Property-based tests

Each correctness property in the design is a fast-check test in `tests/adds.property.test.ts`, run on random clusters and reading histories. Examples: "reading more never makes a list longer" and "a fact the user hasn't seen appears under every unread source that reports it".

We checked that the tests catch real bugs by breaking the code on purpose. Ignoring read articles fails P2 and P3. Ignoring whether the primary article was read fails P8. An earlier "show a fact under only one source" rule fails P7.

## The accuracy-check hook

`.kiro/hooks/pipeline-accuracy-check.json` is an agent hook. When Kiro saves a file under `src/pipeline/`, it runs `scripts/accuracy-check.ts --rerun`:

1. It reruns the AI pipeline on three starter-pack stories. Replies are cached in `.cache/ai/`, so a rerun only pays for prompts that changed.
2. It compares every "+" line with the story files, which are the answer key. A line is right only if its sentence is one the answer key marks with a fact, and the primary article doesn't state that fact.
3. It fails when fewer than 8 of every 10 lines are right, and prints each wrong line with the reason.

That makes the Day-3 bar a check that runs while the pipeline is being edited, instead of a one-time test. The hook gives the check up to five minutes. It only fires on Kiro's own edits: file-save hooks don't run when you save a file in the editor.

**To do:** add the first real score once the AI key is set.

## Kiro IDE and Kiro CLI

**To do:** describe how each was used and how they differed. For example, which tasks went to the IDE's spec workflow and which to `kiro-cli chat` in the terminal.

## MCP

**To do (issue #24):** configure the GitHub MCP server in `.kiro/settings/mcp.json`, with the token read from an environment variable, use it for at least one real workflow (such as updating issues), and describe it here.

## Agents working in parallel

Helper agents wrote 33 of the 34 starter-pack stories in parallel, following `data/sample/WRITING.md`. Each story is checked by `npm run sample:check` and the tests, which require every marked sentence to appear verbatim in its published article. Invented names that matched real companies were renamed by hand.
