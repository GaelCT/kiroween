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

We checked the hook against Kiro's documentation on Nov 19 and found one real problem. When a hook command fails, Kiro passes only its stderr to the agent, but the check printed its report to stdout. So the agent would have learned that the check failed, but not which lines were wrong. The report now goes to stderr when the check fails. We confirmed it on a scratch copy with one broken results file: before the fix, all 29 report lines went to stdout and none to stderr; after it, the reverse.

Until there's an AI key, the pipeline is tested with a fake model that answers from the fact tables. Run on the whole starter pack, a model that answered that well would get 235 of 235 "+" lines right. That only shows the scoring and plumbing work. It says nothing about a real model.

**First real score (Nov 19):** with `z-ai/glm-5.3-flash` through OpenRouter, the pipeline got 223 of 238 "+" lines right across the whole starter pack, which is 94%. The hook's own command, run by hand on its three check stories, scored 30 of 33, or 91%. The first real run also turned up three problems, which we fixed in the pipeline rather than the output:
- The model reasons at maximum effort by default, which used up the token limit on 8 stories. It's now asked for low effort.
- On 3 stories, it sent malformed JSON, such as a missing bracket. A malformed reply now gets one more try.
- A reply cut off partway through had been reported as bad JSON. It's now reported as hitting the token limit.

Most of the 15 wrong lines are restatements of the primary article's facts that the matching step didn't recognize, such as "Priced at $1,499" next to "Costs $1,499".

**To do:** note whether the hook was seen firing in a session. So far its command has only been run by hand.

## Kiro IDE and Kiro CLI

**What we know so far:**
- **Kiro IDE:** most of the comparison pipeline was built in Kiro's IDE chat on Nov 18 and 19. That includes full-text extraction, story grouping, fact extraction, the accuracy check and its hook, Add Feed, the browser archive, and the OpenRouter adapter.
  - The steering docs came along into every chat, so the agent followed the project's rules without being reminded. One example is "never commit real publisher text".
  - The agent created the accuracy-check hook with Kiro's hook tool.
  - Before changing the hook, the agent checked Kiro's own documentation: where the timeout goes, when `PostFileSave` fires, and what a failing command sends back.
- **Kiro CLI:** version 3.5.0 was installed on Nov 18, and a `kiro-cli chat` session was started in the repo.

**To do:** say what the CLI was used for and how it differed from the IDE. Only describe work that actually happened in it.

## MCP

**To do (issue #24):** configure the GitHub MCP server, use it for at least one real workflow, and describe it here. The setup steps are in `NEXT-STEPS.md`, under #24.

## Agents working in parallel

Helper agents wrote 33 of the 34 starter-pack stories in parallel, following `data/sample/WRITING.md`. Each story is checked by `npm run sample:check` and the tests, which require every marked sentence to appear verbatim in its published article. Invented names that matched real companies were renamed by hand.
