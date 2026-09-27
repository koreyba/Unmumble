---
phase: planning
title: Native language Settings plan
description: Ordered tasks and evidence
---

# Native language Settings plan

## Milestones and tasks

- [x] Define DeepL-only scope, account default, and existing translation behavior. Evidence: requirements and design.
- [x] Add D1 migration and authenticated GET/PUT with DeepL target validation. Evidence: native-language settings test.
- [x] Pass the saved target through the shared translator and all in-repo callers. Evidence: translation and phrase compatibility tests.
- [x] Add searchable Settings combobox with keyboard and responsive behavior. Evidence: component and desktop/mobile Playwright tests.
- [x] Update adjacent contracts and run local build, typecheck, lint, and relevant tests. Evidence: testing document.
- [ ] Complete final code review, commit, PR, and exact-head remote checks. Evidence: review result, SHA, PR URL, terminal checks.

## Dependencies and risks

Apply migration `0026_native_language.sql` before deploying code that reads the column. Language availability depends on a working DeepL key and response. Existing translations stay as saved. No new secret or package is required.

## Next action

Review the final diff and deployment contract, then publish a PR and wait for terminal review and checks on its final head.
