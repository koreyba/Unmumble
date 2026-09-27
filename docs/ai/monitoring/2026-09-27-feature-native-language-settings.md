---
phase: monitoring
title: Native language Settings monitoring
description: Runtime signals after release
---

# Native language Settings monitoring

## Signals and response

- Watch `Native language GET failed`, `Native language list failed`, `Native language PUT failed`, and existing DeepL translation errors after deployment.
- Separate D1 schema errors from DeepL key/provider failures. A missing `native_language` column indicates migration order.
- During preview smoke, confirm the saved choice after reload and one real translation. Never log API keys, request text, or full user content.
- If errors rise, inspect exact Worker version, D1 migration status, and DeepL response category before changing code. Optional translation must not block phrase progression. A code rollback can leave the additive column in place.
