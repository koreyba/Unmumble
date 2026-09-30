import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mergeGuestCatalog } from "../lib/catalog/guest-catalog.ts";
import { readGlobalStyles } from "./helpers/styles.mjs";
import { readUiKitStyles, readWorkspaceFile, readWorkspaceSource } from "./helpers/sources.mjs";

const analysis = {
  kind: "atom",
  rank: 1,
  pattern: "[tell him]",
  ipa: "telɪm",
  searchQuery: "tell him",
  alternateQuery: null,
  mechanisms: ["elision"],
};

test("guest catalog merge preserves reused status, active legacy and text-only custom phrases", () => {
  const phrases = mergeGuestCatalog({
    version: 2,
    statuses: { "preset-0": "learning_now", "preset-6": "to_learn" },
    customPhrases: [{
      id: "guest-custom-1",
      text: "my own phrase",
      pattern: "[my own phrase]",
      ipa: "",
      context: "",
      translation: "",
      status: "to_learn",
      createdAt: "2026-08-26T00:00:00.000Z",
      updatedAt: "2026-08-26T00:00:00.000Z",
    }],
    savedExamples: [],
    savedVideos: [],
  }, [{ id: "preset-0", text: "tell him", sourceType: "catalog", analysis }], [{
    id: "preset-6",
    text: "you're gonna have to do it",
    pattern: "[you're gonna] [have to] [do it]",
    ipa: "jərgənə hæftə duːɪt",
  }]);

  assert.equal(phrases.find((phrase) => phrase.id === "preset-0")?.status, "learning_now");
  assert.equal(phrases.find((phrase) => phrase.id === "preset-6")?.sourceType, "legacy");
  assert.equal(phrases.find((phrase) => phrase.id === "guest-custom-1")?.analysis, null);
});

test("guest catalog merge hides untouched retired presets from discovery", () => {
  const phrases = mergeGuestCatalog({
    version: 2,
    statuses: {},
    customPhrases: [],
    savedExamples: [],
    savedVideos: [],
  }, [{ id: "preset-0", text: "tell him", sourceType: "catalog", analysis }], [{
    id: "preset-6",
    text: "legacy",
    pattern: "[legacy]",
    ipa: "leɡəsi",
  }]);

  assert.deepEqual(phrases.map((phrase) => phrase.id), ["preset-0"]);
});

