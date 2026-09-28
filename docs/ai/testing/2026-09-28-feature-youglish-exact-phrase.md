---
phase: testing
title: Exact YouGlish Phrase Search Testing
---

# Exact YouGlish Phrase Search Testing

## Browser Contract

- [x] All mode sends quoted `it was there`, `of in my life`, a single word, and an apostrophe-containing phrase without `:r`.
- [x] Accent remains the widget argument; saved and Full Video Mode retain video-specific queries in adjacent regression tests.
- [x] A loose marked caption is skipped only once, while a following exact caption is rendered.
- [x] Punctuation interrupting an unpunctuated phrase is rejected; punctuation present in the selected phrase is accepted.
- [x] A last loose candidate pauses and shows no-exact-results feedback.
- [x] Run final focused and full tests, lint, and build after the last source change.

Final verification after rebasing onto the latest `origin/main`: `npm test` passed (729 Node tests and 2 Worker tests; includes a fresh build). `npm run lint`, `npx --yes ai-devkit@latest lint --feature youglish-exact-phrase` (16 checks), and `git diff --check` passed.

## Provider Evidence

Direct unquoted search ranked exact examples first for the reported phrases; random unquoted search surfaced loose examples. Quoted direct search narrowed the provider count. This is live site evidence, separate from the mocked widget tests.

## Deferred Audit

The user will check the default Library phrases. The attempted automated provider audit encountered a `Bot detection!` response before it could verify the catalog; no absence conclusion was drawn.
