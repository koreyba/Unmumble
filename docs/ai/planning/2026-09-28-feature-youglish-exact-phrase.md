---
phase: planning
title: Exact YouGlish Phrase Search Plan
---

# Exact YouGlish Phrase Search Plan

## Milestones and Tasks

- [x] Compare direct and random YouGlish results for the two reported phrases.
- [x] Add a failing widget-call contract for quoted, direct search.
- [x] Change All-mode query construction and status text.
- [x] Add failing caption callback tests, then reject loose candidates and handle the final candidate.
- [x] Run final focused and full verification, inspect the diff, and record evidence.

## Scope Change

The user deferred the catalog-wide search audit and will check Library phrases personally. No zero-result list is claimed here.

## Risks

A provider clip starts before its caption callback arrives. A real match split across captions may be rejected. Browser smoke after deployment is needed to observe provider timing.
