# Requirements: Comparison pipeline

## Introduction

The comparison pipeline turns a cluster of articles about the same event into the "what each source adds" panel. It extracts facts with their supporting sentences and matches facts across the cluster's articles. The browser then works out what each unread source adds compared with what the user has already read.

This is the riskiest part of Reader Resurrection, so it gets its own spec. The decisions behind it are recorded in `grill-me-session.md`, and the work is tracked in GitHub issues.

## Glossary

- **Cluster:** articles from different sources about the same event.
- **Primary article:** the article a cluster opens on. It counts as read once the cluster is opened.
- **Fact:** one atomic, checkable statement, such as "Draws 320 W under load".
- **Evidence sentence:** the exact sentence in an article that states a fact.
- **Seen facts:** the facts in the primary article and in every other article the user has read in the cluster.
- **Adds:** the facts in a source that are not seen facts.
- **Duplicate score:** the share of a source's facts that are seen facts.
- **Fact table:** a hand-written list of facts and evidence sentences for a sample cluster. It is the answer key for the accuracy check.

## Requirements

### Requirement 1: Facts with evidence

**User story:** As a reporter, I want every fact to come with the sentence that states it, so that I can check it before I quote it.

#### Acceptance criteria

1. WHEN the pipeline processes an article THE SYSTEM SHALL extract atomic facts, each with one evidence sentence copied from the article.
2. WHEN an evidence sentence does not appear verbatim in the article text THE SYSTEM SHALL drop that fact.
3. WHEN an article has no facts THE SYSTEM SHALL show "Limited source content" for that source instead of a duplicate score.

### Requirement 2: Full text for excerpt-only feeds

**User story:** As a reporter, I want comparisons to use whole articles, so that a short feed excerpt doesn't hide what a source adds.

#### Acceptance criteria

1. WHEN a feed entry carries only an excerpt THE SYSTEM SHALL fetch the article page and extract its main text.
2. IF text extraction fails THEN THE SYSTEM SHALL label the source "Limited source content".
3. THE SYSTEM SHALL NOT write real publisher article text to the repository.

### Requirement 3: Matching facts across a cluster

**User story:** As a reporter, I want the same fact in different words to count once, so that a source isn't credited for repeating something I've read.

#### Acceptance criteria

1. WHEN two articles in a cluster state the same fact in different words THE SYSTEM SHALL give both the same fact ID.
2. WHEN two statements differ in any number, date, or name THE SYSTEM SHALL treat them as different facts.

### Requirement 4: What each source adds

**User story:** As a reporter on deadline, I want to see what each source would add before I open it, so that I only read the ones with something new.

#### Acceptance criteria

1. WHEN the user opens a cluster THE SYSTEM SHALL mark its primary article as read.
2. WHILE a source is unread THE SYSTEM SHALL list the facts it adds as "+" lines.
3. WHEN the user reads an article THE SYSTEM SHALL remove that article's facts from every other source's list.
4. WHEN an unread source adds no facts THE SYSTEM SHALL show "No significant new information".
5. WHEN two unread sources share a fact the user hasn't seen THE SYSTEM SHALL list it under both.
6. THE SYSTEM SHALL compute these lists in the browser from saved facts, without calling an AI model.

### Requirement 5: Duplicate score

**User story:** As a reporter, I want to know how much of a source repeats what I've read, so that I can skip it with confidence.

#### Acceptance criteria

1. WHILE a source is unread and has facts THE SYSTEM SHALL show the share of its facts that are seen facts.
2. THE SYSTEM SHALL compute the duplicate score from the same comparison as the "+" lines, so that the score and the list always account for all of the source's facts.

### Requirement 6: Evidence highlighting

**User story:** As a reporter, I want the new sentences highlighted in the article, so that I can verify a "+" line in seconds.

#### Acceptance criteria

1. WHEN the user opens a source THE SYSTEM SHALL highlight the evidence sentences for the facts that were new to the user when they first opened it.
2. WHEN the user selects a "+" line THE SYSTEM SHALL open that source and scroll to the evidence sentence.

### Requirement 7: Cluster read state

**User story:** As a reader, I want a cluster to count as read once nothing new is left, so that unread counts only show stories worth my time.

#### Acceptance criteria

1. WHILE nothing in a cluster has been read THE SYSTEM SHALL show the cluster as unread.
2. WHILE any unread source in an opened cluster still adds a fact THE SYSTEM SHALL show the cluster as partly read.
3. WHEN no unread source in an opened cluster adds a fact THE SYSTEM SHALL show the cluster as read.

### Requirement 8: Correcting a wrong cluster

**User story:** As a reader, I want to pull a wrongly grouped article out of a cluster, so that one clustering mistake doesn't spoil the comparison.

#### Acceptance criteria

1. WHEN the user presses X on an article in a cluster with more than one article THE SYSTEM SHALL move that article into its own cluster and recompute every list in the original cluster.
2. IF the moved article was the primary article THEN THE SYSTEM SHALL make the earliest remaining article the primary article.

### Requirement 9: Accuracy check

**User story:** As the team, we want the pipeline checked against an answer key on every change, so that a regression never reaches the demo.

#### Acceptance criteria

1. WHEN pipeline code changes THE SYSTEM SHALL compare the pipeline's output for the sample clusters with their fact tables.
2. THE SYSTEM SHALL count a "+" line as right only if its evidence sentence states the fact and the primary article does not.
3. IF fewer than 8 of every 10 "+" lines are right THEN THE SYSTEM SHALL fail the check.

### Requirement 10: Sample data

**User story:** As the team, we want a starter pack we're allowed to publish, so that the repo and the video break no content rules.

#### Acceptance criteria

1. THE SYSTEM SHALL label the starter pack as sample data.
2. THE SYSTEM SHALL use only fictional outlets, companies, products, and events in the starter pack.
3. WHEN serving the starter pack THE SYSTEM SHALL use saved results and make no AI calls.

### Requirement 11: Live comparisons

**User story:** As a reporter adding my own feeds, I want to keep reading while a comparison runs or fails, so that the AI never blocks the reader.

#### Acceptance criteria

1. WHILE a live comparison is running THE SYSTEM SHALL show the articles and "Comparing N sources…" in the panel.
2. IF the AI API fails THEN THE SYSTEM SHALL show "Comparison unavailable" and keep the articles readable.
