# Demo script (under 3 minutes)

The video for the Kiroween 2026 submission. It runs on the starter pack: fictional outlets and events, labeled "Sample data" in the app. Before recording, press **Reset reading** so the app opens like a first visit.

The narration is about 320 words, which takes roughly 2:10 at a calm pace. That leaves about 40 seconds for pauses and the Kiro sentences you add at recording time.

## 0:00–0:15 Cold open: 127 articles become 34 stories

**On screen:** the first-visit view. The sidebar says "All items (127)". The top four rows are near-identical headlines about the Corvid RV-90 GPU, from Ohm & Bit, FrameTime, Launch Desk, and Byteward.

**Narration:** "This is what following tech news looks like: 127 unread articles. The top four are the same GPU launch. Watch what happens when I press J."

**Action:** press **J**. Duplicate rows collapse, "All items" drops to 34, and the RV-90 story opens with the "What each source adds" panel.

## 0:15–0:35 The death story and the pitch

**On screen:** stay on the open story. The panel lists each source with its "+" lines.

**Narration:** "Google Reader was shut down in 2013. Google said usage was falling, but it had spent years starving Reader to build Google+. The problem Reader solved never went away. It got worse: twenty sources now report the same story. Google Reader helped people organize information. Ours tells you what each source actually adds."

## 0:35–1:30 A tech reporter on deadline

**Narration:** "Say I'm a tech reporter filing on the RV-90, and I need benchmarks. Reader opened the story on Byteward. The panel shows what every other source adds that I haven't read yet."

**Action:** point at FrameTime's lines: "+ 38% faster than the RV-80 at 4K in testing" and "+ Draws 320 W under load".

**Narration:** "FrameTime has the benchmarks. Every line is a fact, not a topic. I'll click the one I need."

**Action:** click **+ Draws 320 W under load**. FrameTime opens, and the sentence flashes, highlighted in the article.

**Narration:** "It jumps to the exact sentence, so I can check it before I quote it. Now look at the panel. Ohm & Bit's list just shrank, because I've already read the benchmark it repeats."

**Action:** press **N** to open Ohm & Bit. Only the facts that are new to you are highlighted: the price, the release date, the 850 W power supply, 84 °C under load, and frame generation in 14 games.

**Narration:** "Ohm & Bit adds price, date, power, and heat. And Launch Desk now says 'No significant new information', so I can skip it. I read three sources, skipped the fourth, and every new fact was highlighted for me."

## 1:30–1:55 When grouping goes wrong

Story grouping compares headlines and opening paragraphs, with no AI call, so don't call it "the AI" in the narration.

**Action:** click the Thrushwell Pulse 3 recall story in the list, then click its **Launch Desk** tab. Its article is about the new Pulse 4, not the recall.

**Narration:** "Grouping can go wrong. This recall story picked up an article about Thrushwell's new watch. One key fixes it."

**Action:** press **X**. The article moves into its own story, and a toast offers Undo.

## 1:55–2:15 It's still Reader

**Action:** point at the sidebar counts, star the story with **S**, open **Starred items**, then click **Show: Every article** and back to **Stories**.

**Narration:** "It's still the reader people miss: your feeds, unread counts, starred items, mark all as read, and J and K. Counts only include sources that still have something new for you."

## 2:15–2:45 How Kiro built it

**On screen:** the GitHub repo: `.kiro/steering`, `.kiro/specs/comparison-pipeline`, `.kiro/agents/grill-me.json`, and `grill-me-session.md`.

**Narration:** "We planned it with a custom Kiro agent called grill-me, a panel of five critics that questioned the plan before we wrote code. Its verdict is in the repo. Steering docs hold the rules for what counts as new. A spec defines the comparison in EARS requirements, and property tests check eight rules on random reading histories."

**Fill in at recording time:** one sentence each for the Kiro pieces that exist by then, such as the accuracy-check hook (#14) and MCP (#24). Only mention what's built. The hook exists, but only quote its score if a real run produced one, and only mention MCP once it's been used.

## 2:45–2:55 Close

**On screen:** back to the RV-90 story with the panel visible.

**Narration:** "Feed readers survived to organize information. Ours tells you what each source actually adds."

**Lower third, for the whole video:** before recording, hover over the "Sample data" badge and read its note.
- If the note says the AI pipeline extracted the facts ahead of time, use: "Sample data: fictional outlets and events. AI results computed ahead of time."
- If it says the facts come from hand-written fact tables, use: "Sample data: fictional outlets and events. Facts from hand-written fact tables."

## Notes

- "Hundreds of users every year" is cut. Nobody found a source for it.
- Keep the AI disclosure honest. The starter pack's facts come from the hand-written fact tables until `npm run pipeline:sample` has run with a real model and its results are committed in `data/sample/results/` (#16). The badge's note always says which, so match the lower third to it.
- Never show real publisher articles or logos in the video. If you demo Add Feed (#20), add one of the sample feeds from the deployed site, such as `https://<your-app>.vercel.app/sample-feeds/byteward.xml`. Reader refuses `localhost` addresses on purpose, so this only works on the deployed site.

## Recording checklist (#27)

- Browser at 1440×900 or 1920×1080, zoom 100%, a fresh profile with no extensions, notifications off.
- Record on the deployed site (#22), so it's the same app judges will open.
- Press **Reset reading** first, then reload.
- Hover over the "Sample data" badge and set the lower third to match its note.
- Record the screen with narration. The rules say no copyrighted music, so use silence or music you have rights to.
- Keep it under 3:00. Judges don't have to watch past three minutes.
- Upload to YouTube as public, add captions, and put the link in the Devpost form.
