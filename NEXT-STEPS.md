# Next steps

Updated 2026-11-18. Kiroween submissions close **Friday, December 4, 2026 at 2:00 PM PT**. Aim to submit Thursday, December 3.

The code for label B's pipeline is built. What's left mostly needs an AI key, an account, or a person. The full backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues).

## The one thing blocking everything: the AI key (#10)

Pick Anthropic or OpenAI, get an API key, and put it in `.env.local` (copy `.env.example`; the README explains each line). Then note the choice in `.kiro/steering/tech.md`. Amazon Bedrock would need a third adapter in `src/pipeline/ai.ts`.

Once the key is set, run these in order:

1. `npm run pipeline:sample`: runs the AI on the starter pack, saves `data/sample/results/`, and prints the accuracy score. That's the first score for #11 and #14, and the AI half of A's #16.
2. If the score is under 8 of 10, read the wrong lines it prints, fix the prompts in `src/pipeline/facts.ts`, and rerun. Never edit the results by hand.
3. `npm run pipeline:try -- <4 to 6 tech feed URLs>`: the Day-3 test (#13). Mark each line in the checklist it writes to `.cache/day3/`, then post only the score on #13.
4. Commit `data/sample/results/`.

## Label B status

| Issue | Status |
|---|---|
| #10 AI provider and key | Code supports Anthropic and OpenAI. **Needs your choice and a key.** |
| #11 Extract facts | Built in `src/pipeline/facts.ts` and tested with a fake model. Needs a real run (step 1). |
| #12 Full text for excerpt feeds | Done. Checked on The Verge, Ars Technica, TechCrunch, and Engadget. |
| #13 Day-3 test | Script ready (step 3). Needs the key and a person to check lines. |
| #14 Accuracy-check hook | Done: `npm run accuracy` and `.kiro/hooks/pipeline-accuracy-check.json`. Needs a first real score. |
| #15 Story clustering | Done, without AI: matches all 34 starter-pack stories, including keeping the Nimbusfold and Deepcask outages apart. X already fixes wrong groupings. |
| #20 Add Feed | Done: "Add a subscription" in the sidebar, `/api/feeds`, `/api/stories`, `/api/compare`, capped per visitor. Comparisons show "Comparison unavailable" until the server has the key. |
| #21 Archive | Done: live articles are kept in the browser and never deleted. |
| #22 Deploy to Vercel | **Needs your Vercel account.** Import the GitHub repo at vercel.com/new, add the `.env.example` variables under Environment Variables, deploy, and test in a private window. |
| #24 MCP | **Needs you.** Kiro can't write `.kiro/settings/` for you. Create a GitHub token, set it as an environment variable, add the GitHub MCP server to `.kiro/settings/mcp.json`, use it once, and add it to the write-up. |
| #25 Journalist feedback | **Needs people.** |
| #28 Kiro write-up | Draft in `docs/kiro-write-up.md`. Fill in the "To do" sections. |
| #29 README | Done except screenshots. |
| #30 Submit | **Needs you.** Checklist in the issue. |
| #32 OPML import | Not started. It's on the cut list. |

## Left on label A

- **#16, the AI half of the starter pack.** It's unblocked once step 1 above runs: the loader already uses `data/sample/results/` when it exists, and the "Sample data" tooltip updates itself. Still to do: check the "+" lines and update the disclosure line in `docs/demo-script.md`.
- **#27, the demo video.** Record after #16. Add Feed only works with public URLs, so if you demo it, use the deployed site's `/sample-feeds/*.xml`, not localhost.

## Notes

- Story clustering uses word similarity, not AI, so it's free and gives the same answer every time. The starter pack groups exactly like the story files, including the Pulse 4 article in the Thrushwell story that the X demo relies on. If real feeds group badly in the Day-3 test, tune `DEFAULT_THRESHOLD` in `src/pipeline/cluster.ts` and rerun `npm run sample:cluster`.
- The per-visitor cap lives in server memory, so on Vercel each instance counts separately. It's a soft limit.
