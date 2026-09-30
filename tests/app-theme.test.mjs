import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readGlobalStyles } from "./helpers/styles.mjs";

test("the shared app theme owns the Forest and Clay grid backdrop", async () => {
  const theme = await readFile(new URL("../public/app-theme.css", import.meta.url), "utf8");

  assert.match(theme, /--color-brand: #b7c9aa/);
  assert.match(theme, /--color-brand-secondary: #dd9876/);
  assert.match(theme, /--color-grid: rgba\(255, 255, 255, \.025\)/);
  assert.match(theme, /--app-grid-size: 76px/);
  assert.match(theme, /linear-gradient\(var\(--app-grid-line\) 1px, transparent 1px\)/);
  assert.match(theme, /radial-gradient\(circle at 72% 42%, var\(--color-ambient-clay\), transparent 25rem\)/);
  assert.match(theme, /radial-gradient\(circle at 24% 72%, var\(--color-ambient-sage\), transparent 28rem\)/);
  assert.match(theme, /background-attachment: fixed/);
});

test("every application surface loads the shared app theme", async () => {
  const [globals, trainer] = await Promise.all([
    readGlobalStyles(),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
  ]);

  assert.match(globals, /@import "\.\.\/public\/app-theme\.css"/);
  assert.match(trainer, /<link rel="stylesheet" href="\/app-theme\.css" \/>/);
});

test("page styles consume the shared theme instead of redefining it", async () => {
  const globals = await readGlobalStyles();

  assert.doesNotMatch(globals, /--bg: #/);
  assert.doesNotMatch(globals, /rgba\(75, 153, 190, \.14\)/);
  assert.match(globals, /--landing-lime: var\(--app-sage\)/);
  assert.match(globals, /--landing-blue: var\(--app-clay\)/);
  assert.match(globals, /\.landing-page \{[^}]*background: transparent;/s);
});

test("navigation and content cards use the shared surface tokens", async () => {
  const [globals, navigation, kit] = await Promise.all([
    readGlobalStyles(),
    readFile(new URL("../public/site-navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../public/ui.css", import.meta.url), "utf8"),
  ]);

  // Every content card is one shared Card that paints the themed card surface.
  assert.match(kit, /\.ui-card \{[^}]*background: var\(--color-card-background\)/s);
  assert.match(kit, /\.ui-card \{[^}]*border: 1px solid var\(--color-border\)/s);
  assert.match(navigation, /\.site-navigation \{[^}]*background: var\(--app-nav-background\)/s);
  assert.doesNotMatch(`${globals}\n${navigation}\n${kit}`, /#3f7d96|#c8efff|#79d6ff/i);
});

test("Library controls distinguish blue interaction from clay analysis data", async () => {
  const [globals, kit] = await Promise.all([
    readGlobalStyles(),
    readFile(new URL("../public/ui.css", import.meta.url), "utf8"),
  ]);

  // Blue means "you can act here / this is selected".
  assert.match(globals, /\.filter-option\.is-active \{[^}]*background: var\(--color-interactive-soft\)/s);
  assert.match(globals, /\.filter-check\.is-checked \{[^}]*background: var\(--color-interactive-solid\)/s);
  assert.match(globals, /\.practice-tab\.is-active \{[^}]*border-color: var\(--color-interactive-border\);[^}]*background: var\(--color-interactive-soft\);[^}]*box-shadow: var\(--shadow-soft\)/s);
  assert.match(kit, /\.ui-button--primary \{[^}]*--ui-bg: var\(--color-interactive-surface\);[^}]*--ui-fg: var\(--color-on-interactive\)/s);
  assert.match(kit, /\.ui-chip\.is-active[^{]*\{[^}]*border-color: var\(--color-interactive-border\);[^}]*background: var\(--color-interactive-soft\)/s);

  // Clay means "analysis data": mechanism names, tags and the "all mechanisms" row.
  assert.match(globals, /\.catalog-group__title \{[^}]*color: var\(--color-brand-secondary\)/s);
  assert.match(globals, /\.filter-option--all\.is-active \{[^}]*background: var\(--color-tag-background\);[^}]*color: var\(--color-tag-text\)/s);
  assert.match(kit, /\.ui-badge--clay \{[^}]*--ui-badge-bg: var\(--color-tag-background\);[^}]*--ui-badge-fg: var\(--color-tag-text\);[^}]*--ui-badge-border: var\(--color-tag-border\)/s);
  assert.match(globals, /\.phrase-row__ipa \{[^}]*color: var\(--app-phonetic\)/s);

  // Neutral and destructive actions come from the secondary and danger tokens.
  assert.match(kit, /\.ui-button \{[^}]*--ui-bg: var\(--color-action-secondary-background\);[^}]*--ui-fg: var\(--color-action-secondary-text\)/s);
  assert.match(kit, /\.ui-button--danger \{[^}]*--ui-bg: var\(--color-danger-background\);[^}]*--ui-fg: var\(--color-danger\)/s);

  // Small screens keep the queue chips on one scrollable line.
  assert.match(globals, /\.practice-chips \{[^}]*overflow-x: auto;[^}]*scrollbar-width: none;/s);
  assert.match(globals, /\.practice-chips::-webkit-scrollbar \{ display: none; \}/);
});

