---
phase: requirements
title: Native language for DeepL translations
description: Choose a DeepL target language on Settings
---

# Native language for DeepL translations

## Problem

DeepL requests fix English as source and Russian as target. A learner cannot change the target without a code change.

## Goals and user stories

- A signed-in learner can search and select a stable DeepL text-translation target on Settings.
- The choice persists per account and applies to subsequent DeepL phrase and selected-text translations.
- Existing accounts and guests default to Russian. Existing saved translations are not rewritten.
- The picker works by pointer and keyboard on desktop and mobile. The API key stays server-side.

## Scope and assumptions

- English remains the source language; English target variants are excluded for this English-learning product.
- Native Language controls DeepL output only. Tatoeba translation data and AI Chat explanation language are separate.
- A working personal or shared DeepL key is needed to list languages. An unavailable list disables selection without losing the saved choice.

## Acceptance criteria

1. Search narrows options by name or code; pointer and keyboard selection work.
2. GET returns the account choice and stable usable targets; PUT rejects unsupported values and cross-origin requests.
3. The saved choice affects the next authenticated DeepL request without changing another account or exposing the key.
4. An additive migration defaults existing accounts to Russian and runs before the new code is deployed.
5. Build, typecheck, lint, relevant Node tests, and desktop/mobile browser journey pass on the final PR head.

## Open items

None for source scope. A real DeepL call and deployed preview smoke remain separate release evidence.
