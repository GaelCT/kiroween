# Next steps

Updated 2026-11-23. Kiroween submissions close **Friday, December 4, 2026 at 2:00 PM PT**. Aim to submit Thursday, December 3.

The code work is done. What's left needs an account or a person. The full backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues).

## What's left, in order

1. **#22 Deploy to Vercel.** The steps and variables are in the README, under "Deploy to Vercel". This needs a Vercel account. The production build passes. Nothing has been deployed.
2. **#24 MCP.** Follow the steps under "Setting up MCP" below. This needs a GitHub token, and a person has to create the config file.
3. **#25 Journalist feedback.** Once the app is deployed, send `docs/feedback-request.md` to three journalists or researchers.
4. **#27 Demo video.** Record it on the deployed site, following `docs/demo-script.md`.
5. **#28 Kiro write-up.** `docs/kiro-write-up.md` still needs two sections: the Kiro CLI, covering only what actually happened in it, and MCP.
6. **#30 Submit.** The checklist and a draft description are in `docs/devpost-submission.md`. Also add a description and the app's URL to the repo's About section.

## The Nov 23 session

#13, #14, #16, and #20 were closed as completed, each with a comment giving the evidence.

| Commit | Issue | What changed | How it was checked |
|---|---|---|---|
| `6a4a79c` | #16 | A third AI call now checks every statement about to be shown as new against the primary article. The extraction and matching prompts got stricter rules. The route tests now load their modules before running. | The new test failed first. The starter pack went from 223 of 238 lines right to 227 of 230 after the prompt rules, then to 226 of 226 with the check. The route tests timed out once on a busy machine. The same two tests failed when run with a 1-second limit and no warm-up, and passed once the warm-up was added. |
| `8482c51` | #13, #16 | The check now reads the primary article's full text and quotes its sentence. That also covers leads that extraction skipped. A source whose sentence lacks a number in the line it would show gets its own fact. The Day-3 checklist now includes the primary article's text. | 4 new tests and 1 updated test. 4 of them failed first. The fifth checks that the pipeline ignores an answer quoting text the primary doesn't have. |
| `a56ca58`, `b30d96b` | #16 | New starter-pack results. | `npm run pipeline:sample`: 227 of 227 "+" lines right, with 8 answer-key lines not shown. Nobody edited the results by hand. |

**Checks:**
- `npm test`: 160 passing.
- `npm run lint`, `npm run typecheck`, and `npm run build`: clean.
- `npm run sample:cluster` at 0.22, 0.06, and 0.24: 34 stories, 100% precision and recall each time. `cluster.ts` is unchanged.

**Real live comparison, not saved in the repo.** This used a scripted headless Chrome against `npm run build` + `npm start`, with the real key. The script is `.cache/browser-e2e/run-live.ts`.
- Four real feeds added: Ars Technica, The Verge, TechCrunch, and Engadget.
- All 5 stories with two or more full sources were compared, and each comparison found facts.
- An opened story listed 2 "+" lines. Clicking one opened its source with the sentence highlighted.

**Per-visitor cap on a real server**, started with `LIVE_ARTICLE_LIMIT=2` and the real key:
- The first two-article comparison returned 200, with 21 facts.
- The second returned 429 in 7 ms, before any AI call.
- A second visitor still got 200.

**The hook firing on its own.** Nobody ran the check by hand during this session.
- Each of three times Kiro's agent saved `src/pipeline/facts.ts`, the check's result files in `.cache/accuracy/` were rewritten.
- Saves at 21:42:40 and 22:49:04 were followed by rewrites 5 and 2 seconds later. After the first save, at about 20:39, the files were rewritten at 20:39:47.
- The rewritten files came from real runs with the real model, and the latest scored 29 of 29.
- The hook's output never appeared in the agent's chat. Only the result files show it ran.

