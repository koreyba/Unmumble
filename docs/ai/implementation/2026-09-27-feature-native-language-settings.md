---
phase: implementation
title: Native language Settings implementation
description: Code map and boundaries
---

# Native language Settings implementation

## Code map

- `drizzle/0026_native_language.sql`, `db/schema.ts`: per-user preference and Russian default.
- `lib/native-language.ts`: scoped D1 read/write.
- `lib/deepl.ts`: key resolution, stable target-language lookup, and per-request target selection.
- `app/api/settings/native-language/route.ts`: authenticated read/write and provider-backed validation.
- `app/components/native-language-combobox.tsx`, `app/integrations/page.tsx`, `app/globals.css`: Settings picker, save status, and styling.
- `app/api/translate/route.ts`, `app/api/phrases/route.ts`: reuse the shared translator.

## Boundaries and failure handling

The API key remains in an encrypted personal integration or Worker secret. The client receives only language names/codes and the choice. PUT rejects cross-origin and invalid selections. With no key, GET returns an empty list; provider errors do not update the preference. Guests remain on Russian.

New translations use the choice. Existing phrase meanings are not modified on change. AI Chat explanation language and Tatoeba translation remain independent.
