---
phase: requirements
title: Exact YouGlish Phrase Search
---

# Exact YouGlish Phrase Search

## Problem Statement

The trainer sent a multiword phrase to YouGlish without quotes and with `:r`. Results could contain its words apart from each other, so learners heard unrelated speech. `it was there` and `of in my life` reproduced the issue.

## Goals & Objectives

- In YouGlish All mode, request the selected phrase as one exact, direct search.
- Do not present a caption whose marked search words fail to form the selected phrase in sequence.
- Preserve accent choice, single-word search, saved clips, Full Video Mode, and Tatoeba behavior.
- Give clear no-results feedback when the remaining provider candidates are not exact.

## User Stories & Use Cases

- A learner opens a Library phrase and hears a clip with that phrase in order.
- A learner can skip past a loose provider match automatically.
- A learner can still return to saved clips and continuous video playback.

## Success Criteria

- All mode calls `widget.fetch('"it was there"', 'english', accent)` without `:r`.
- A marked caption with separated words is skipped once; an exact caption is shown.
- A last invalid candidate pauses and shows the no-exact-results state.
- Relevant tests, lint, and build pass.

## Constraints & Assumptions

- The YouGlish Widget API owns candidate retrieval. Exactness can be verified only after it supplies a caption; an invalid clip may briefly begin playing before it is rejected.
- Captions split across provider events can be rejected, even if the spoken phrase spans that boundary.
- Catalog-wide availability checking was explicitly deferred by the user.

## Questions & Open Items

- None blocking this change. Live provider behavior should be checked in the user's browser after review.