test("Practice queue counts keep their shape for two and three digit values", async () => {
  const globals = await readGlobalStyles();

  assert.match(globals, /\.practice-tab__count \{[^}]*display: grid;[^}]*min-width: 40px;[^}]*height: 40px;[^}]*padding: 0 8px;[^}]*place-items: center;[^}]*border-radius: var\(--radius-pill\);/s);
});

test("Library keeps Practice compact and Add to Learn secondary", async () => {
  const row = await readFile(new URL("../app/components/workspace/phrase-row.tsx", import.meta.url), "utf8");

  // The trainer shortcut is a small round icon button; adding is the neutral secondary button.
  assert.match(row, /<IconButton[\s\S]*?label="Open in trainer"[\s\S]*?pill[\s\S]*?size="sm"/);
  const addButton = row.match(/<Button\s+collapse[\s\S]*?>\s*Add to Learn\s*<\/Button>/)?.[0] ?? "";
  assert.ok(addButton, "Add to Learn button must exist");
  assert.doesNotMatch(addButton, /variant=/, "Add to Learn stays the default secondary style");
  assert.match(addButton, /size="sm"/);
});

test("interface typography stays readable while landing headings keep their display face", async () => {
  const [theme, globals, navigation] = await Promise.all([
    readFile(new URL("../public/app-theme.css", import.meta.url), "utf8"),
    readGlobalStyles(),
    readFile(new URL("../public/site-navigation.css", import.meta.url), "utf8"),
  ]);

  assert.match(theme, /--app-ui-font: Inter, ui-sans-serif, system-ui/);
  assert.match(theme, /--app-display-font: "Avenir Next", Avenir/);
  assert.match(theme, /body \{[^}]*font-family: var\(--app-ui-font\)/s);
  assert.match(globals, /--landing-display-font: var\(--app-display-font\)/);
  assert.match(navigation, /\.site-primary-link \{[^}]*font-weight: 700/s);
});

test("interface titles stay neutral while blue marks active navigation", async () => {
  const [theme, navigation] = await Promise.all([
    readFile(new URL("../public/app-theme.css", import.meta.url), "utf8"),
    readFile(new URL("../public/site-navigation.css", import.meta.url), "utf8"),
  ]);

  assert.match(theme, /--color-text-primary: #f3f5f2/);
  assert.match(theme, /--color-text-secondary: #b5bec8/);
  assert.match(navigation, /\.site-brand\[aria-current="page"\] \{ color: var\(--text\); \}/);
  assert.match(navigation, /\.site-primary-link\[aria-current="page"\] \{[^}]*border: 1px solid var\(--color-interactive-border\);[^}]*background: var\(--color-interactive-soft\);[^}]*color: var\(--text\)/s);
  assert.match(navigation, /\.site-account-link:hover \{[^}]*color: var\(--text\)/s);
});

function toRgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function luminance(hex) {
  const channels = toRgb(hex).map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return (channels[0] * 0.2126) + (channels[1] * 0.7152) + (channels[2] * 0.0722);
}

function contrast(foreground, background) {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

function paletteBlock(css, theme) {
  const selector = theme === "dark"
    ? /:root,\s*:root\[data-theme="dark"\] \{(?<tokens>[\s\S]*?)\n\}/
    : /:root\[data-theme="light"\] \{(?<tokens>[\s\S]*?)\n\}/;
  const match = css.match(selector);
  assert.ok(match?.groups?.tokens, `${theme} palette is missing`);
  return match.groups.tokens;
}

function token(block, name) {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `${name} is missing`);
  return match[1];
}

function gradientStops(block, name) {
  const match = block.match(new RegExp(`--${name}:\\s*linear-gradient\\([^;]*?(#[0-9a-f]{6})[^;]*?(#[0-9a-f]{6})\\)`, "i"));
  assert.ok(match, `${name} gradient is missing`);
  return match.slice(1);
}

