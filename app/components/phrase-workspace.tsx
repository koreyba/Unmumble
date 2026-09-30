"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GuestSignInLink } from "@/app/components/default-account-widget";
import { PracticePhraseGrid } from "@/app/components/practice-phrase-grid";
import { SignedInSiteAccount } from "@/app/components/signed-in-site-account";
import { SiteNavigation } from "@/app/components/site-navigation";
import { BottomSheet, Button, ButtonLink, EmptyState, Field, ListSkeleton, Notice, SelectInput } from "@/app/components/ui";
import { CatalogGroup } from "@/app/components/workspace/catalog-group";
import { FilterPanel, MechanismHelp, MobileFilterButton } from "@/app/components/workspace/filter-panel";
import { LibraryToolbar } from "@/app/components/workspace/library-toolbar";
import {
  catalogSortOptions,
  comparePhrases,
  mechanismChoices,
  practiceFormatTabs,
  practiceSortOptions,
  practiceTabs,
  type Phrase,
  type PhraseSort,
  type PhraseStatus,
  type PracticeSource,
} from "@/app/components/workspace/model";
import { PhraseOptionsSheet } from "@/app/components/workspace/phrase-options-sheet";
import { PhraseRow } from "@/app/components/workspace/phrase-row";
import { PracticeForm } from "@/app/components/workspace/practice-form";
import { PracticeTabs } from "@/app/components/workspace/practice-tabs";
import { readMigratedStorage, writeMigratedStorage } from "@/lib/browser-storage";
import type { CatalogAnalysis } from "@/lib/catalog/catalog-api";
import { mergeGuestCatalog } from "@/lib/catalog/guest-catalog";
import {
  CONNECTED_SPEECH_MECHANISMS,
  LEGACY_PRESET_PHRASES,
  PRACTICE_FORMATS,
  type ConnectedSpeechMechanism,
  type PracticeFormat,
} from "@/lib/catalog/connected-speech-catalog";
import { accountSession, type AccountSessionUser } from "@/lib/client-session";
import {
  GUEST_LIBRARY_STORAGE_KEY,
  LEGACY_GUEST_LIBRARY_STORAGE_KEYS,
  addGuestPhrase,
  createGuestLibrary,
  normalizeGuestLibrary,
  removeGuestPhrase,
  setGuestPhraseStatus,
  type GuestLibraryState,
} from "@/lib/guest-library";
import { filterPracticePhrases } from "@/lib/practice-list";

type PhrasesResponse = { phrases: Phrase[]; user?: Viewer; error?: string };
type CatalogCard = { id: string; text: string; sourceType: "catalog"; analysis: CatalogAnalysis };
type CatalogResponse = { cards?: CatalogCard[]; error?: string };
type PhraseMutationResponse = {
  id?: string;
  status?: PhraseStatus;
  translation?: string;
  context?: string;
  created_at?: string;
  updated_at?: string;
  error?: string;
  created?: boolean;
  translationPending?: boolean;
};
type Viewer = AccountSessionUser;

