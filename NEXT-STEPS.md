# Next steps

Updated 2026-11-16. Kiroween submissions close **Friday, December 4, 2026 at 2:00 PM PT**. Aim to submit Thursday, December 3.

Label A is done except two issues. Label B hasn't started. The full backlog is in [GitHub issues](https://github.com/GaelCT/kiroween/issues).

## Decisions for you

1. **Pick the AI provider (#10):** OpenAI, Anthropic, or Amazon Bedrock. #11 needs it, and the Thursday test (#13) needs #11.
2. **If B is a teammate,** add them as a collaborator on the GitHub repo so they can push.
3. **Skim the sample stories for real names.** Helper agents wrote 33 of the 34 stories in `data/sample/stories/`. I renamed every invented name that matched a real company, but a second look before the video is worth it.
4. **Optional:** npm blocked esbuild's install script. Everything works without it. To allow it anyway, run `npm install-scripts approve esbuild`.

## Left on label A

- **#16, the AI half of the starter pack.** This is blocked on #11 and #15. Once the pipeline exists:
  - Run it on the starter pack and save the results, so judging needs no AI calls.
  - Check every "+" line against the fact tables. When a line is wrong, fix the pipeline and rerun it. Don't edit the output.
  - Update the "Sample data" tooltip in `src/components/Reader.tsx` and the disclosure line in `docs/demo-script.md` so they say what's true.
- **#27, the demo video.** This needs a person. Follow `docs/demo-script.md` and the recording checklist at its end. Record after #16 is finished, or change the disclosure to say the facts come from hand-written fact tables.

## Label B, by milestone

### Milestone 1: Skeleton, due Thursday, Nov 19

- #10 Choose the AI provider and set up the API key (decision 1 above)
- #11 Extract facts with the AI model
- #12 Fetch full text for excerpt-only feeds
- #13 Day-3 test: 8 of 10 "+" lines right on three real stories. Due Thursday, and it needs #10, #11, and #12 first.
- #14 Agent hook: rerun the accuracy check when the pipeline changes

### Milestone 2: Core reader, due Wednesday, Nov 25

- #15 Story clustering
- #20 Add Feed: live fetch, extract, and compare
- #21 Keep the archive: never delete fetched articles
- #22 Deploy to Vercel
- #24 Use an MCP server during development

### Milestone 3: Demo and write-up, due Tuesday, Dec 1

- #25 Get feedback from three journalists or researchers
- #28 Write the Kiro write-up
- #29 Write the README

### Milestone 4: Submit, due Thursday, Dec 3

- #30 Submit to Devpost. The checklist is in the issue.

### Stretch

- #32 OPML import

## Handoff notes for B

- **#11:** match the story-file shape: facts, each with a sentence copied verbatim from the article. Drop any fact whose sentence isn't in the article text. `assembleSampleData` in `src/pipeline/sample.ts` shows how evidence attaches to articles.
- **#13 and #14:** the story files in `data/sample/stories/` are the answer key. `npm run sample:check` prints what each outlet adds once a story is opened.
- **#15:** the Nimbusfold and Deepcask outages happen the same morning to different companies, so clustering must keep them apart. The Thrushwell recall story includes Launch Desk's Pulse 4 article on purpose, for the X demo. Decide whether the starter pack's stories come from the story files or from #15's output, because that misgrouping only exists in the story files.
- **#20:** for live comparisons, set `comparison` on the cluster to `"pending"` or `"failed"`. The UI already shows "Comparing N sources…" and "Comparison unavailable". Never save real article text to the repo.
- **#22:** the page is static. Put the AI key in Vercel's environment variables, never in the repo.
- **#28:** material for the write-up:
  - the grill-me custom agent and `grill-me-session.md`
  - the steering docs and the comparison pipeline spec in `.kiro/`
  - the property tests P1 to P8, with the mutation checks described in commit 0a8fcf9
  - the helper agents that wrote the starter pack in parallel
- **#29:** `README.md` already explains how to run the app. It still needs the features, the sample-data note, and screenshots.
