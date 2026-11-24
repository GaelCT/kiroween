# Implementation plan: Comparison pipeline

Each task links to its GitHub issue on GaelCT/kiroween.

- [x] 1. Sample data for one cluster
- [x] 1.1 Write the fact table for the fictional Corvid RV-90 launch
  - `data/sample/stories/corvid-rv90.json`, with a fact shared by two non-primary sources and a source that ends up adding nothing
  - Issue #5
  - _Requirements: 9.1, 10.2_
- [x] 1.2 Write four fictional outlets' articles from the fact table as Atom feeds
  - `public/sample-feeds/*.xml`, every evidence sentence copied verbatim into its article
  - Issue #6
  - _Requirements: 10.1, 10.2_
- [x] 1.3 Parse the feeds and load the sample cluster
  - Same `parseFeed` that will read real feeds. The loader throws when an evidence sentence isn't in its article.
  - Issue #6
  - _Requirements: 1.2, 10.3_

- [x] 2. Comparison in the browser
- [x] 2.1 Implement adds, duplicate score, highlights, and cluster state in `src/lib/adds.ts`
  - Unit tests for the worked example in `design.md`
  - Issue #7
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 6.1, 7.1, 7.2, 7.3_
- [x] 2.2 Write property tests P1 to P8
  - Issue #8
  - _Requirements: 4.1, 4.2, 4.3, 4.5, 5.2, 7.1, 7.2, 7.3_
- [x] 2.3 Pull an article out of its cluster (X)
  - Issue #9
  - _Requirements: 8.1, 8.2_

- [x] 3. Skeleton screen
- [x] 3.1 Show one cluster with the primary article and the side panel
  - "+" lines, duplicate scores, "No significant new information", highlighted sentences, and "+" lines that jump to their sentence
  - Issue #9
  - _Requirements: 4.2, 4.4, 5.1, 6.1, 6.2, 10.1_
- [x] 3.2 Keyboard and reading history
  - J/K, N/P, and X. Reading history in localStorage, with a reset control.
  - Issue #9
  - _Requirements: 4.1, 8.1_

- [x] 4. AI pipeline
- [x] 4.1 Choose the AI provider and read the key from an environment variable
  - Issue #10. OpenRouter, set with `AI_PROVIDER`, `AI_MODEL`, and `OPENROUTER_API_KEY` in `.env.local`.
- [x] 4.2 Extract facts with evidence sentences, and drop facts without a verbatim match
  - Issue #11. `src/pipeline/facts.ts`. The first real run on the starter pack got 223 of 238 lines right.
  - _Requirements: 1.1, 1.2_
- [x] 4.3 Match facts across a cluster
  - Issues #11 and #16. Matching, then a check of every leftover statement against the primary article's full text. The starter pack now gets 227 of 227 lines right.
  - _Requirements: 3.1, 3.2_
- [x] 4.4 Fetch and extract full text for excerpt-only feeds
  - Issue #12. `src/pipeline/fulltext.ts`, checked on four real tech feeds.
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 4.5 Accuracy check against the fact tables, run by an agent hook
  - Issue #14. `npm run accuracy` and `.kiro/hooks/pipeline-accuracy-check.json`. Seen firing on its own when Kiro saved a pipeline file. Its latest real run scored 29 of 29.
  - _Requirements: 9.1, 9.2, 9.3_
- [x] 4.6 Day-3 test on three real stories, due Thursday, Nov 19
  - Issue #13. Run on Nov 23: 26 of 31 lines right (84%), checked line by line by Kiro.
  - _Requirements: 9.2, 9.3_
- [x] 4.7 Story clustering
  - Issue #15. `src/pipeline/cluster.ts` matches all 34 starter-pack stories (`npm run sample:cluster`).

- [x] 5. Live comparisons
- [x] 5.1 "Comparing N sources…" and "Comparison unavailable" states
  - Issue #19
  - _Requirements: 11.1, 11.2_
- [x] 5.2 Add Feed runs the pipeline on the server
  - Issue #20. `/api/feeds`, `/api/stories`, and `/api/compare`, with a per-visitor cap. Checked on Nov 23 with real feeds and the real key, in a browser and on a production server.
  - _Requirements: 2.1, 2.2, 2.3, 11.1, 11.2_
