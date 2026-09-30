# Project skills

## Product video

Use `$product-video` to request an advertising script or a complete video. The
repository owns `.agents/skills/product-video/`, including its presets,
references, capture helpers, and marketing workflow. Edit this copy on a branch.
It was imported from the local skill updated on 2026-09-30, including the new
portable recording helpers. Historical machine paths in its references are
examples to recheck, not bundled tools or required project locations.

The workflow reads or prepares `.agents/product-marketing.md`, uses `ad-creative`
for the concept, applies `copy-editing`, then produces the video. A request for a
script stops at the scene table. Voice, titles, capture audio, music, language,
and publication remain controlled by the request and brief.

## Upstream marketing skills

Source: <https://github.com/coreyhaines31/marketingskills> (MIT).
`.agents/vendor/marketingskills` is a Git submodule, pinned by the parent commit.
Only `product-marketing`, `ad-creative`, and `copy-editing` have discovery links
under `.agents/skills/`. Those relative symlinks work in another checkout; the
upstream files are not copied or edited in this repository. The complete upstream
checkout keeps their internal references intact.

After cloning or switching to this branch, initialize the dependency:

```sh
git submodule update --init .agents/vendor/marketingskills
```

To update, review the upstream changes and commit the new submodule pointer:

```sh
git submodule update --remote .agents/vendor/marketingskills
git diff --submodule=log
git add .agents/vendor/marketingskills
git commit -m "chore(skills): update upstream marketing skills"
```

Keep project preferences and orchestration in `product-video`, so upstream
updates do not overwrite our work. Avoid keeping a separate global copy of the
same skill when using the project copy.

## Other external tools

The existing `.ai-devkit.json` records the official `cloudflare/skills`
dependencies needed for this Workers/D1 project. Recreate their ignored local
links with AI DevKit; do not commit absolute machine-specific symlinks:

```sh
ai-devkit skill add cloudflare/skills cloudflare
ai-devkit skill add cloudflare/skills workers-best-practices
ai-devkit skill add cloudflare/skills wrangler
```

Graphify is optional codebase analysis, independent of video production.
Source: <https://github.com/Graphify-Labs/graphify>; package: `graphifyy`.
Install from upstream when needed, rather than maintaining a copied skill here:

```sh
uv tool install graphifyy
graphify install --project --platform codex
```

Its generated skill, rules, workflows, and `graphify-out/` are ignored. The old
project rule requiring a graph update after every code edit is not retained.
Qodana downloads and extracted reports are also local artifacts; ESLint and Git
ignore them.
