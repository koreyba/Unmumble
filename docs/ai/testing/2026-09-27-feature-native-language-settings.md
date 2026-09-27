---
phase: testing
title: Native language Settings verification
description: Behavioral checks and external evidence boundary
---

# Native language Settings verification

## Scenarios

- [x] Migration gives accounts Russian by default; changing one leaves another unchanged. Full SQL chain in `tests/native-language-settings.test.mjs`.
- [x] Capability list keeps stable target languages; PUT rejects unsupported and malformed values. Controlled DeepL boundary in the same test.
- [x] Translation uses the saved target and server-side key; default-key fallback remains intact. `tests/native-language-settings.test.mjs`, `tests/default-deepl-key.test.mjs`.
- [x] Search by code and keyboard selection work. `tests/native-language-combobox.test.mjs`.
- [x] Settings loads, filters, saves, and displays the choice on desktop/mobile Chromium. `tests/e2e/native-language-settings.spec.ts` uses mocked APIs.
- [x] Removing the only DeepL key clears stale picker options. The same browser suite covers this on desktop/mobile.
- [x] Adjacent phrase, chat selection, migration, and rendered contracts pass targeted Node suites.
- [ ] A deployed preview with migrated D1 and a real DeepL key returns a translation in the saved language. This is deployment evidence.

## Verification commands

- `npm run build`
- `node --test tests/native-language-settings.test.mjs tests/native-language-combobox.test.mjs tests/default-deepl-key.test.mjs tests/phrases-route-compatibility.test.mjs tests/ai-chat-selection-actions.test.mjs tests/ai-chat-migration.test.mjs tests/rendered-html.test.mjs`
- `./node_modules/.bin/tsc --noEmit --incremental false`
- `./node_modules/.bin/eslint` on changed TypeScript files
- `./node_modules/.bin/playwright test tests/e2e/native-language-settings.spec.ts`

The provider and browser tests use mocks. No percentage coverage claim is made; this repository's gate uses behavior suites.
