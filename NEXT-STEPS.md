# Next steps

Updated 2026-11-19. Kiroween submissions close **Friday, December 4, 2026 at 2:00 PM PT**. Aim to submit Thursday, December 3.

The code for label B's pipeline is built. What's left mostly needs an AI key, an account, or a person. The full backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues).

## The Nov 19 session

**Pushed on Nov 19**, on top of `1a35e10`. No issue was closed or commented on, and nothing was deployed.

| Commit | Issue | What changed | How it was checked |
|---|---|---|---|
| `c750a6d` | #10 | OpenRouter adapter in `src/pipeline/ai.ts`. It also handles error bodies sent with HTTP 200, `Retry-After`, empty replies cut off at the token limit, and replies that aren't JSON. `.env.example`, the README, and `tech.md` now use the real variable names. | 7 new tests in `tests/ai.test.ts`: all failed first (no `openrouter` provider), then passed. A full starter-pack run through the adapter, with fake OpenRouter replies taken from the answer key, scored 235 of 235. That checks the plumbing only, not a real model. |
| `0199744` | #14 | A failing accuracy report now goes to stderr. Kiro's docs say a hook that exits non-zero only passes stderr to the agent, so before this the agent never saw the wrong lines. | In a scratch copy with one deliberately broken results file: before, 29 lines on stdout and 0 on stderr; after, 0 and 29, exit code 1. A passing report still goes to stdout with exit code 0. |
| `0fc9fdd` | #11 | A reply without its `facts` or `groups` list is now rejected before it's cached, and a bare list counts as that list. Before, a bad reply stayed in `.cache/ai/` for good, so rerunning `pipeline:sample` could never retry it. | 2 new tests failed first (the bad reply was returned and cached), then passed. |
| `8fec491` | #16 | Tests that saved results replace a story's facts and evidence, and that the "Sample data" note says where facts came from. | New `tests/sample-results.test.tsx`. With the loader deliberately made to ignore results, 2 of its 4 tests failed. |
| `385b69c` | #20 | Tests for `/api/compare`, `/api/feeds`, and `/api/stories`, called the way Next.js calls them, with a fake OpenRouter. They cover the per-visitor caps, 503 without a key, 502 on provider errors, and bad input. | New `tests/api-routes.test.ts`, 9 tests. With the cap check deliberately removed, the cap test failed. |
| `c05289f` | #20, #13 | Extracted article text no longer includes skip links, bylines, author bios, "In Brief"/"Posted:" labels, or image credits. Before, these became story snippets and the AI's input. | 4 new tests in `tests/fulltext.test.ts`, modeled on real page structure with invented text. Two failed before the fix. One failed against the first version of the fix, which dropped a review's "Pros" and "Cons" labels. The fourth checks that a sentence merely naming the author stays. On The Verge, Ars Technica, TechCrunch, and Engadget, furniture paragraphs went from 21, 5, 21, and 20 to 0, 0, 0, and 0. Each feed kept 93 to 99% of its text, and no article was lost. Every removed paragraph was read: the only article text among them was image captions. |
| `afcb1a6` | #20 | RSS authors written as `email (Name)` now show just the name. | 1 new test failed first, then passed. |

