# Product: Reader Resurrection

A resurrected Google Reader for a web where many sources report the same story. Built for Kiroween 2026, Resurrection category.

## Pitch

Google Reader helped people organize information; ours tells you what each source actually adds.

## Audience

Journalists and researchers who monitor many news sources. The demo persona is a tech reporter on deadline who needs the one source with benchmarks.

## The core idea: what each source adds

- A cluster is a group of articles about the same event. It opens on its primary article.
- A source adds the facts that aren't in the primary article or anything else the user has read in this cluster.
- Lists shrink as the user reads. A fact that two unread sources share shows in both lists until the user reads one of them.
- The duplicate score is the share of a source's facts the user has already seen. It comes from the same comparison as the list.
- A source that adds nothing shows "No significant new information". That is a result, not an error.
- A cluster stays partly unread while any unread source still adds something.
- All of this runs in the browser from saved facts, with no AI call.

## Rules for "+" lines

- Each "+" line states a fact, such as "Draws 320 W under load", not a topic, such as "Power consumption".
- Each "+" line links to the exact sentence in its article, and that sentence is highlighted when the article opens.
- Never show a fact without a verbatim supporting sentence.

## Keyboard

- J/K: next and previous cluster.
- N/P: next and previous source in the current cluster.
- X: pull the current article out of its cluster when it was grouped wrongly.

## Scope

- In: desktop web app, RSS/Atom, adding feeds, read/unread, stars, unread counts, archives, J/K/N/P/X, clustering, the duplicate score, and source differences.
- Out: mobile, sharing and social features, accounts, settings, recommendations, newsletter ingestion.
- Cut first when behind: folders, then OPML import, then search.

## Content rules (from the Kiroween 2026 rules)

- The starter pack uses only fictional outlets, companies, products, and events, and the app labels it as sample data.
- Never commit real publisher article text to the repo, and never show it in the demo video.
- No third-party trademarks or logos in the sample data, the UI, or the video. That includes Google's.
- Real feeds only run live.

## Demo and accuracy

- The starter pack is frozen, with AI results computed ahead of time, so judging needs no AI calls. Feeds a user adds run live. The submission says so.
- Accuracy bar: at least 8 of every 10 "+" lines right. A line is right if its sentence says it and the primary article doesn't.
- When a "+" line is wrong, fix the pipeline and rerun it. Never hand-edit pipeline output.

## Planning record

- `grill-me-session.md` holds the grill-me session and its verdict.
- The backlog lives in GitHub issues on GaelCT/kiroween, grouped into milestones.
