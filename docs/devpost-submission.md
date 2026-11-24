# Devpost submission (issue #30)

Deadline: Friday, Dec 4, 2026 at 2:00 PM PT. Aim for Thursday, Dec 3.

## Checklist, as of Nov 23

| Item | Status | How it was checked |
|---|---|---|
| Category: Resurrection | To do at submission | Chosen in `.kiro/steering/product.md` |
| Public GitHub repo, license visible in the About section | Done | GitHub's API shows the repo is public, and it detects the MIT license, which GitHub shows in About. About's description and website are still empty. Add a one-line description, and the app URL once it's deployed. |
| `/.kiro` at the root and not in `.gitignore` | Done | `git check-ignore` reports nothing for `.kiro/`, and GitHub's `main` has the steering docs, the spec, the grill-me agent, and the accuracy-check hook |
| Working app URL, tested in a fresh browser | Blocked on #22 | Not deployed yet |
| Demo video: public, under three minutes | Blocked on #27 | Script and checklist in `docs/demo-script.md` |
| Text description | Draft below | Fill in the parts marked **To do** |
| Kiro write-up | Draft | `docs/kiro-write-up.md`. Its "To do" sections need the CLI story and MCP (#24) |
| Disclosure that the starter pack is sample data with precomputed AI results | Ready | The AI results are committed (#16), and the built app's note says "The AI pipeline extracted the facts ahead of time". Use the first line below, after checking the deployed app's note. |

## Disclosure

Hover over the "Sample data" badge in the deployed app, and use the line that matches its note:

- **If the note says the AI pipeline extracted the facts:** "The app opens on a starter pack of fictional outlets and events, labeled Sample data. Its AI results were computed ahead of time, so judging makes no AI calls. Feeds you add run live."
- **If the note says the facts come from hand-written fact tables:** "The app opens on a starter pack of fictional outlets and events, labeled Sample data. Its facts come from hand-written fact tables, not from the AI. Feeds you add run live with the AI."

## Text description (draft)

### Inspiration

Google Reader was shut down in 2013. The problem it solved got worse: twenty outlets now report the same story, and most of what you read repeats what you've already read. Google Reader helped people organize information. Ours tells you what each source actually adds.

### What it does

Reader is a feed reader for journalists and researchers who follow many sources.
- It groups articles about the same event into one story.
- It opens each story on one primary article.
- Next to that article, a panel lists what every other source adds that you haven't read yet. Each "+" line is a fact, such as "Drew 320 W under load", and it links to the exact sentence that states it.
- As you read, the lists shrink. A source with nothing left says "No significant new information".
- X pulls an article out of a story that was grouped wrongly.
- It keeps Reader's habits: "All items", stars, unread counts, "Mark all as read", J/K keys, and OPML import.

### How we built it

- **Kiro planning:** we planned with a custom Kiro agent, grill-me, which put five critics on the plan before any code was written. Steering docs hold the rules for what counts as new.
- **Spec:** a Kiro spec defines the comparison in EARS requirements.
- **Stack:** Next.js and TypeScript.
- **Browser side:** the comparison is pure set logic, checked by eight property-based tests.
- **Server side:** a pipeline fetches feeds, gets the full text when a feed only sends excerpts, groups stories by headline and lead similarity, and asks an AI model (through OpenRouter) for facts. Every fact needs a sentence that appears word for word in the article.
- **Accuracy check:** a Kiro hook reruns the check against hand-written answer keys whenever the pipeline changes.

**To do:** add the Kiro CLI and MCP parts once they've happened.

### Challenges

- Keeping AI output checkable: a fact without its exact sentence is dropped.
- Real news pages include bylines, author bios, and photo credits. Text extraction had to remove them before the AI saw the text.
- Not telling readers something is new when it isn't.
  - The first real run on the starter pack got 223 of 238 "+" lines right. Most of the misses were the main article's facts reworded by another source.
  - A final AI check, which quotes the main article's own sentence when it already says the same thing, brought the starter pack to 227 of 227.
  - On real feeds, three stories checked line by line scored 26 of 31 (84%), above our 80% bar.

### What's next

**To do:** fill in after feedback from journalists (#25).
