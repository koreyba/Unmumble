import {
  CONNECTED_SPEECH_MECHANISMS,
  PRACTICE_FORMATS,
} from "@/lib/catalog/connected-speech-catalog";
import { Badge, Button, CheckIcon, IconButton, MoreIcon, PlayIcon, PlusIcon, cx } from "@/app/components/ui";
import type { Phrase, PhraseStatus, Surface } from "./model";

type PatternPart = { text: string; linked: boolean };

/** Splits "[connected] sounds" style patterns into plain text and linked sound blocks, in one linear pass. */
function splitPattern(pattern: string): PatternPart[] {
  const parts: PatternPart[] = [];
  let index = 0;
  while (index < pattern.length) {
    const open = pattern.indexOf("[", index);
    const close = open === -1 ? -1 : pattern.indexOf("]", open + 1);
    if (close === -1) {
      parts.push({ text: pattern.slice(index), linked: false });
      break;
    }
    if (open > index) parts.push({ text: pattern.slice(index, open), linked: false });
    // "[]" carries no sound; keep it as plain text and carry on after it.
    const empty = close === open + 1;
    parts.push(empty ? { text: "[]", linked: false } : { text: pattern.slice(open + 1, close), linked: true });
    index = close + 1;
  }
  return parts;
}

function renderPattern(pattern: string) {
  return splitPattern(pattern).map((part, index) =>
    part.linked
      ? <span className="sound-block" key={`${part.text}-${index}`}>{part.text}</span>
      : <span key={`${part.text}-${index}`}>{part.text}</span>
  );
}

function PracticeAction({ onClick, highlighted }: Readonly<{ onClick: () => void; highlighted: boolean }>) {
  return (
    <IconButton
      className="phrase-row__play"
      label="Open in trainer"
      onClick={onClick}
      pill
      size="sm"
      variant={highlighted ? "primary" : "soft"}
    >
      <PlayIcon size={14} />
    </IconButton>
  );
}

function practiceSubtitle(phrase: Phrase, isLearningNow: boolean) {
  if (phrase.sourceType === "custom") {
    return phrase.translation ? `Your phrase · ${phrase.translation}` : "Your phrase";
  }
  if (phrase.sourceType === "legacy") {
    return phrase.translation ? `Saved phrase · ${phrase.translation}` : "Saved phrase";
  }
  if (phrase.analysis) {
    const mechanisms = phrase.analysis.mechanisms
      .map((mechanism) => CONNECTED_SPEECH_MECHANISMS[mechanism]?.title.split("&")[0].trim())
      .filter(Boolean)
      .join(", ");
    const format = PRACTICE_FORMATS[phrase.analysis.kind]?.title || "Phrase";
    return `${format} · ${mechanisms}${isLearningNow ? " · last opened" : ""}`;
  }
  return "Your phrase";
}

function screenReaderKind(phrase: Phrase, surface: Surface) {
  if (surface === "practice") {
    if (phrase.sourceType === "custom") return "Your phrase";
    if (phrase.sourceType === "legacy") return "Saved phrase";
    return phrase.analysis ? PRACTICE_FORMATS[phrase.analysis.kind]?.title || "Phrase" : "Phrase";
  }
  return phrase.analysis
    ? `${PRACTICE_FORMATS[phrase.analysis.kind]?.title || "Phrase"} · #${phrase.analysis.rank}`
    : "Phrase";
}

type PhraseRowProps = {
  phrase: Phrase;
  surface: Surface;
  busy: boolean;
  moving: boolean;
  onOpen: (phrase: Phrase) => void;
  onChangeStatus: (id: string, status: PhraseStatus) => void;
  onRemove: (phrase: Phrase) => void;
  onOpenMenu: (id: string) => void;
};

const forwardAction: Partial<Record<PhraseStatus, { label: string; next: PhraseStatus }>> = {
  to_learn: { label: "Move to Learning Now", next: "learning_now" },
  learning_now: { label: "Mark as Learned", next: "learnt" },
  learnt: { label: "Learn Again", next: "learning_now" },
};