test("light and dark semantic palettes keep readable text and actions", async () => {
  const css = await readFile(new URL("../public/app-theme.css", import.meta.url), "utf8");

  for (const theme of ["dark", "light"]) {
    const block = paletteBlock(css, theme);
    const surface = token(block, "color-surface");
    for (const name of [
      "color-text-primary",
      "color-text-secondary",
      "color-text-tertiary",
      "color-card-title",
      "color-brand",
      "color-brand-secondary",
      "color-interactive",
      "color-phonetic",
      "color-success",
      "color-danger",
    ]) {
      assert.ok(contrast(token(block, name), surface) >= 4.5, `${theme} ${name} must meet WCAG AA`);
    }
    assert.ok(
      contrast(token(block, "color-on-brand"), token(block, "color-brand-solid")) >= 4.5,
      `${theme} primary action must meet WCAG AA`,
    );
    assert.ok(
      contrast(token(block, "color-on-interactive"), token(block, "color-interactive-solid")) >= 4.5,
      `${theme} interactive action must meet WCAG AA`,
    );
    for (const stop of gradientStops(block, "color-interactive-surface")) {
      assert.ok(
        contrast(token(block, "color-on-interactive"), stop) >= 4.5,
        `${theme} interactive gradient must meet WCAG AA across the full surface`,
      );
    }
    assert.ok(
      contrast(token(block, "color-control-border"), token(block, "color-control-background")) >= 3,
      `${theme} control boundaries must meet WCAG non-text contrast`,
    );
  }
});

test("the theme controller loads before content and every navigation exposes its toggle", async () => {
  const [layout, navigation, trainer] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/site-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /import Script from "next\/script"/);
  assert.match(layout, /<head>[\s\S]*?<Script src="\/theme-controller\.js" strategy="beforeInteractive" \/>[\s\S]*?<\/head>/);
  assert.match(layout, /<meta name="theme-color" content="#0d1116" \/>/);
  assert.match(layout, /<html lang="en" suppressHydrationWarning>/);
  assert.match(navigation, /data-theme-toggle/);
  assert.match(navigation, /suppressHydrationWarning/);
  assert.match(trainer, /data-theme-toggle/);
  assert.match(trainer, /<meta name="color-scheme" content="light dark" \/>/);
  assert.match(trainer, /<meta name="theme-color" content="#0d1116" \/>/);
  assert.doesNotMatch(trainer, /--bg:\s*#/);
});

test("application and Trainer components consume semantic tokens instead of hard-coded palettes", async () => {
  const [globals, trainer] = await Promise.all([
    readGlobalStyles(),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
  ]);
  const componentStyles = `${globals}\n${trainer}`;

  assert.doesNotMatch(componentStyles, /#38bdf8|#7dd3fc|#b6e8ff|rgba\(125,\s*211,\s*252/i);
  assert.doesNotMatch(globals, /#12171c|#251b17|#151512|#26171b|#13251f/i);
  assert.match(globals, /\.landing-method \{[^}]*background: var\(--color-method-surface\);[^}]*color: var\(--color-method-text\)/s);
  assert.match(trainer, /\.video-restore-banner \{[^}]*background: var\(--color-sticky-background\)/s);
  // The Trainer's primary action (Play) uses the shared primary button: blue surface + on-interactive text from ui.css.
  assert.match(trainer, /id="playPauseBtn" class="player-play ui-button ui-button--primary"/);
  assert.match(trainer, /<link rel="stylesheet" href="\/ui\.css" \/>/);
});

test("site navigation serves matching transparent wordmarks for both color themes", async () => {
  const [navigation, navigationStyles, trainer, lightLogo, darkLogo] = await Promise.all([
    readFile(new URL("../app/components/site-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/site-navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
    readFile(new URL("../public/brand/unmumble-logo-light.png", import.meta.url)),
    readFile(new URL("../public/brand/unmumble-logo-dark.png", import.meta.url)),
  ]);

  for (const source of [navigation, trainer]) {
    assert.match(source, /aria-label="Unmumble"/);
    assert.match(source, /class(?:Name)?="site-brand-logo"/);
  }
  assert.match(navigationStyles, /\.site-brand-logo \{[^}]*background-image: url\("\/brand\/unmumble-logo-dark\.png"\)/s);
  assert.match(navigationStyles, /:root\[data-theme="light"\] \.site-brand-logo \{[^}]*background-image: url\("\/brand\/unmumble-logo-light\.png"\)/s);
  assert.deepEqual(lightLogo.subarray(0, 8), darkLogo.subarray(0, 8));
  assert.deepEqual([...lightLogo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
