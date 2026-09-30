import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { readGlobalStyles } from "./helpers/styles.mjs";
import { readUiKitStyles } from "./helpers/sources.mjs";

const KIT_DIR = new URL("../app/components/ui/", import.meta.url);

async function readKitSources() {
  const files = (await readdir(KIT_DIR)).filter((name) => /\.tsx?$/.test(name)).sort();
  const entries = await Promise.all(files.map(async (name) => [name, await readFile(new URL(name, KIT_DIR), "utf8")]));
  return new Map(entries);
}

async function readAppSources() {
  const found = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
      if (entry.isDirectory()) await walk(path);
      else if (/\.tsx$/.test(entry.name)) found.push([path.pathname, await readFile(path, "utf8")]);
    }
  }
  await walk(new URL("../app/", import.meta.url));
  return found;
}

test("the UI kit stylesheet is built from theme tokens only", async () => {
  const kit = await readUiKitStyles();
  const withoutComments = kit.replace(/\/\*[\s\S]*?\*\//g, "");
  // The reduced-motion block may use !important: it must outrank the theme's blanket motion reset.
  const withoutMotionOverrides = withoutComments.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*$/, "");

  assert.doesNotMatch(withoutComments, /#[0-9a-f]{3,8}\b/i, "no hard-coded hex colours in the kit");
  assert.doesNotMatch(withoutComments, /\brgba?\(/i, "no hard-coded rgb colours in the kit");
  assert.doesNotMatch(withoutMotionOverrides, /!important/, "the kit never needs !important outside its reduced-motion overrides");
});

test("every ui-* class the kit components emit is styled in public/ui.css", async () => {
  const [kit, sources] = await Promise.all([readUiKitStyles(), readKitSources()]);
  const defined = new Set([...kit.matchAll(/\.(ui-[a-z0-9_-]+)/g)].map((match) => match[1]));
  const used = new Set();

  for (const source of sources.values()) {
    for (const match of source.matchAll(/["'`]((?:[^"'`]*\s)?ui-[a-z0-9_-]+(?:\s[^"'`]*)?)["'`]/g)) {
      for (const name of match[1].split(/\s+/)) if (name.startsWith("ui-")) used.add(name);
    }
    for (const match of source.matchAll(/`(ui-[a-z0-9-]+)--\$\{/g)) used.add(match[1]);
  }

  used.add("ui-button--primary").add("ui-button--soft").add("ui-button--ghost").add("ui-button--danger").add("ui-button--brand");
  used.add("ui-badge--info").add("ui-badge--success").add("ui-badge--warning").add("ui-badge--danger").add("ui-badge--clay");
  used.add("ui-notice--success").add("ui-notice--warning").add("ui-notice--danger");
  for (const name of used) assert.ok(defined.has(name), `${name} is used by a kit component but not defined in ui.css`);
});

test("the kit exposes one import surface for every reusable control", async () => {
  const index = (await readKitSources()).get("index.ts");

  for (const name of [
    "Badge", "BottomSheet", "Button", "ButtonLink", "Card", "Chip", "ChipButton", "EmptyState", "Field",
    "IconButton", "InfoPopover", "ListSkeleton", "Notice", "SearchField", "SelectInput", "Skeleton",
    "Spinner", "TextArea", "TextInput", "buttonClassName", "cx",
  ]) assert.match(index, new RegExp(`\\b${name}\\b`), `${name} must be exported from the kit barrel`);
});

test("buttons keep one API: variants, sizes, loading and an accessible icon-only form", async () => {
  const button = (await readKitSources()).get("button.tsx");

  assert.match(button, /export type ButtonVariant = "primary" \| "secondary" \| "soft" \| "ghost" \| "danger" \| "brand"/);
  assert.match(button, /export type ButtonSize = "sm" \| "md" \| "lg"/);
  assert.match(button, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(button, /disabled=\{disabled \|\| loading\}/);
  assert.match(button, /label: string;/, "IconButton must require an accessible name");
  assert.match(button, /aria-label=\{label\}/);
  assert.match(button, /type = "button"/, "buttons never submit a form by accident");
});

test("application code uses kit buttons instead of bespoke button classes", async () => {
  const offenders = [];
  for (const [path, source] of await readAppSources()) {
    if (path.includes("/components/ui/")) continue;
    for (const match of source.matchAll(/<button\b[^>]*className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = match[1] ?? match[2] ?? "";
      if (/(^|\s)(primary|secondary|action-btn-primary|sheet-action-btn|practice-search-btn|practice-add-btn|phrase-play-btn)(\s|$)/.test(classes)) {
        offenders.push(`${path.split("/app/")[1]}: ${classes}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "use <Button>/<IconButton> from @/app/components/ui");
});

test("modal surfaces are portalled and manage focus, Escape and scroll lock themselves", async () => {
  const sheet = (await readKitSources()).get("bottom-sheet.tsx");

  assert.match(sheet, /createPortal\(/);
  assert.match(sheet, /event\.key === "Escape"/);
  assert.match(sheet, /document\.body\.style\.overflow = "hidden"/);
  assert.match(sheet, /opener\.focus\(/, "focus returns to the control that opened the sheet");
  assert.match(sheet, /aria-modal="true"/);
  assert.match(sheet, /event\.key !== "Tab"/, "Tab stays inside the sheet");
});

test("entrance animations never leave a filled transform on containers of fixed elements", async () => {
  const [globals, kit] = await Promise.all([readGlobalStyles(), readUiKitStyles()]);

  // A filled transform animation makes its element the containing block of `position: fixed`
  // descendants, which once anchored the mobile sheets to the page instead of the screen.
  for (const css of [globals, kit]) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*animation:[^{}]*ui-rise[^{}]*)\}/g)) {
      assert.doesNotMatch(rule[2], /animation:[^;]*\b(both|forwards)\b/, `${rule[1].trim()} must fill with "backwards"`);
    }
  }
});

test("motion is opt-out: the kit and the base theme honour prefers-reduced-motion", async () => {
  const [kit, theme] = await Promise.all([
    readUiKitStyles(),
    readFile(new URL("../public/app-theme.css", import.meta.url), "utf8"),
  ]);

  assert.match(kit, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(theme, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation-duration: \.01ms !important/);
  assert.match(theme, /:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible/);
});

test("both the React app and the static Trainer load the kit after the theme", async () => {
  const [globals, trainer] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
  ]);

  assert.ok(globals.indexOf('@import "../public/app-theme.css"') < globals.indexOf('@import "../public/ui.css"'));
  assert.ok(trainer.indexOf('href="/app-theme.css"') < trainer.indexOf('href="/ui.css"'));
  assert.ok(trainer.indexOf('href="/ui.css"') < trainer.indexOf('href="/site-navigation.css"'));
});
