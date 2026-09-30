import {
  CONNECTED_SPEECH_MECHANISMS,
  PRACTICE_FORMATS,
  type ConnectedSpeechMechanism,
  type PracticeFormat,
} from "@/lib/catalog/connected-speech-catalog";
import type { WorkspacePhrase } from "@/lib/catalog/guest-catalog";

export type Surface = "library" | "practice";
export type PhraseStatus = "pick" | "to_learn" | "learning_now" | "learnt";
export type Phrase = WorkspacePhrase;
export type PracticeSource = "catalog" | "custom";
export type PhraseSort = "recommended" | "added_desc" | "added_asc" | "alpha_asc" | "alpha_desc";

export const practiceTabs: Array<{ id: Exclude<PhraseStatus, "pick">; label: string; hint: string }> = [
  { id: "to_learn", label: "To Learn", hint: "Saved for later." },
  { id: "learning_now", label: "Learning Now", hint: "What you are listening to now." },
  { id: "learnt", label: "Learned", hint: "Phrases you have already mastered." },
];

export const practiceSortOptions: Array<{ value: PhraseSort; label: string }> = [
  { value: "added_desc", label: "Added · newest first" },
  { value: "added_asc", label: "Added · oldest first" },
  { value: "alpha_asc", label: "Alphabetical · A–Z" },
  { value: "alpha_desc", label: "Alphabetical · Z–A" },
];

export const catalogSortOptions: Array<{ value: PhraseSort; label: string }> = [
  { value: "recommended", label: "Recommended order" },
  { value: "alpha_asc", label: "Alphabetical · A–Z" },
  { value: "alpha_desc", label: "Alphabetical · Z–A" },
];

export const practiceFormatTabs = Object.entries(PRACTICE_FORMATS) as Array<[
  PracticeFormat,
  (typeof PRACTICE_FORMATS)[PracticeFormat],
]>;

export const mechanismChoices = Object.entries(CONNECTED_SPEECH_MECHANISMS) as Array<[
  ConnectedSpeechMechanism,
  (typeof CONNECTED_SPEECH_MECHANISMS)[ConnectedSpeechMechanism],
]>;

function phraseTieBreaker(a: Phrase, b: Phrase) {
  const catalogA = a.catalog_order ?? Number.MAX_SAFE_INTEGER;
  const catalogB = b.catalog_order ?? Number.MAX_SAFE_INTEGER;
  return catalogA - catalogB || a.id.localeCompare(b.id);
}

export function comparePhrases(a: Phrase, b: Phrase, sort: PhraseSort) {
  if (sort === "recommended") {
    return (a.analysis?.rank ?? Number.MAX_SAFE_INTEGER) - (b.analysis?.rank ?? Number.MAX_SAFE_INTEGER)
      || phraseTieBreaker(a, b);
  }
  if (sort === "alpha_asc" || sort === "alpha_desc") {
    const alphabetic = a.text.localeCompare(b.text, "en", { sensitivity: "base" });
    return (sort === "alpha_asc" ? alphabetic : -alphabetic) || phraseTieBreaker(a, b);
  }

  const aTime = Date.parse(a.created_at) || 0;
  const bTime = Date.parse(b.created_at) || 0;
  return (sort === "added_desc" ? bTime - aTime : aTime - bTime) || phraseTieBreaker(a, b);
}

/** Short mechanism name for chips and subtitles, e.g. "Vowel reduction & weak forms" → "Vowel reduction". */
export function shortMechanismTitle(mechanism: ConnectedSpeechMechanism) {
  return CONNECTED_SPEECH_MECHANISMS[mechanism]?.title.split("&")[0].trim() ?? "";
}
