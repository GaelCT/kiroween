# Sample data

Everything in this folder is fictional: the outlets, companies, products, people, and events. The app labels it as sample data.

## Files

- `sources.json`: the fictional outlets. Their homepages use the reserved `.example` domain, so they never point at a real site.
- `stories/<story>.json`: one file per story. Each file is the fact table for that story and the answer key for the accuracy check.

## Story files

| Field | Meaning |
|---|---|
| `id` | Story ID, used in feed entry IDs: `urn:reader-sample:<outlet>:<story>` |
| `title` | Story title shown in the story list |
| `primary` | The outlet whose article the story opens on |
| `facts` | Fact IDs (`f01`, `f02`, ...) and the wording shown on "+" lines |
| `articles` | One article per outlet, keyed by outlet ID |

Each article has a `title`, `author`, `publishedAt` (ISO 8601), and `body` (a list of paragraphs).

Inside `body`, mark each sentence that states a fact like this:

```text
[f03: It ships with 24 GB of GDDR7 memory.]
```

The marker says which fact the sentence states. The brackets and fact ID are removed when the article is published, so the sentence appears in the article exactly as written. Sentences without a marker must not state a new fact. Use them only for opinions and transitions.

## Feeds

`npm run sample:build` publishes the story files as Atom feeds in `public/sample-feeds/`, one per outlet. The app reads those feeds with the same parser it uses for real feeds, then attaches the facts from the story files. A test fails if the feeds are out of date or if a marked sentence doesn't appear verbatim in the parsed article.

## Writing new stories

Follow [WRITING.md](WRITING.md). `npm run sample:check -- <story files>` validates stories without writing anything, and prints what each outlet adds once a story is opened.