const PHRASE_SORT_STORAGE_KEY = "unmumble-library-sort-v1";
const LEGACY_PHRASE_SORT_STORAGE_KEYS = ["listen-to-learn-library-sort-v1"] as const;

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function PhraseWorkspace({ surface }: { surface: "library" | "practice" }) {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [catalogCards, setCatalogCards] = useState<CatalogCard[]>([]);
  const [mode, setMode] = useState<"guest" | "account">("guest");
  const [guestLibrary, setGuestLibrary] = useState<GuestLibraryState>(() => createGuestLibrary());
  const [activeTab, setActiveTab] = useState<PhraseStatus>(
    surface === "practice" ? "learning_now" : "pick",
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customText, setCustomText] = useState("");
  const [phraseSort, setPhraseSort] = useState<PhraseSort>(surface === "library" ? "recommended" : "added_desc");
  const [activeFormat, setActiveFormat] = useState<PracticeFormat>("atom");
  const [selectedMechanisms, setSelectedMechanisms] = useState<Set<ConnectedSpeechMechanism>>(new Set());
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null);
  const [practiceSources, setPracticeSources] = useState<Set<PracticeSource>>(new Set(["catalog", "custom"]));
  const [catalogSearch, setCatalogSearch] = useState("");
  const [practiceSearch, setPracticeSearch] = useState("");
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [openMenuPhraseId, setOpenMenuPhraseId] = useState<string | null>(null);
  const [movingPhraseId, setMovingPhraseId] = useState<string | null>(null);
  const [pulseTabId, setPulseTabId] = useState<string | null>(null);
  const phraseSortReady = useRef(false);
  const [tabResolved, setTabResolved] = useState(surface !== "practice");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = readMigratedStorage(
          window.localStorage,
          PHRASE_SORT_STORAGE_KEY,
          LEGACY_PHRASE_SORT_STORAGE_KEYS,
        );
        const storedSortOptions = surface === "library" ? catalogSortOptions : practiceSortOptions;
        if (storedSortOptions.some((option) => option.value === stored)) {
          setPhraseSort(stored as PhraseSort);
        }
      } catch {
        // Browser storage is optional; the default remains usable.
      } finally {
        phraseSortReady.current = true;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [surface]);

  useEffect(() => {
    if (!phraseSortReady.current) return;
    try {
      writeMigratedStorage(
        window.localStorage,
        PHRASE_SORT_STORAGE_KEY,
        LEGACY_PHRASE_SORT_STORAGE_KEYS,
        phraseSort,
      );
    } catch {
      // Browser storage is optional; the current selection still applies.
    }
  }, [phraseSort]);
  const [viewer, setViewer] = useState<Viewer | null>(null);

  const persistGuestState = useCallback((next: GuestLibraryState) => {
    const normalized = normalizeGuestLibrary(next);
    setMode("guest");
    setViewer(null);
    setGuestLibrary(normalized);
    setPhrases(mergeGuestCatalog(normalized, catalogCards, LEGACY_PRESET_PHRASES));
    try {
      writeMigratedStorage(
        window.localStorage,
        GUEST_LIBRARY_STORAGE_KEY,
        LEGACY_GUEST_LIBRARY_STORAGE_KEYS,
        JSON.stringify(normalized),
      );
    } catch {
      setNotice("Guest progress only lasts while this tab is open because localStorage is unavailable.");
    }
  }, [catalogCards]);

  const loadGuestState = useCallback(async () => {
    setLoading(true);
    setError("");
    let next = createGuestLibrary();
    try {
      const raw = readMigratedStorage(
        window.localStorage,
        GUEST_LIBRARY_STORAGE_KEY,
        LEGACY_GUEST_LIBRARY_STORAGE_KEYS,
      );
      if (raw) next = normalizeGuestLibrary(JSON.parse(raw));
    } catch {
      setNotice("Could not read guest progress; starting with a clean state.");
    }
    setMode("guest");
    setViewer(null);
    setGuestLibrary(next);
    try {
      const response = await fetch("/api/catalog");
      const data = await response.json() as CatalogResponse;
      if (!response.ok || !Array.isArray(data.cards)) {
        throw new Error(data.error || "Could not load the connected-speech catalog.");
      }
      setCatalogCards(data.cards);
      setPhrases(mergeGuestCatalog(next, data.cards, LEGACY_PRESET_PHRASES));
    } catch (reason) {
      setPhrases(mergeGuestCatalog(next, [], LEGACY_PRESET_PHRASES));
      setError(reason instanceof Error ? reason.message : "Could not load the connected-speech catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAccount = useCallback(async (sessionUser: AccountSessionUser) => {
    setMode("account");
    setViewer(sessionUser);
    setLoading(true);
    try {
      const response = await fetch("/api/phrases", { cache: "no-store" });
      const data = await response.json() as PhrasesResponse;
      if (!response.ok || !Array.isArray(data.phrases)) {
        throw new Error(data.error || "account session unavailable");
      }
      setViewer(data.user || sessionUser);
      setPhrases(data.phrases);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load account phrases.");
    } finally {
      setLoading(false);
    }
  }, []);


  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const signedIn = params.get("signedIn") === "1";
    if (signedIn) window.history.replaceState(null, "", window.location.pathname);

    const timer = window.setTimeout(() => {
      void accountSession().then((sessionUser) => {
        if (sessionUser) void loadAccount(sessionUser);
        else void loadGuestState();
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccount, loadGuestState, surface]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (
        ![GUEST_LIBRARY_STORAGE_KEY, ...LEGACY_GUEST_LIBRARY_STORAGE_KEYS].includes(event.key || "")
        || mode !== "guest"
      ) return;
      void loadGuestState();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [loadGuestState, mode]);

  const counts = useMemo(() => Object.fromEntries(
    ["pick", ...practiceTabs.map((tab) => tab.id)].map((status) => [
      status,
      phrases.filter((phrase) => phrase.status === status).length,
    ])
  ) as Record<PhraseStatus, number>, [phrases]);

  // Counts describe the catalog exactly as the list shows it: phrases you already added stay in it.
  const formatCounts = useMemo(() => Object.fromEntries(practiceFormatTabs.map(([kind]) => [
    kind,
    phrases.filter((phrase) => phrase.analysis?.kind === kind).length,
  ])) as Record<PracticeFormat, number>, [phrases]);

  const mechanismCounts = useMemo(() => {
    const formatPhrases = phrases.filter((p) => p.analysis?.kind === activeFormat);
    return Object.fromEntries(mechanismChoices.map(([mech]) => [
      mech,
      formatPhrases.filter((p) => p.analysis?.mechanisms.includes(mech)).length,
    ])) as Record<ConnectedSpeechMechanism, number>;
  }, [activeFormat, phrases]);

  const practiceSourceCounts = useMemo(() => ({
    catalog: phrases.filter((p) => p.status === activeTab && p.sourceType !== "custom").length,
    custom: phrases.filter((p) => p.status === activeTab && p.sourceType === "custom").length,
  }), [activeTab, phrases]);

  const sortedForSurface = useMemo(
    () => phrases
      .filter((phrase) => {
        if (surface === "library") {
          if (phrase.analysis?.kind === activeFormat) {
            if (selectedMechanisms.size > 0 && !phrase.analysis.mechanisms.some((m) => selectedMechanisms.has(m))) {
              return false;
            }
            if (catalogSearch.trim()) {
              const query = catalogSearch.trim().toLocaleLowerCase("en");
              const haystack = `${phrase.text} ${phrase.analysis.pattern} ${phrase.analysis.ipa}`.toLocaleLowerCase("en");
              return haystack.includes(query);
            }
            return true;
          }
          return false;
        }

        if (phrase.status !== activeTab) return false;
        if (practiceSources.size < 2) {
          if (!practiceSources.has("catalog") && phrase.sourceType !== "custom") return false;
          if (!practiceSources.has("custom") && phrase.sourceType === "custom") return false;
        }
        if (selectedMechanisms.size > 0) {
          if (!phrase.analysis || !phrase.analysis.mechanisms.some((m) => selectedMechanisms.has(m))) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => comparePhrases(a, b, phraseSort)),
    [activeFormat, activeTab, catalogSearch, phraseSort, phrases, practiceSources, selectedMechanisms, surface]
  );

  const visible = useMemo(
    () => surface === "practice"
      ? filterPracticePhrases(sortedForSurface, practiceSearch)
      : sortedForSurface,
    [practiceSearch, sortedForSurface, surface],
  );

  const libraryGroups = useMemo(() => {
    if (surface !== "library") return [];
    if (catalogSearch.trim() || selectedMechanisms.size > 0) {
      return [{
        key: "filtered",
        title: selectedMechanisms.size === 1
          ? CONNECTED_SPEECH_MECHANISMS[Array.from(selectedMechanisms)[0]].title
          : "Matching phrases",
        hint: selectedMechanisms.size === 1
          ? CONNECTED_SPEECH_MECHANISMS[Array.from(selectedMechanisms)[0]].hint
          : `${visible.length} cards found`,
        mechanismKey: selectedMechanisms.size === 1 ? Array.from(selectedMechanisms)[0] : null,
        rows: visible,
      }];
    }

    return mechanismChoices.map(([mechKey, mechDef]) => {
      const rows = sortedForSurface.filter((p) => p.analysis?.mechanisms.includes(mechKey));
      return {
        key: mechKey,
        title: mechDef.title,
        hint: mechDef.hint,
        mechanismKey: mechKey,
        rows,
      };
    }).filter((group) => group.rows.length > 0);
  }, [catalogSearch, selectedMechanisms, sortedForSurface, surface, visible]);

  async function changeStatus(id: string, status: PhraseStatus) {
    setBusyId(id);
    setError("");
    if (surface === "practice") {
      setMovingPhraseId(id);
      setPulseTabId(status);
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    if (mode === "guest") {
      persistGuestState(setGuestPhraseStatus(guestLibrary, id, status));
      if (surface === "library" && status === "to_learn") {
        setRecentlyAdded(id);
      } else if (status === "to_learn") {
        setNotice("Added to To Learn. Guest progress is saved in this browser.");
      } else if (status === "pick") {
        setRecentlyAdded(null);
        setNotice("Returned to the catalog.");
      }
      setMovingPhraseId(null);
      setTimeout(() => setPulseTabId((current) => (current === status ? null : current)), 400);
      setBusyId(null);
      return;
    }
    try {
      const response = await fetch("/api/phrases", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await response.json() as PhraseMutationResponse;
      if (!response.ok) throw new Error(data.error || "Could not update the phrase status.");
      setPhrases((currentPhrases) => currentPhrases.map((phrase) => phrase.id === id
        ? {
            ...phrase,
            status: data.status || status,
            translation: data.translation ?? phrase.translation,
            updated_at: data.updated_at || new Date().toISOString(),
          }
        : phrase));
      if (surface === "library" && status === "to_learn") {
        setRecentlyAdded(id);
      } else if (status === "to_learn") {
        setNotice("Added to To Learn.");
      } else if (status === "pick") {
        setRecentlyAdded(null);
        setNotice("Returned to the catalog.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the phrase status.");
    } finally {
      setMovingPhraseId(null);
      setTimeout(() => setPulseTabId((current) => (current === status ? null : current)), 400);
      setBusyId(null);
    }
  }

  async function undoAdded() {
    if (!recentlyAdded) return;
    await changeStatus(recentlyAdded, "pick");
  }

  async function removePhrase(phrase: Phrase) {
    setBusyId(phrase.id);
    setError("");
    if (mode === "guest") {
      persistGuestState(removeGuestPhrase(guestLibrary, phrase.id));
      setNotice("Phrase removed from the guest library.");
      setBusyId(null);
      return;
    }
    try {
      const response = await fetch(`/api/phrases?id=${encodeURIComponent(phrase.id)}`, { method: "DELETE" });
      const data = await response.json() as PhraseMutationResponse;
      if (!response.ok) throw new Error(data.error || "Could not remove the phrase.");
      setPhrases((currentPhrases) => phrase.sourceType !== "custom"
        ? currentPhrases.map((currentPhrase) => currentPhrase.id === phrase.id
          ? { ...currentPhrase, status: "pick", updated_at: new Date().toISOString() }
          : currentPhrase)
        : currentPhrases.filter((currentPhrase) => currentPhrase.id !== phrase.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the phrase.");
    } finally {
      setBusyId(null);
    }
  }

  async function addCustom(event: FormEvent) {
    event.preventDefault();
    const text = (customText || practiceSearch).trim();
    if (!text) return;
    setBusyId("new");
    setError("");
    setNotice("");
    if (mode === "guest") {
      const existing = phrases.find((phrase) => phrase.text.toLocaleLowerCase("en") === text.toLocaleLowerCase("en"));
      if (existing) {
        const nextStatus = existing.status === "pick" ? "to_learn" : existing.status;
        persistGuestState(setGuestPhraseStatus(guestLibrary, existing.id, nextStatus));
        setCustomText("");
        setPracticeSearch("");
        setActiveTab(nextStatus);
        setNotice("This phrase was already in the guest library.");
      } else {
        const result = addGuestPhrase(guestLibrary, { text });
        if (result.phrase) {
          persistGuestState(result.state);
          setCustomText("");
          setPracticeSearch("");
          setActiveTab("to_learn");
          setNotice("Phrase added to the guest library. Translation is available after signing in with Google.");
        }
      }
      setBusyId(null);
      return;
    }
    try {
      const response = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json() as PhraseMutationResponse;
      if (!response.ok) throw new Error(data.error || "Could not add the phrase.");
      setCustomText("");
      setPracticeSearch("");
      const nextStatus = data.status || "to_learn";
      if (data.created === false && data.id) {
        setPhrases((currentPhrases) => currentPhrases.map((phrase) => phrase.id === data.id
          ? {
              ...phrase,
              status: nextStatus,
              translation: data.translation ?? phrase.translation,
              context: data.context ?? phrase.context,
              updated_at: data.updated_at || phrase.updated_at,
            }
          : phrase));
        setActiveTab(nextStatus);
        const translationNotice = data.translationPending
          ? " Translation is currently unavailable, but the phrase was saved."
          : "";
        setNotice(`This phrase is already in your library.${translationNotice}`);
        return;
      }
      const nextPhrase: Phrase = {
        id: data.id || `custom-${Date.now()}`,
        text,
        pattern: text,
        ipa: "",
        translation: data.translation || "",
        context: data.context || "",
        source_type: "custom",
        sourceType: "custom",
        catalog_order: null,
        status: nextStatus,
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
        analysis: null,
      };
      setPhrases((currentPhrases) => {
        const existing = currentPhrases.some((phrase) => phrase.id === nextPhrase.id);
        return existing
          ? currentPhrases.map((phrase) => phrase.id === nextPhrase.id ? { ...phrase, ...nextPhrase } : phrase)
          : [...currentPhrases, nextPhrase];
      });
      setActiveTab(nextStatus);
      const translationNotice = data.translationPending ? " Translation is currently unavailable, but the phrase was saved." : "";
      setNotice(data.created === false ? `This phrase is already in your library.${translationNotice}` : `Phrase added to To Learn${data.translationPending ? ". Translation is currently unavailable." : " with a translation."}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add the phrase.");
    } finally {
      setBusyId(null);
    }
  }

  function openPhrase(phrase: Phrase) {
    const query = new URLSearchParams({ phrase: phrase.text, phraseId: phrase.id });
    // /trainer is a static public HTML application outside the Next.js router
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/trainer?${query.toString()}`);
  }

  function toggleMechanism(mech: ConnectedSpeechMechanism) {
    setSelectedMechanisms((prev) => {
      const next = new Set(prev);
      if (next.has(mech)) next.delete(mech);
      else next.add(mech);
      return next;
    });
  }

  function togglePracticeSource(src: PracticeSource) {
    setPracticeSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) {
        if (next.size > 1) next.delete(src);
      } else {
        next.add(src);
      }
      return next;
    });
  }

  function closeFilters() {
    setMobileFilterOpen(false);
    setOpenHelpKey(null);
  }

  function resetFilters() {
    if (surface === "library") {
      setActiveFormat("atom");
      setSelectedMechanisms(new Set());
      setCatalogSearch("");
    } else {
      setPracticeSources(new Set(["catalog", "custom"]));
      setSelectedMechanisms(new Set());
      setPracticeSearch("");
      setCustomText("");
    }
    setOpenHelpKey(null);
  }

  // Practice opens on "Learning Now", but if that queue is empty while others are not,
  // land on the first queue that has phrases so the page never opens on a blank state.
  if (!loading && !tabResolved) {
    // Runs once, during the render that first has data (adjusting state while rendering is React's
    // sanctioned alternative to an effect here, and it avoids painting the empty queue first).
    setTabResolved(true);
    const firstFilled = practiceTabs.find((tab) => (counts[tab.id] || 0) > 0);
    if (firstFilled && (counts[activeTab] || 0) === 0) setActiveTab(firstFilled.id);
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const sortOptions = surface === "library" ? catalogSortOptions : practiceSortOptions;
  const activeFiltersCount = surface === "library"
    ? (1 + selectedMechanisms.size)
    : (selectedMechanisms.size + (practiceSources.size < 2 ? 1 : 0));

  const getMechanismExample = useCallback((mech: ConnectedSpeechMechanism) => {
    const card = catalogCards.find((c) => c.analysis.mechanisms.includes(mech))
      || phrases.find((p) => p.analysis?.mechanisms.includes(mech));
    return card ? `${card.text} → ${card.analysis?.ipa || ""}` : "";
  }, [catalogCards, phrases]);

  const filterPanelProps = (variant: "sidebar" | "sheet") => ({
    surface,
    variant,
    activeFormat,
    formatCounts,
    onFormatChange: setActiveFormat,
    practiceSources,
    practiceSourceCounts,
    onToggleSource: togglePracticeSource,
    selectedMechanisms,
    mechanismCounts,
    allMechanismsCount: formatCounts[activeFormat] || 0,
    onToggleMechanism: toggleMechanism,
    onClearMechanisms: () => setSelectedMechanisms(new Set()),
    openHelpKey,
    onHelpChange: setOpenHelpKey,
    mechanismExample: getMechanismExample,
    onReset: resetFilters,
  });

  const renderRow = (phrase: Phrase) => (
    <PhraseRow
      busy={busyId === phrase.id}
      key={phrase.id}
      moving={movingPhraseId === phrase.id}
      onChangeStatus={changeStatus}
      onOpen={openPhrase}
      onOpenMenu={(id) => setOpenMenuPhraseId(openMenuPhraseId === id ? null : id)}
      onRemove={removePhrase}
      phrase={phrase}
      surface={surface}
    />
  );

  const filterButton = (
    <MobileFilterButton activeCount={activeFiltersCount} onClick={() => setMobileFilterOpen(true)} />
  );
  const returnTo = surface === "practice" ? "/practice" : "/library";
  const itemNoun = surface === "library" ? "card" : "phrase";
  const anyPhrases = phrases.some((phrase) => phrase.status !== "pick" || phrase.sourceType === "custom");

  return (
    <>
      <SiteNavigation
        active={surface}
        account={mode === "guest" || !viewer ? (
          <GuestSignInLink returnTo={returnTo} />
        ) : (
          <SignedInSiteAccount user={viewer} />
        )}
      />

      <main className="library-shell">
        <header className="library-header sr-only">
          <div>
            <p className="eyebrow">Unmumble</p>
            <h1>Train connected speech.</h1>
          </div>
        </header>

        <div className="workspace-notices">
          {error && <Notice tone="danger">{error}</Notice>}
          {notice && surface !== "library" && (
            <Notice
              action={recentlyAdded ? <Button onClick={undoAdded} size="sm" variant="ghost">Undo</Button> : undefined}
              tone="success"
            >
              {notice}
            </Notice>
          )}
        </div>

        <div className="workspace-layout">
          <aside aria-label="Filters" className="workspace-sidebar desktop-only">
            <FilterPanel {...filterPanelProps("sidebar")} />
          </aside>

          <section className="workspace-main">
            <div className="workspace-top-heading">
              <h2>{surface === "library" ? "Catalog" : "Practice"}</h2>
              <span className="workspace-top-heading__meta">
                {surface === "library"
                  ? `${plural(visible.length, "card")} · ${PRACTICE_FORMATS[activeFormat].title.toLowerCase()} · ▶ opens the trainer`
                  : `${plural(visible.length, "phrase")} · ${counts.learning_now || 0} in progress`}
              </span>
            </div>

            {surface === "library" && (
              <>
                <LibraryToolbar
                  filterButton={filterButton}
                  format={activeFormat}
                  onClearAll={resetFilters}
                  onSearchChange={setCatalogSearch}
                  onSortChange={setPhraseSort}
                  onToggleMechanism={toggleMechanism}
                  search={catalogSearch}
                  selectedMechanisms={selectedMechanisms}
                  sort={phraseSort}
                  sortOptions={sortOptions}
                />

                <div className="catalog-groups">
                  {loading ? (
                    <ListSkeleton label="Loading catalog" rows={5} />
                  ) : libraryGroups.length === 0 ? (
                    <EmptyState
                      action={<Button onClick={resetFilters} variant="soft">Reset filters</Button>}
                      description="Try adjusting your filters or search term."
                      title="No matching cards found"
                    />
                  ) : (
                    libraryGroups.map((group) => (
                      <CatalogGroup
                        count={group.rows.length}
                        help={group.mechanismKey ? (
                          <MechanismHelp
                            example={getMechanismExample(group.mechanismKey)}
                            helpKey={`group:${group.key}`}
                            label={group.title}
                            mechanism={group.mechanismKey}
                            onOpenChange={setOpenHelpKey}
                            openKey={openHelpKey}
                          />
                        ) : null}
                        helpOpen={openHelpKey === `group:${group.key}`}
                        hint={group.hint}
                        key={group.key}
                        title={group.title}
                      >
                        {group.rows.map(renderRow)}
                      </CatalogGroup>
                    ))
                  )}
                </div>
              </>
            )}

            {surface === "practice" && (
              <>
                <PracticeForm
                  busy={busyId === "new"}
                  filterButton={filterButton}
                  onChange={setPracticeSearch}
                  onSortChange={setPhraseSort}
                  onSubmit={addCustom}
                  sort={phraseSort}
                  sortOptions={sortOptions}
                  value={practiceSearch}
                />

                <PracticeTabs
                  active={activeTab}
                  counts={counts}
                  onChange={setActiveTab}
                  pulseId={pulseTabId}
                />

                {loading ? (
                  <ListSkeleton label="Loading phrases" rows={4} />
                ) : visible.length === 0 ? (
                  <EmptyState
                    action={!anyPhrases ? (
                      <ButtonLink href="/library" variant="primary">Browse the catalog</ButtonLink>
                    ) : undefined}
                    description={activeTab === "learning_now"
                      ? "Start a phrase from To Learn or add one above."
                      : activeTab === "to_learn"
                      ? "Save phrases from the catalog or type your own above."
                      : "Phrases you complete in the trainer will appear here."}
                    title="Nothing here yet"
                  />
                ) : (
                  <PracticePhraseGrid items={visible} renderItem={renderRow} />
                )}
              </>
            )}

            {mode === "guest" && (
              <aside className="guest-card mobile-only">
                <span>Progress is saved in this browser.</span>
                <GuestSignInLink abbreviate={false} returnTo={returnTo} />
              </aside>
            )}
          </section>
        </div>

        <BottomSheet
          footer={(
            <Button block onClick={closeFilters} size="lg" variant="primary">
              Show {plural(visible.length, itemNoun)}
            </Button>
          )}
          label="Filters"
          onClose={closeFilters}
          open={mobileFilterOpen}
        >
          <FilterPanel {...filterPanelProps("sheet")} />
          <Field htmlFor="filter-sheet-sort" label="Sort by">
            <SelectInput
              id="filter-sheet-sort"
              onChange={(event) => setPhraseSort(event.target.value as PhraseSort)}
              value={phraseSort}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectInput>
          </Field>
        </BottomSheet>

        <PhraseOptionsSheet
          busy={busyId === openMenuPhraseId}
          onChangeStatus={changeStatus}
          onClose={() => setOpenMenuPhraseId(null)}
          onRemove={removePhrase}
          phrase={openMenuPhraseId ? phrases.find((phrase) => phrase.id === openMenuPhraseId) ?? null : null}
        />
      </main>
    </>
  );
}
