# Writing sample stories

The starter pack is what judges see first, so every story has to read like real tech news and still be entirely fictional. The file format is in [README.md](README.md). The example to copy is [stories/corvid-rv90.json](stories/corvid-rv90.json).

## Content rules

- Invent every company, product, person, publication, game, government body, and law. Real countries, US states, and big cities are fine as places. Use invented towns and counties for local events.
- Don't attribute a law, ruling, vote, or official action to a real government, court, or agency. Use invented cities and counties, the invented agencies below, or unnamed bodies like "lawmakers" and "a federal judge".
- Don't name real brands or trademarked standards. Write "wireless", "charging port", or "graphics memory" instead of names like Wi-Fi, Bluetooth, HDMI, or USB.
- Generic descriptions are fine: "a federal judge", "state regulators", "lawmakers".
- Don't mention Corvid or the RV-90. That story belongs to the demo.
- Don't contradict another story. If two stories mention the same company, keep its products and numbers consistent.
- Use these invented agencies when a story needs one: the Federal Spectrum Office (radio licenses), the Office of Vehicle Safety (car recalls), the Consumer Device Safety Office (product recalls), the National Cyber Readiness Office (security directives), and the Aviation Operations Board (drones).

## The outlets

| ID | Outlet | Beat and voice | Staff |
|---|---|---|---|
| `byteward` | Byteward | General tech news. Neutral and clear. | Dana Whitlock, Arlo Pennick, Simone Achterberg |
| `launch-desk` | Launch Desk | Launches and business: price, date, availability, revenue, funding. Short and brisk. | Theo Marsh, Inez Calder |
| `frametime` | FrameTime | Benchmarks and gaming. Tests things itself: "in our testing". | Wren Halloway, Kofi Mensah-Lind |
| `ohm-and-bit` | Ohm & Bit | Hardware and engineering deep dives: how it works, trade-offs, limits. | Imogen Vale, Rafe Okonkwo-Hart |
| `bench-and-bill` | Bench & Bill | Policy, courts, and regulation: filings, rules, deadlines, penalties. | Celia Marchetti, Owen Brightwater |
| `wirefold` | Wirefold | Wire service. Its feed only carries a one- or two-sentence summary. No author. | none |

Wirefold articles never mark facts and are never the primary. In the app they show "Limited source content".

## Facts and markers

- A fact is one checkable claim: a number, a date, a name, a decision, a result. Write its wording as a short "+" line: sentence case, no final period, digits for numbers, ideally under 60 characters. Good: "Costs $899". Bad: "Pricing details".
- Mark the one sentence in each article that states the fact: `[f04: The card will cost $899.]`. Each marked sentence states exactly one fact. Put each marker around a whole sentence.
- When another outlet reports the same fact, mark it with the same ID in that outlet's own words. Statements that differ in any number, date, or name are different facts, so they get different IDs.
- Every fact in `facts` is marked in at least one article. No article marks the same fact twice.
- Sentences without a marker can't add information. Use them only for opinions and transitions, like "That's a big claim."
- Use straight apostrophes ('). Use curly quotes (“ ”) for quotations. Don't use square brackets except in markers.

## Shape of a multi-source story

- Headlines are near-identical across outlets, like "Corvid announces its new RV-90 GPU" and "Corvid launches the RV-90 graphics card".
- The primary article states 3 to 5 facts. It's usually the most complete basic report.
- Each other full-text outlet repeats 1 to 3 of the primary's facts in its own words and adds 0 to 4 new facts that fit its beat.
- In most stories, two non-primary outlets share at least one new fact, so it shows under both until one is read.
- In about a third of stories, one outlet adds nothing once the others are read. In a few stories, one outlet adds nothing at all: it only rewrites the primary.
- Lengths: primary 80 to 160 words, others 50 to 140 words, Wirefold one or two sentences. Vary them.

## Dates

- Use ISO 8601 in UTC, like `2026-11-12T15:30:00Z`.
- Every article except the RV-90 story is published before `2026-11-16T14:00:00Z`, so the RV-90 headlines are the newest four in the demo.
- Articles in one story land within a few hours of each other. Wirefold is often first.

## Check your work

Run the checker on your files. It writes nothing, and it prints what each outlet adds once the story is opened:

```bash
npm run sample:check -- data/sample/stories/my-story.json
```

Then publish the feeds and run the tests:

```bash
npm run sample:build
npm test
```