test("dedicated Library exposes formats, mechanisms, search and Add with Undo", async () => {
  const [home, library, workspace, navigation] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/library/page.tsx", import.meta.url), "utf8"),
    readWorkspaceSource(),
    readFile(new URL("../app/components/site-navigation.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(home, /<SiteNavigation active="home"/);
  assert.match(home, /href="\/library"/);
  assert.doesNotMatch(home, /<PhraseWorkspace/);
  assert.match(library, /<PhraseWorkspace surface="library"/);
  assert.match(navigation, /href: "\/library",\s*label: "Library"/);
  assert.match(workspace, /CONNECTED_SPEECH_MECHANISMS/);
  assert.match(workspace, /PRACTICE_FORMATS/);
  assert.match(workspace, /Search the catalog/);
  assert.match(workspace, /Add to Learn/);
  assert.match(workspace, />Undo</);
});

test("Library and Practice cards reuse one compact Practice action", async () => {
  const row = await readWorkspaceFile("phrase-row.tsx");

  assert.match(row, /function PracticeAction\(\{ onClick, highlighted \}: Readonly<\{ onClick: \(\) => void; highlighted: boolean \}>\)/);
  assert.equal((row.match(/<PracticeAction highlighted=\{isLearningNow\} onClick=\{\(\) => onOpen\(phrase\)\} \/>/g) ?? []).length, 1);
  assert.match(row, /label="Open in trainer"/);
  assert.doesNotMatch(row, /practice-action/);
});

test("To Learn cards move to Learning Now and remain removable", async () => {
  const [row, sheet] = await Promise.all([
    readWorkspaceFile("phrase-row.tsx"),
    readWorkspaceFile("phrase-options-sheet.tsx"),
  ]);

  for (const source of [row, sheet]) {
    assert.match(source, /to_learn: \{ label: "Move to Learning Now", next: "learning_now" \}/);
    assert.doesNotMatch(source, />Start Learning<\/button>/);
  }
  assert.match(row, /phrase\.status !== "pick" && \(\s*<Button[\s\S]*?quietDanger[\s\S]*?>\s*Remove\s*<\/Button>/);
});

test("custom phrases are added from every Practice tab into To Learn", async () => {
  const workspace = await readWorkspaceSource();

  assert.match(workspace, /\{surface === "practice" && \(\s*<>\s*<PracticeForm[\s\S]*?onSubmit=\{addCustom\}/);
  assert.doesNotMatch(workspace, /\{surface === "library" && \(\s*<>\s*<PracticeForm/);
  assert.match(workspace, /const nextPhrase: Phrase = \{[\s\S]*?status: nextStatus,[\s\S]*?\};/);
  assert.match(workspace, /setActiveTab\(nextStatus\)/);
});

test("Practice omits fabricated analysis placeholders for custom and legacy phrases", async () => {
  const workspace = await readWorkspaceSource();

  assert.doesNotMatch(workspace, /Transcription will appear later/);
  assert.match(workspace, /phrase\.analysis \?/);
  assert.match(workspace, /Your phrase/);
});

test("account custom form keeps an existing catalog card analyzed when text already matches", async () => {
  const workspace = await readFile(new URL("../app/components/phrase-workspace.tsx", import.meta.url), "utf8");

  const reuseBranch = workspace.indexOf("if (data.created === false && data.id)");
  const customProjection = workspace.indexOf("const nextPhrase: Phrase");
  assert.ok(reuseBranch >= 0, "existing account phrases need a dedicated reuse branch");
  assert.ok(reuseBranch < customProjection, "reuse must happen before projecting a new custom phrase");
  assert.match(workspace.slice(reuseBranch, customProjection), /\.\.\.phrase,[\s\S]*?status: nextStatus/);
});

test("stored sorting is restored only when the current surface supports it", async () => {
  const workspace = await readFile(new URL("../app/components/phrase-workspace.tsx", import.meta.url), "utf8");

  assert.match(workspace, /const storedSortOptions = surface === "library" \? catalogSortOptions : practiceSortOptions/);
  assert.match(workspace, /storedSortOptions\.some\(\(option\) => option\.value === stored\)/);
});

test("one SearchIcon from the UI kit serves Library and Practice with no legacy unicode search characters", async () => {
  const [workspace, icons, toolbar, form] = await Promise.all([
    readWorkspaceSource(),
    readFile(new URL("../app/components/ui/icons.tsx", import.meta.url), "utf8"),
    readWorkspaceFile("library-toolbar.tsx"),
    readWorkspaceFile("practice-form.tsx"),
  ]);

  assert.match(icons, /export function SearchIcon\(/);
  assert.doesNotMatch(workspace, /function SearchIcon/, "workspace must reuse the kit icon");
  assert.match(toolbar, /icon=\{<SearchIcon size=\{17\} \/>\}/);
  assert.match(form, /icon=\{<SearchIcon size=\{17\} \/>\}/);
  assert.doesNotMatch(workspace, /⌕/);
});

test("MobileFilterButton component is reused across Library and Practice with active count badge", async () => {
  const [workspace, panel] = await Promise.all([readWorkspaceSource(), readWorkspaceFile("filter-panel.tsx")]);

  assert.match(panel, /export function MobileFilterButton\(\{ activeCount, onClick \}: Readonly<\{ activeCount: number; onClick: \(\) => void \}>\)/);
  assert.match(panel, /activeCount > 0 && <Badge className="filter-count-badge" tone="info">\{activeCount\}<\/Badge>/);
  assert.match(workspace, /const activeFiltersCount = surface === "library"[\s\S]*?\? \(1 \+ selectedMechanisms\.size\)[\s\S]*?: \(selectedMechanisms\.size \+ \(practiceSources\.size < 2 \? 1 : 0\)\);/);

  // One instance, handed to both toolbars.
  assert.equal((workspace.match(/<MobileFilterButton activeCount=\{activeFiltersCount\}/g) ?? []).length, 1);
  assert.equal((workspace.match(/filterButton=\{filterButton\}/g) ?? []).length, 2, "Library and Practice both render the filter trigger");
});

test("Library preserves added phrases with green checkmark badge and suppresses undo banner", async () => {
  const [workspace, row] = await Promise.all([readWorkspaceSource(), readWorkspaceFile("phrase-row.tsx")]);

  // Added phrases are not filtered out of the catalog.
  assert.match(workspace, /if \(surface === "library"\) \{\s+if \(phrase\.analysis\?\.kind === activeFormat\)/);
  assert.doesNotMatch(workspace, /if \(phrase\.status === "pick" && phrase\.analysis\?\.kind === activeFormat\)/);

  // A success badge with a checkmark replaces the Add button once a phrase is saved.
  assert.match(row, /<Badge className="phrase-row__added"[^>]*tone="success">\s*<CheckIcon[\s\S]*?Added/);

  // The notice banner is suppressed on Library.
  assert.match(workspace, /\{notice && surface !== "library" && \(/);
});

test("Practice toolbar is one field plus Add and the filter trigger, with Add collapsing to an icon on mobile", async () => {
  const [form, kit] = await Promise.all([readWorkspaceFile("practice-form.tsx"), readUiKitStyles()]);

  assert.match(form, /className="practice-form__row"/);
  // Search is live as you type, so there is no separate Search button.
  assert.doesNotMatch(form, />\s*Search\s*<\/Button>/);
  assert.doesNotMatch(form, /focusField/);
  assert.match(form, /<Button[\s\S]*?collapse[\s\S]*?type="submit"[\s\S]*?variant="primary"[\s\S]*?>\s*To Learn\s*<\/Button>/);
  assert.match(form, /\{filterButton\}/);
  assert.match(kit, /@media \(max-width: 768px\) \{\s*\.ui-button--collapse \{ width: var\(--ui-height\); padding: 0; \}/);
});

test("Mobile bottom sheet positions mechanism explanation tooltips within bounds without horizontal overflow", async () => {
  const [globals, panel, kit] = await Promise.all([readGlobalStyles(), readWorkspaceFile("filter-panel.tsx"), readUiKitStyles()]);

  assert.match(globals, /\.ui-sheet \.ui-help__panel \{ width: min\(260px, calc\(100vw - 48px\)\); \}/);
  assert.match(panel, /<MechanismHelp[\s\S]*?align="end"/, "filter popovers open toward the screen edge that has room");
  assert.match(kit, /\.ui-help__panel--end \{ right: -8px; left: auto;/);
  assert.match(kit, /width: min\(280px, calc\(100vw - 32px\)\)/);
});

test("Mobile bottom sheet features a pinned CTA footer and a scrollable filter body", async () => {
  const [workspace, kit] = await Promise.all([readWorkspaceSource(), readUiKitStyles()]);

  assert.match(workspace, /<BottomSheet\s+footer=\{\(\s*<Button block onClick=\{closeFilters\} size="lg" variant="primary">[\s\S]*?<FilterPanel \{\.\.\.filterPanelProps\("sheet"\)\} \/>/);
  assert.match(kit, /\.ui-sheet__body \{[\s\S]*?overflow-y: auto;/);
  assert.match(kit, /\.ui-sheet__footer \{[\s\S]*?env\(safe-area-inset-bottom\)/);
});

test("Practice cards and source badges use sourceType and safely handle legacy phrases without analysis", async () => {
  const [workspace, row, panel] = await Promise.all([
    readWorkspaceSource(),
    readWorkspaceFile("phrase-row.tsx"),
    readWorkspaceFile("filter-panel.tsx"),
  ]);

  // Source counts drive the "From catalog" / "Your phrases" filter badges.
  assert.match(panel, /practiceSourceCounts\[row\.id\]/);
  assert.match(workspace, /catalog: phrases\.filter\(\(p\) => p\.status === activeTab && p\.sourceType !== "custom"\)/);
  assert.match(workspace, /custom: phrases\.filter\(\(p\) => p\.status === activeTab && p\.sourceType === "custom"\)/);

  // Rank fallback keys off sourceType, and legacy phrases render without analysis.
  assert.match(row, /phrase\.sourceType === "custom" \? "—" : "01"/);
  assert.match(row, /phrase\.sourceType === "legacy"\) \{\s*return phrase\.translation \? `Saved phrase · \$\{phrase\.translation\}` : "Saved phrase"/);

  // No unused shouldVirtualizePracticeList import.
  assert.doesNotMatch(workspace, /shouldVirtualizePracticeList/);
});

test("Removing a phrase does not trigger native browser window.confirm modal dialog", async () => {
  const workspace = await readFile(new URL("../app/components/phrase-workspace.tsx", import.meta.url), "utf8");

  const removePhraseFn = workspace.match(/async function removePhrase\([\s\S]*?\}\s*finally\s*\{[\s\S]*?\}\s*\}/)?.[0] || "";
  assert.ok(removePhraseFn, "removePhrase function must exist");
  assert.doesNotMatch(removePhraseFn, /window\.confirm/);
});

test("Moving phrases between Practice tabs preserves current tab and animates card transition", async () => {
  const [workspace, row, globals] = await Promise.all([readWorkspaceSource(), readWorkspaceFile("phrase-row.tsx"), readGlobalStyles()]);

  // changeStatus does not switch the active tab.
  const changeStatusFn = workspace.match(/async function changeStatus\([\s\S]*?\}\s*finally\s*\{[\s\S]*?\}\s*\}/)?.[0] || "";
  assert.ok(changeStatusFn, "changeStatus function must exist");
  assert.doesNotMatch(changeStatusFn, /setActiveTab/);

  // Rows connect the moving-out animation class.
  assert.match(row, /moving && "is-moving-out"/);

  // CSS contains the slide-out and tab pulse animations.
  assert.match(globals, /\.phrase-row\.is-moving-out \{/);
  assert.match(globals, /@keyframes tabPulse/);
});

test("Mechanism filters use accessible label with native checkbox to prevent redundant tab stops", async () => {
  const [panel, globals, kit] = await Promise.all([readWorkspaceFile("filter-panel.tsx"), readGlobalStyles(), readUiKitStyles()]);

  // Each mechanism row is a native checkbox inside a label.
  assert.match(panel, /<label className="filter-option__label">[\s\S]*?<input[\s\S]*?type="checkbox"/);

  // No redundant tab stops on the decorative pieces.
  assert.doesNotMatch(panel, /className="filter-check[\s\S]*?tabIndex=\{0\}/);
  assert.doesNotMatch(panel, /className="filter-option__text"[\s\S]*?tabIndex=\{0\}/);

  // The real checkbox is visually hidden; focus is mirrored onto the custom box.
  assert.match(globals, /\.filter-option__label \{/);
  assert.match(globals, /\.filter-option:has\(input:focus-visible\) \.filter-check \{/);
  assert.match(kit, /\.ui-visually-hidden \{/);
});

test("Practice rows in Learning Now are visibly marked", async () => {
  const globals = await readGlobalStyles();

  // The active queue reads as highlighted: tinted fill plus an accent bar on the leading edge.
  assert.match(globals, /\.phrase-row\.is-highlighted \{[\s\S]*?background: var\(--color-interactive-soft\);[\s\S]*?box-shadow: inset 3px 0 0 var\(--color-interactive\);/);
  assert.match(globals, /\.phrase-row \{[\s\S]*?border-bottom: 1px solid color-mix\(in srgb, var\(--color-border\) 60%, transparent\);/);
  assert.match(globals, /\.phrase-row:last-child \{ border-bottom: 0; \}/);
});
