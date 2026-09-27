---
phase: deployment
title: Native language Settings release
description: Migration order and preview validation
---

# Native language Settings release

## Pipeline and configuration

The application runs as a Cloudflare Worker with D1. PR source checks and Worker preview deployment are separate. This change uses the existing personal or shared DeepL API key; no new secret is required.

## Release order

1. Confirm exact PR head and terminal source checks.
2. Apply `drizzle/0026_native_language.sql` to the target D1 before deploying the Worker. The preview wrapper applies migrations; production instructions in `README.md` require an explicit remote migration step.
3. Deploy the matching Worker and confirm its active version and D1 target.
4. On preview, sign in, choose a language, reload to confirm persistence, and translate an English phrase. Confirm another account still defaults to Russian.

## Rollback and proof boundary

The column is additive. Rolling back application code restores fixed Russian behavior; leave the column in place. Local tests and a green PR prove source readiness. Migration, active Worker identity, authenticated UI, and a real DeepL response require separate deployment receipts. Deployment is outside this PR preparation task.