**Day-3 test (#13).** This used nine real tech feeds and compared the three stories with the most sources: 4, 3, and 3.
- **First run:** 24 of 30 lines right (80%).
- **Second run, after `8482c51`:** 26 of 31 (84%). If the one borderline line counts as wrong, it's 25 of 31 (81%).
- **Who checked:** Kiro, line by line, not a person. The review is in the gitignored `.cache/day3/review.md`, because it quotes the articles. A person may want to spot-check it.
- **What's still wrong:** restatements the check missed ("on Monday" next to "today"), a price the primary only gives in its headline, and arithmetic ("nine total" next to "eight plus a ninth").

**Spend:** $0.11 so far on the OpenRouter key, all sessions included, out of a $50 cap.

**Known limits:**
- A fact that the primary article only states in its headline can't be matched, because evidence must be a sentence in the article body. So other sources show it as new.
- The "+" wording on the starter pack can change whenever `npm run pipeline:sample` runs again. The demo script says to check it before recording.

**Not verified (#15):** live-feed grouping reads each article's first two paragraphs. Since `c05289f`, those no longer include bylines or credits. The Nov 18 notes below say a similar filter made grouping less precise in the local labeled evaluation. That evaluation lives on the other laptop, in `.cache/cluster-eval/`, and wasn't rerun. The Day-3 run's three stories were each grouped correctly, and the starter pack's checks above are still exact. Whoever has `.cache/cluster-eval/` should rerun it.

## Running the AI pipeline

`.env.local` (gitignored) sets three variables:
- `AI_PROVIDER=openrouter`
- `AI_MODEL`: a `vendor/model` ID from openrouter.ai/models. Jason's laptop uses `z-ai/glm-5.3-flash`, a paid model at $0.04 per million input tokens and $0.08 per million output.
- `OPENROUTER_API_KEY`

Never commit the key. On Vercel, add the same three variables.

Avoid free `:free` models for full runs: `google/gemma-4-31b-it:free` returned HTTP 429 twice. The adapter asks for low reasoning effort, retries a malformed reply once, and reports a reply cut off at the token limit. It leaves out OpenRouter's optional `HTTP-Referer` and `X-OpenRouter-Title` headers, which would list the app in OpenRouter's public rankings.

- `npm run pipeline:sample`: reruns the starter pack, saves `data/sample/results/`, and prints the score. If a line is wrong, fix the prompts in `src/pipeline/facts.ts` and rerun. Never edit the results by hand. Commit the results, then redeploy.
- `npm run accuracy`: scores the saved results. With `-- --rerun`, it reruns the hook's three check stories first.
- `npm run pipeline:try -- <feed URLs>`: the Day-3 test on real feeds. It writes a checklist, including each primary article's text, to `.cache/day3/`.

## Label B status

| Issue | Status |
|---|---|
| #10 AI provider and key | **Closed.** OpenRouter adapter (`c750a6d`). |
| #11 Extract facts | **Closed.** First real run: 223 of 238 (94%). |
| #12 Full text for excerpt feeds | Closed. |
| #13 Day-3 test | **Closed.** 26 of 31 lines right (84%) on three real stories, checked line by line by Kiro. |
| #14 Accuracy-check hook | **Closed.** Seen firing on its own three times, with real runs. A failing report reaches the agent (`0199744`). |
| #15 Story clustering | **Closed.** See "Resolution: #15" below. |
| #20 Add Feed | **Closed.** Real comparison checked in a browser, and the per-visitor cap on a real server. |
| #21 Archive | Closed. |
| #22 Deploy to Vercel | **Needs a Vercel account.** README, "Deploy to Vercel". |
| #24 MCP | **Needs a person.** Steps below. |
| #25 Journalist feedback | **Needs people.** `docs/feedback-request.md`. |
| #28 Kiro write-up | Draft in `docs/kiro-write-up.md`, updated Nov 23. The Kiro CLI and MCP sections are still "To do". |
| #29 README | Closed. Screenshots would still help. |
| #30 Submit | **Needs a person.** `docs/devpost-submission.md`. |
| #32 OPML import | Closed. |

## Label A

- **#16, the AI half of the starter pack.** **Closed.** The AI results are committed, and the app uses them, so judging makes no AI calls. Every "+" line was checked against the fact tables, and the 15 wrong lines from the first run were fixed in the pipeline. The score is now 227 of 227.
- **#27, the demo video.** Record it on the deployed site, using the script and recording checklist in `docs/demo-script.md`. The RV-90 story still plays the way the script describes. Add Feed only works with public URLs, so if you demo it, use the deployed site's `/sample-feeds/*.xml`, not localhost.

## Setting up MCP (#24)

Kiro won't let its agent write `.kiro/settings/`, so these steps are for a person. They follow Kiro's MCP docs (kiro.dev/docs/mcp).

1. Create a fine-grained GitHub token that can only reach GaelCT/kiroween, with read and write access to issues.
2. Save it as a Windows user environment variable named `GITHUB_TOKEN`, then quit and reopen Kiro, so Kiro sees the new variable.
3. In Kiro, run **Kiro: Open workspace MCP config (JSON)** from the Command Palette. Paste this, then save:

   ```json
   {
     "mcpServers": {
       "github": {
         "command": "docker",
         "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
         "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}" },
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

   This needs Docker Desktop running. The file only names the variable, so it holds no secret. Never paste the token itself into it.
4. When Kiro asks to approve `GITHUB_TOKEN`, approve it.
5. Open the MCP servers tab in the Kiro panel and check that `github` is connected. If it isn't, read "Kiro - MCP Logs" in the Output panel.
6. Use it for one real task, such as asking Kiro to comment on an issue. Then describe that task in `docs/kiro-write-up.md`.

## The Nov 19 session

Pushed on Nov 19, on top of `1a35e10`. #10 and #11 were closed as completed.

| Commit | Issue | What changed | How it was checked |
|---|---|---|---|
| `c750a6d` | #10 | OpenRouter adapter in `src/pipeline/ai.ts`. It also handles error bodies sent with HTTP 200, `Retry-After`, replies cut off at the token limit, and replies that aren't JSON. | 7 new tests: all failed first, then passed. |
| `0199744` | #14 | A failing accuracy report goes to stderr. Kiro's docs say a hook that exits non-zero only passes stderr to the agent. | Scratch copy with a broken results file: before, 29 lines on stdout and 0 on stderr; after, 0 and 29, exit code 1. |
| `0fc9fdd` | #11 | A reply without its list is rejected before it's cached, so a rerun retries it. | 2 new tests failed first. |
| `8fec491` | #16 | Tests that saved results replace the fact tables, and that the "Sample data" note says where facts came from. | With the loader deliberately made to ignore results, 2 of 4 failed. |
| `385b69c` | #20 | Tests for the three API routes with a fake OpenRouter, including the per-visitor caps. | With the cap check deliberately removed, the cap test failed. |
| `c05289f` | #20, #13 | Extracted article text drops skip links, bylines, author bios, "In Brief" and "Posted:" labels, and image credits. | 4 new tests. On four real feeds, furniture paragraphs went from 21, 5, 21, and 20 to 0, with 93 to 99% of the text kept. |
| `afcb1a6` | #20 | RSS authors written as `email (Name)` show just the name. | 1 new test failed first. |
| `492b7a3` | #11 | Low reasoning effort, one retry for malformed JSON, and a clearer token-limit error. | 3 new tests failed first. The first real run had failed on 11 stories. |

The first real run scored 223 of 238 (94%). A no-key browser run passed 20 of 20 checks, covering errors, OPML folders, "Comparison unavailable", reloads, and X with Undo.

## Resolution: #15 story clustering

- **Shipped (19db733), unchanged:** `DEFAULT_THRESHOLD` is 0.22, names and numbers count twice (`NAME_WEIGHT`), and a match is blocked when one shared term supplies more than 60% of its similarity (`MAX_TERM_SHARE`).
- **Fix:** otherwise eligible similarities below 0.24 are vetoed when fewer than two distinct shared ordinary terms support them. Ordinary means the term is not a name/number in both articles. The veto prevents both direct and transitive average-linkage merges.
- **Verified on the local labeled snapshot:** all495 went from 84 TP/10 FP/16 FN (89.4% precision/84.0% recall) before this fix to 84/9/16 (90.3%/84.0%). The deterministic 40 small sets went from 122/30/40 (80.3%/75.3%) to 122/29/40 (about 80.8%/75.3%).
- **More checks:** the four feeds now score 1 TP/0 FP/0 FN, with the two Google Search stories separate. Newest300 scores 43/4/8 and the feed halves 19/4/4 and 30/2/6, with no TP/FN regression. The starter pack remains exact at thresholds 0.06, 0.22, and 0.24, and all 125 tests pass.
- **Tried and rejected:** narrow metadata filtering for image credits, bylines, and timestamps still grouped the Google pair and worsened broader precision.
- **Local evaluation data:** the labeled snapshot and evaluation scripts remain in gitignored `.cache/cluster-eval/`; real publisher text must not be committed. Refetch and label it again on another machine.

## Notes

- Story clustering uses word similarity, not AI, so it's free and gives the same answer every time. The starter pack groups exactly like the story files, including the Pulse 4 article in the Thrushwell story that the X demo relies on. A pair of articles can't match on one shared word, such as a company name. If real feeds group badly, tune `DEFAULT_THRESHOLD` (0.22) in `src/pipeline/cluster.ts` and rerun `npm run sample:cluster`: the starter pack only matches exactly from 0.06 to 0.24.
- The per-visitor cap lives in server memory, so on Vercel each instance counts separately. It's a soft limit.
- Each live story with two full sources costs three AI calls, plus one per extra source. With `z-ai/glm-5.3-flash`, that's a fraction of a cent.
