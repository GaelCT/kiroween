# Next steps

Updated 2026-11-19. Kiroween submissions close **Friday, December 4, 2026 at 2:00 PM PT**. Aim to submit Thursday, December 3.

The code for label B's pipeline is built. What's left mostly needs an AI key, an account, or a person. The full backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues).

## Resume here: the Nov 19 session (paused mid-backlog)

**Not pushed yet.** The commits below exist only on Jason's laptop, on top of `1a35e10`. Push them with `git push origin main` before anyone else works on `main`. No issue was closed or commented on.

| Commit | Issue | What changed | How it was checked |
|---|---|---|---|
| `c750a6d` | #10 | OpenRouter adapter in `src/pipeline/ai.ts`. It also handles error bodies sent with HTTP 200, `Retry-After`, empty replies cut off at the token limit, and replies that aren't JSON. `.env.example`, the README, and `tech.md` now use the real variable names. | 7 new tests in `tests/ai.test.ts`: all failed first (no `openrouter` provider), then passed. A full starter-pack run through the adapter, with fake OpenRouter replies taken from the answer key, scored 235 of 235. That checks the plumbing only, not a real model. |
| `0199744` | #14 | A failing accuracy report now goes to stderr. Kiro's docs say a hook that exits non-zero only passes stderr to the agent, so before this the agent never saw the wrong lines. | In a scratch copy with one deliberately broken results file: before, 29 lines on stdout and 0 on stderr; after, 0 and 29, exit code 1. A passing report still goes to stdout with exit code 0. |
| `0fc9fdd` | #11 | A reply without its `facts` or `groups` list is now rejected before it's cached, and a bare list counts as that list. Before, a bad reply stayed in `.cache/ai/` for good, so rerunning `pipeline:sample` could never retry it. | 2 new tests failed first (the bad reply was returned and cached), then passed. |
| `8fec491` | #16 | Tests that saved results replace a story's facts and evidence, and that the "Sample data" note says where facts came from. | New `tests/sample-results.test.tsx`. With the loader deliberately made to ignore results, 2 of its 4 tests failed. |
| `385b69c` | #20 | Tests for `/api/compare`, `/api/feeds`, and `/api/stories`, called the way Next.js calls them, with a fake OpenRouter. They cover the per-visitor caps, 503 without a key, 502 on provider errors, and bad input. | New `tests/api-routes.test.ts`, 9 tests. With the cap check deliberately removed, the cap test failed. |

All 147 tests passed after `385b69c`, and lint, typecheck, and the production build were clean. Rerun all four before pushing.

**Browser run (Nov 19), not saved in the repo.** The run used a scripted headless Chrome against `npm run build` + `npm start`, with no AI key. All 20 checks passed:
- Clear errors for a private address, a page that isn't a feed, and an unknown host. A failed add adds nothing.
- Ars Technica and The Verge added. Full text worked for 30 of 30 articles, with a median of 2,158 characters.
- An OPML import kept its Gadgets and Startups folders and skipped a feed that was already subscribed.
- A live story with two sources showed "Comparison unavailable" and its article stayed readable.
- The archive and subscriptions survived a reload.
- X and Undo on the Thrushwell story worked.

The script is in the gitignored `.cache/browser-e2e/`.

**Found, not fixed yet (#13, #20).** On real pages, text extraction keeps some page furniture, and the AI would see it as article text. Examples:
- The Verge: "Skip to main content", the author's name, and the author's bio paragraph, at the top.
- TechCrunch: "In Brief" and "Posted:" on short posts.
- Engadget: image credits such as "Getty Images" as their own paragraphs.
- Ars Technica: subheads.

The fix could be a cleanup step in `src/pipeline/fulltext.ts` or a prompt rule in `src/pipeline/facts.ts`. Nothing was changed yet: a prompt edit was tried and reverted, so judge it with the real Day-3 run. The scratch probes are in `.cache/probe-leads.ts` and `.cache/probe-junk.ts`. #15 clustering wasn't touched.

**Still to do in this pass:**
- **#28:** update `docs/kiro-write-up.md` for the stderr change, the OpenRouter adapter, and the testing above.
- **#22:** write a deploy checklist (notes below).
- **#24, #25, #27, #30:** prepare the materials (notes below).
- Rerun `npm test`, `npm run build`, `npm run lint`, and `npm run typecheck`.

**Notes gathered so far:**
- **#22 Vercel:** no `vercel.json` is needed. The routes set `maxDuration` to 60 s (`/api/feeds`) and 120 s (`/api/compare`), both under the 300 s limit on every Vercel plan. Variables to set: `AI_PROVIDER=openrouter`, `AI_MODEL`, `OPENROUTER_API_KEY`, and optionally `LIVE_ARTICLE_LIMIT`. The app hasn't been deployed.
- **#24 MCP:** Kiro blocks its agent from writing `.kiro/settings/`, so a person has to create `.kiro/settings/mcp.json`. Use **Kiro: Open workspace MCP config (JSON)**. The Docker option is documented on Kiro's MCP examples page: command `docker`, args `run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server`, and env `"GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"`. Then:
  1. Create a fine-grained token for this repo only.
  2. Set `GITHUB_TOKEN` as a Windows user environment variable, and fully restart Kiro.
  3. Approve the variable when Kiro asks.
  4. Check the MCP servers tab in the Kiro panel.
- **#30 audit:** the repo is public, GitHub shows the MIT license, `.kiro/` is on `main` and not gitignored, and the About description and website are empty.

**Blocked on the AI key:** no provider is set up on this laptop. The app's own config check reports `modelConfigured(): false`. Until there's a key, nothing has had a real model run: #11's run on the sample, #13, #14's first score, #16's results, and #20's real comparison. Steps 1 to 4 below are still the order.

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
| #20 Add Feed | Built: "Add a subscription" in the sidebar, `/api/feeds`, `/api/stories`, `/api/compare`, capped per visitor. Checked in a browser on Nov 18 and again on Nov 19 (20 of 20 checks, above). The per-visitor cap is now tested through the route with a fake provider (`385b69c`). Still to check with the key: a real comparison. Page furniture in extracted text is an open finding (above). |
| #21 Archive | Closed. Checked in a browser: when a feed stops listing articles, Reader keeps them, even after a reload. |
| #22 Deploy to Vercel | **Needs your Vercel account.** Import the GitHub repo at vercel.com/new, add the `.env.example` variables under Environment Variables, deploy, and test in a private window. |
| #24 MCP | **Needs you.** Kiro can't write `.kiro/settings/` for you. Create a GitHub token, set it as an environment variable, add the GitHub MCP server to `.kiro/settings/mcp.json`, use it once, and add it to the write-up. |
| #25 Journalist feedback | **Needs people.** |
| #28 Kiro write-up | Draft in `docs/kiro-write-up.md`. Fill in the "To do" sections. |
| #29 README | Closed. Screenshots would still help. |
| #30 Submit | **Needs you.** Checklist in the issue. |
| #32 OPML import | Closed. "Import subscriptions (OPML)" is in the "Add a subscription" form. Folders come along, and the hourly feed limit stops a big import early. |

## Left on label A

- **#16, the AI half of the starter pack.** It's unblocked once step 1 above runs: the loader already uses `data/sample/results/` when it exists, and the "Sample data" tooltip updates itself. Both are now tested (`8fec491`). Still to do: check the "+" lines and update the disclosure line in `docs/demo-script.md`.
- **#27, the demo video.** Record after #16. Add Feed only works with public URLs, so if you demo it, use the deployed site's `/sample-feeds/*.xml`, not localhost.

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