function rankLabel(phrase: Phrase) {
  if (phrase.analysis?.rank) return String(phrase.analysis.rank).padStart(2, "0");
  return phrase.sourceType === "custom" ? "—" : "01";
}

function LibraryActions({
  phrase,
  busy,
  onChangeStatus,
}: Readonly<{ phrase: Phrase; busy: boolean; onChangeStatus: (id: string, status: PhraseStatus) => void }>) {
  if (phrase.status !== "pick") {
    return (
      <Badge className="phrase-row__added" title="Added to your list" tone="success">
        <CheckIcon size={14} />
        <span className="phrase-row__added-label">Added</span>
      </Badge>
    );
  }
  return (
    <Button
      collapse
      disabled={busy}
      icon={<PlusIcon size={16} />}
      onClick={() => onChangeStatus(phrase.id, "to_learn")}
      size="sm"
    >
      Add to Learn
    </Button>
  );
}

function PracticeActions({
  phrase,
  busy,
  onChangeStatus,
  onRemove,
  onOpenMenu,
}: Readonly<Pick<PhraseRowProps, "phrase" | "busy" | "onChangeStatus" | "onRemove" | "onOpenMenu">>) {
  const forward = forwardAction[phrase.status];
  return (
    <>
      {forward && (
        <Button
          className="desktop-only"
          disabled={busy}
          onClick={() => onChangeStatus(phrase.id, forward.next)}
          size="sm"
          variant="soft"
        >
          {forward.label}
        </Button>
      )}
      {phrase.status !== "pick" && (
        <Button
          className="desktop-only"
          disabled={busy}
          onClick={() => onRemove(phrase)}
          quietDanger
          size="sm"
        >
          Remove
        </Button>
      )}
      {phrase.status !== "pick" && (
        <IconButton
          className="mobile-only"
          label="Options"
          onClick={() => onOpenMenu(phrase.id)}
          size="sm"
          variant="ghost"
        >
          <MoreIcon size={18} />
        </IconButton>
      )}
    </>
  );
}

/** One phrase in the catalog (Library) or in a learning queue (Practice). */
export function PhraseRow({ phrase, surface, busy, moving, onOpen, onChangeStatus, onRemove, onOpenMenu }: Readonly<PhraseRowProps>) {
  const isLibrary = surface === "library";
  const isLearningNow = phrase.status === "learning_now";

  return (
    <article
      className={cx(
        "phrase-row",
        isLibrary ? "phrase-row--catalog" : "phrase-row--practice",
        isLearningNow && "is-highlighted",
        moving && "is-moving-out",
      )}
    >
      <span className="phrase-row__rank">{rankLabel(phrase)}</span>

      <div className="phrase-row__main">
        <span className="sr-only">{screenReaderKind(phrase, surface)}</span>
        <span className="phrase-row__text phrase-arc-text">
          {phrase.analysis ? renderPattern(phrase.analysis.pattern) : phrase.text}
        </span>
        <PracticeAction highlighted={isLearningNow} onClick={() => onOpen(phrase)} />
        {!isLibrary && <span className="phrase-row__sub">{practiceSubtitle(phrase, isLearningNow)}</span>}
        {surface === "practice" && phrase.context && <span className="sr-only">{phrase.context}</span>}
      </div>

      {isLibrary && <span className="phrase-row__ipa">{phrase.analysis?.ipa}</span>}

      <div className="phrase-row__actions">
        {isLibrary
          ? <LibraryActions busy={busy} onChangeStatus={onChangeStatus} phrase={phrase} />
          : <PracticeActions busy={busy} onChangeStatus={onChangeStatus} onOpenMenu={onOpenMenu} onRemove={onRemove} phrase={phrase} />}
      </div>
    </article>
  );
}