The docs commits update `docs/demo-script.md` (#27), `docs/kiro-write-up.md` (#28), and the README's Vercel steps (#22). They also add `docs/feedback-request.md` (#25) and `docs/devpost-submission.md` (#30).

**Final checks:**
- `npm test`: 152 passing.
- `npm run lint`, `npm run typecheck`, and `npm run build`: clean.
- `npm run sample:cluster` at 0.22 (the default), 0.06, and 0.24: exact every time, with 34 stories and 100% precision and recall.

**Browser run, not saved in the repo.** The run used a scripted headless Chrome against `npm run build` + `npm start`, with no AI key. All 20 checks passed, both before and after `c05289f`:
- Clear errors for a private address, a page that isn't a feed, and an unknown host. A failed add adds nothing.
- Ars Technica and The Verge added, with full text for 30 of 30 articles.
- An OPML import kept its Gadgets and Startups folders and skipped a feed that was already subscribed.
- A live story with two sources showed "Comparison unavailable" and its article stayed readable.
- The archive and subscriptions survived a reload.
- X and Undo on the Thrushwell story worked.

The script is in the gitignored `.cache/browser-e2e/`.

**Not verified, worth checking (#15):** live-feed grouping reads each article's first two paragraphs. Since `c05289f`, those no longer include bylines or credits. The Nov 18 notes below say a similar filter made grouping less precise in the local labeled evaluation. That evaluation is on the other laptop, in `.cache/cluster-eval/`, and wasn't rerun. The starter pack is unaffected: it never goes through page extraction, and its three checks above are still exact. Whoever has `.cache/cluster-eval/` should rerun it. If live precision dropped, the options are tuning the threshold or grouping on the uncleaned lead.

**AI key: set up on Jason's laptop (Nov 19, late).** `.env.local` uses `AI_PROVIDER=openrouter` and `AI_MODEL=deepseek/deepseek-v4.1-flash-1017`. One tiny real request through the adapter came back with the expected JSON in about 2 seconds, and cost $0.00005. This is the paid model ($0.30 per million input tokens, $1.20 per million output). The key's spending cap is $50. Earlier, the free `google/gemma-4-31b-it:free` returned HTTP 429 from its provider twice, so avoid free models for full runs. Nothing bigger has run yet: #11's run on the sample, #13, #14's first score, #16's results, and #20's real comparison are still to do. Steps 1 to 4 below are the order.

## The one thing blocking everything: the AI key (#10)

**Decision (Nov 18): OpenRouter.** The adapter is built (`c750a6d`, above). Put `AI_PROVIDER=openrouter`, `AI_MODEL=<a vendor/model ID from openrouter.ai/models>`, and `OPENROUTER_API_KEY` in `.env.local`, which is gitignored. Never commit the key. On Vercel, add the same three variables. Prefer a model without reasoning: a reasoning model can spend the whole token limit thinking and return nothing, and the adapter now reports that as its own error. The adapter leaves out OpenRouter's optional `HTTP-Referer` and `X-OpenRouter-Title` headers, because they would list the app in OpenRouter's public rankings.

Once the key is set, run these in order:

1. `npm run pipeline:sample`: runs the AI on the starter pack, saves `data/sample/results/`, and prints the accuracy score. That's the first score for #11 and #14, and the AI half of A's #16.
2. If the score is under 8 of 10, read the wrong lines it prints, fix the prompts in `src/pipeline/facts.ts`, and rerun. Never edit the results by hand.
3. `npm run pipeline:try -- <4 to 6 tech feed URLs>`: the Day-3 test (#13). Mark each line in the checklist it writes to `.cache/day3/`, then post only the score on #13.
4. Commit `data/sample/results/`.

## Label B status

| Issue | Status |
|---|---|
| #10 AI provider and key | **OpenRouter chosen and the adapter built** (`c750a6d`, not pushed yet). Needs your key in `.env.local`. |
| #11 Extract facts | Built in `src/pipeline/facts.ts` and tested with a fake model. Bad replies are no longer cached (`0fc9fdd`). Needs a real run (step 1). |
| #12 Full text for excerpt feeds | Closed. Rechecked on Nov 18: The Verge, Ars Technica, and TechCrunch come back as full articles. |
| #13 Day-3 test | Script ready (step 3). Needs the key and a person to check lines. |
| #14 Accuracy-check hook | Built: `npm run accuracy` and `.kiro/hooks/pipeline-accuracy-check.json`. Checked against Kiro's docs on Nov 19: `timeout` belongs at the hook level, in seconds, so 300 gives five minutes. `PostFileSave` only fires when Kiro's agent edits a file. A failing report now reaches the agent (`0199744`). The hook hasn't been seen firing in a real session yet: in the IDE, check the Agent Hooks panel; in Kiro CLI V3, use `/hooks`. Needs a first real score. |
| #15 Story clustering | **Closed.** The known wrong grouping is separated. See "Resolution: #15" below. |
| #20 Add Feed | Built: "Add a subscription" in the sidebar, `/api/feeds`, `/api/stories`, `/api/compare`, capped per visitor. Checked in a browser on Nov 18 and again on Nov 19 (20 of 20 checks, above). The per-visitor cap is tested through the route with a fake provider (`385b69c`). Page furniture is gone from extracted text (`c05289f`). Still to check with the key: a real comparison. |
| #21 Archive | Closed. Checked in a browser: when a feed stops listing articles, Reader keeps them, even after a reload. |
| #22 Deploy to Vercel | **Needs your Vercel account.** Steps and variables are in the README under "Deploy to Vercel". The production build passes. The home page is built in at build time, so redeploy after committing `data/sample/results/`. Not deployed yet. |
| #24 MCP | **Needs you.** Kiro blocks its agent from writing `.kiro/settings/`, so a person creates the file. Steps below. |
| #25 Journalist feedback | **Needs people.** The message and five questions are in `docs/feedback-request.md`. |
| #28 Kiro write-up | Draft in `docs/kiro-write-up.md`, updated Nov 19. The CLI story, MCP, and the first real score are still "To do". |
| #29 README | Closed. Screenshots would still help. |
| #30 Submit | **Needs you.** The checklist audit, the disclosure lines, and a draft text description are in `docs/devpost-submission.md`. Add a description and the app URL to the repo's About section. |
| #32 OPML import | Closed. "Import subscriptions (OPML)" is in the "Add a subscription" form. Folders come along, and the hourly feed limit stops a big import early. |

## Left on label A

- **#16, the AI half of the starter pack.** It's unblocked once step 1 above runs: the loader already uses `data/sample/results/` when it exists, and the "Sample data" tooltip updates itself. Both are now tested (`8fec491`). Still to do: check the "+" lines. The demo script now picks its disclosure line from the tooltip, so it no longer needs editing.
- **#27, the demo video.** Record after #16, on the deployed site. `docs/demo-script.md` has the script and the recording checklist. Add Feed only works with public URLs, so if you demo it, use the deployed site's `/sample-feeds/*.xml`, not localhost.

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
6. Use it for one real task, such as asking Kiro to post the Day-3 score on #13. Then describe that task in `docs/kiro-write-up.md`.

## Resolution: #15 story clustering

- **Shipped (19db733), unchanged:** `DEFAULT_THRESHOLD` is 0.22, names and numbers count twice (`NAME_WEIGHT`), and a match is blocked when one shared term supplies more than 60% of its similarity (`MAX_TERM_SHARE`).
- **Fix:** otherwise eligible similarities below 0.24 are vetoed when fewer than two distinct shared ordinary terms support them. Ordinary means the term is not a name/number in both articles. The veto prevents both direct and transitive average-linkage merges.
- **Verified on the local labeled snapshot:** all495 went from 84 TP/10 FP/16 FN (89.4% precision/84.0% recall) before this fix to 84/9/16 (90.3%/84.0%). The deterministic 40 small sets went from 122/30/40 (80.3%/75.3%) to 122/29/40 (about 80.8%/75.3%).
- **More checks:** the four feeds now score 1 TP/0 FP/0 FN, with the two Google Search stories separate. Newest300 scores 43/4/8 and the feed halves 19/4/4 and 30/2/6, with no TP/FN regression. The starter pack remains exact at thresholds 0.06, 0.22, and 0.24, and all 125 tests pass.
- **Tried and rejected:** narrow metadata filtering for image credits, bylines, and timestamps still grouped the Google pair and worsened broader precision.
- **Local evaluation data:** the labeled snapshot and evaluation scripts remain in gitignored `.cache/cluster-eval/`; real publisher text must not be committed. Refetch and label it again on another machine.

## Notes

- Story clustering uses word similarity, not AI, so it's free and gives the same answer every time. The starter pack groups exactly like the story files, including the Pulse 4 article in the Thrushwell story that the X demo relies on. A pair of articles can't match on one shared word, such as a company name. If real feeds group badly in the Day-3 test, tune `DEFAULT_THRESHOLD` (0.22) in `src/pipeline/cluster.ts` and rerun `npm run sample:cluster`: the starter pack only matches exactly from 0.06 to 0.24.
- The per-visitor cap lives in server memory, so on Vercel each instance counts separately. It's a soft limit.
