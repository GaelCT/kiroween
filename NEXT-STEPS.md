# Next steps

Updated 2026-11-18. Kiroween submissions close **Friday, December 4, 2026 at 2:00 PM PT**. Aim to submit Thursday, December 3.

The code for label B's pipeline is built. What's left mostly needs an AI key, an account, or a person. The full backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues).

## The one thing blocking everything: the AI key (#10)

**Decision (Nov 18): OpenRouter.** The code doesn't support it yet, so the first step is a third adapter:

1. In `src/pipeline/ai.ts`, add an `openrouter` entry to `PROVIDERS`, next to `openai`. OpenRouter uses the OpenAI chat-completions format: POST to `https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, and the reply text is in `choices[0].message.content`. Send `max_tokens` rather than `max_completion_tokens`. The key variable is `OPENROUTER_API_KEY`. The optional `HTTP-Referer` and `X-Title` headers name the app on OpenRouter's dashboard. Keep the existing retry, timeout, and never-log-the-key rules.
2. Add `OPENROUTER_API_KEY=` to `.env.example`, list `openrouter` under "Set up the AI key" in the README, and update the AI provider line in `.kiro/steering/tech.md`.
3. Add a test with a fake `fetch` to `tests/ai.test.ts`, like the existing ones.
4. Put `AI_PROVIDER=openrouter`, `AI_MODEL=<a model ID from openrouter.ai/models>`, and the key in `.env.local`, which is gitignored. Never commit the key. On Vercel, add the same three variables.

Once the key is set, run these in order:

1. `npm run pipeline:sample`: runs the AI on the starter pack, saves `data/sample/results/`, and prints the accuracy score. That's the first score for #11 and #14, and the AI half of A's #16.
2. If the score is under 8 of 10, read the wrong lines it prints, fix the prompts in `src/pipeline/facts.ts`, and rerun. Never edit the results by hand.
3. `npm run pipeline:try -- <4 to 6 tech feed URLs>`: the Day-3 test (#13). Mark each line in the checklist it writes to `.cache/day3/`, then post only the score on #13.
4. Commit `data/sample/results/`.

## Label B status

| Issue | Status |
|---|---|
| #10 AI provider and key | **OpenRouter chosen.** Needs the adapter in `src/pipeline/ai.ts` (steps above) and your key in `.env.local`. |
| #11 Extract facts | Built in `src/pipeline/facts.ts` and tested with a fake model. Needs a real run (step 1). |
| #12 Full text for excerpt feeds | Closed. Rechecked on Nov 18: The Verge, Ars Technica, and TechCrunch come back as full articles. |
| #13 Day-3 test | Script ready (step 3). Needs the key and a person to check lines. |
| #14 Accuracy-check hook | Built: `npm run accuracy` and `.kiro/hooks/pipeline-accuracy-check.json`. Its `timeout` now sits where Kiro reads it, so the rerun gets five minutes instead of the default 60 seconds. Kiro loads hooks when a session starts, so check `/hooks` in a new session. Needs a first real score. |
| #15 Story clustering | **Open, handed off.** Improved in 19db733, with one known wrong grouping left. See "Handoff: #15" below. Don't close it yet. |
| #20 Add Feed | Built: "Add a subscription" in the sidebar, `/api/feeds`, `/api/stories`, `/api/compare`, capped per visitor. Checked in a browser on Nov 18 with three real feeds: without the key, stories show "Comparison unavailable" and stay readable. Once the key is set, still to check: a real comparison and the per-visitor cap. |
| #21 Archive | Closed. Checked in a browser: when a feed stops listing articles, Reader keeps them, even after a reload. |
| #22 Deploy to Vercel | **Needs your Vercel account.** Import the GitHub repo at vercel.com/new, add the `.env.example` variables under Environment Variables, deploy, and test in a private window. |
| #24 MCP | **Needs you.** Kiro can't write `.kiro/settings/` for you. Create a GitHub token, set it as an environment variable, add the GitHub MCP server to `.kiro/settings/mcp.json`, use it once, and add it to the write-up. |
| #25 Journalist feedback | **Needs people.** |
| #28 Kiro write-up | Draft in `docs/kiro-write-up.md`. Fill in the "To do" sections. |
| #29 README | Closed. Screenshots would still help. |
| #30 Submit | **Needs you.** Checklist in the issue. |
| #32 OPML import | Closed. "Import subscriptions (OPML)" is in the "Add a subscription" form. Folders come along, and the hourly feed limit stops a big import early. |

## Left on label A

- **#16, the AI half of the starter pack.** It's unblocked once step 1 above runs: the loader already uses `data/sample/results/` when it exists, and the "Sample data" tooltip updates itself. Still to do: check the "+" lines and update the disclosure line in `docs/demo-script.md`.
- **#27, the demo video.** Record after #16. Add Feed only works with public URLs, so if you demo it, use the deployed site's `/sample-feeds/*.xml`, not localhost.

## Handoff: #15 story clustering

- **Done (19db733):** `src/pipeline/cluster.ts` blocks a match when one shared term supplies more than 60% of a pair's similarity (`MAX_TERM_SHARE`). Names and numbers count twice as much as other words (`NAME_WEIGHT`), and `DEFAULT_THRESHOLD` is 0.22.
- **Results:** on 495 real articles from 20 tech feeds (Nov 18), labeled by hand, grouped pairs that report the same event went from 55% to 89%. Same-event pairs that end up grouped went from 95% to 84%. The starter pack still matches its story files at any threshold from 0.06 to 0.24, and X works on live stories, with Undo.
- **Left:** with only The Verge, Ars Technica, TechCrunch, and Tom's Hardware subscribed, two different Google Search stories still group. TechCrunch's extracted article starts with "Image Credits:…" and a timestamp, so only its headline counts, and that headline shares "Google" and "Search" with The Verge's.
- **Tried and rejected:** counting a multi-word name like "Google Search" once, and skipping short paragraphs that don't end like a sentence. Both split that pair, but each kept more real same-event pairs apart without catching more wrong ones. A narrower fix that only drops image credits, bylines, and timestamps hasn't been tried.
- **Tools:** the labeled snapshot and the evaluation scripts are in the gitignored `.cache/cluster-eval/` on the machine that made them, and its `README.md` lists them. Real article text can't be committed, so on another machine, refetch with `fetch-snapshot.mts` and label again.
- **Rules:** any change must keep `npm run sample:cluster` exact and `npm test` passing.

## Notes

- Story clustering uses word similarity, not AI, so it's free and gives the same answer every time. The starter pack groups exactly like the story files, including the Pulse 4 article in the Thrushwell story that the X demo relies on. A pair of articles can't match on one shared word, such as a company name. If real feeds group badly in the Day-3 test, tune `DEFAULT_THRESHOLD` (0.22) in `src/pipeline/cluster.ts` and rerun `npm run sample:cluster`: the starter pack only matches exactly from 0.06 to 0.24.
- The per-visitor cap lives in server memory, so on Vercel each instance counts separately. It's a soft limit.
