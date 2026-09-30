# Unmumble UI kit

One visual language for the React app **and** the static Trainer (`public/trainer.html`).
Light and dark themes, mobile-first, minimal motion that respects `prefers-reduced-motion`.

## Layers

| Layer | Files | Owns |
| --- | --- | --- |
| Tokens + base | `public/app-theme.css` | Colours (both themes), radii, control sizes, easing/durations, shadows, focus ring, `[hidden]`, reduced-motion reset |
| Component CSS | `public/ui.css` | `.ui-button`, `.ui-chip`, `.ui-badge`, `.ui-card`, form controls, `.ui-notice`, `.ui-empty`, `.ui-skeleton`, `.ui-sheet*`, `.ui-help*` |
| Component API (React) | `app/components/ui/*` (import from `@/app/components/ui`) | Typed wrappers that emit the `ui-*` classes and add behaviour (sheet focus/Escape, popover dismissal, loading state) |
| Shared chrome | `public/site-navigation.css`, `public/feedback-widget.css` | Navigation bar / mobile tab bar, feedback widget |
| Surface styles | `app/styles/*.css` (composed in `app/globals.css`) | Layout only: landing, workspace (Library/Practice), pages, settings, videos, chat |

`public/*.css` is loaded by both the Next app (`@import` in `globals.css`) and the Trainer
(`<link>` order: `app-theme` → `ui` → `site-navigation` → `feedback-widget`). Later files may
refine earlier ones, never the other way round.

## Rules

1. **Tokens, not values.** No hex/rgb literals in kit or surface CSS; use `--color-*`, `--radius-*`,
   `--control-*`, `--duration-*`, `--ease-*`. New colours go into *both* palettes in `app-theme.css`
   and must pass `tests/app-theme.test.mjs` (WCAG AA).
2. **Buttons come from the kit.** `<Button>`, `<IconButton label=…>`, `<ButtonLink>`; or the
   `ui-button` classes in static HTML. Variants: `primary` (the main action on a screen), default
   secondary, `soft` (selected/tinted), `ghost`, `danger`, `brand` (marketing). `quietDanger` keeps a
   neutral button until hover/focus (Remove, Sign out). `collapse` turns a labelled button into a
   square icon button on phones while keeping the label for assistive tech.
3. **One primary per view.** Everything else is secondary/soft/ghost.
4. **Touch first.** Controls are ≥44px on phones (`--control-md`; `sm` grows to 44px on coarse pointers).
5. **Overlays own their behaviour.** Use `BottomSheet` / `InfoPopover`; they handle Escape, outside
   press, focus return, scroll lock. `BottomSheet` is portalled to `<body>`.
6. **Never fill a transform animation on a container.** Entrance animations use
   `animation-fill-mode: backwards`; a filled transform makes the element the containing block of
   `position: fixed` descendants (this once detached the mobile sheets from the screen).
7. **`!important` is for visibility utilities only** (`.mobile-only`, `.desktop-only`, `[hidden]`) and the
   reduced-motion override.
8. **Responsive visibility:** `.mobile-only` / `.desktop-only` (breakpoint 768px) hide, they don't set
   `display`; elements keep their natural layout.

## Adding a component

1. Style it in `public/ui.css` using tokens (light/dark come for free).
2. Add a typed wrapper in `app/components/ui/` and export it from `index.ts`.
3. Extend `tests/ui-kit.test.mjs` if it introduces a new invariant; behavioural coverage lives in
   `tests/e2e/*.spec.ts` (Playwright, desktop + mobile projects).

## Verifying visually

`node --test tests/*.test.mjs` covers structure/tokens/contrast of the palette. For rendered checks run the
dev server and use Playwright to screenshot `/`, `/library`, `/practice`, `/videos`, `/settings`, `/chat`,
`/trainer?phrase=tell%20him` at 390px and 1360px in both themes, and scan computed text/background pairs for
WCAG AA (≥4.5:1, ≥3:1 for large text).
