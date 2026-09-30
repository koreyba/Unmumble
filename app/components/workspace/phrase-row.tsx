import {
  CONNECTED_SPEECH_MECHANISMS,
  PRACTICE_FORMATS,
} from "@/lib/catalog/connected-speech-catalog";
import { Badge, Button, CheckIcon, IconButton, MoreIcon, PlayIcon, PlusIcon, cx } from "@/app/components/ui";
import type { Phrase, PhraseStatus, Surface } from "./model";

/** Splits "[connected] sounds" style patterns into underlined sound blocks. */
function renderPattern(pattern: string) {
  const parts = pattern.split(/(\[[^\]]+\])/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("[") && part.endsWith("]") ? (
      <span className="sound-block" key={`${part}-${index}`}>{part.slice(1, -1)}</span>
    ) : <span key={`${part}-${index}`}>{part}</span>
  );
}

function PracticeAction({ onClick, highlighted }: { onClick: () => void; highlighted: boolean }) {
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

/** One phrase in the catalog (Library) or in a learning queue (Practice). */
export function PhraseRow({ phrase, surface, busy, moving, onOpen, onChangeStatus, onRemove, onOpenMenu }: PhraseRowProps) {
  const isLibrary = surface === "library";
  const isLearningNow = phrase.status === "learning_now";
  const rankText = phrase.analysis?.rank
    ? String(phrase.analysis.rank).padStart(2, "0")
    : (phrase.sourceType === "custom" ? "—" : "01");
  const forward = forwardAction[phrase.status];

  return (
    <article
      className={cx(
        "phrase-row",
        isLibrary ? "phrase-row--catalog" : "phrase-row--practice",
        isLearningNow && "is-highlighted",
        moving && "is-moving-out",
      )}
    >
      <span className="phrase-row__rank">{rankText}</span>

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
        {isLibrary ? (
          phrase.status === "pick" ? (
            <Button
              collapse
              disabled={busy}
              icon={<PlusIcon size={16} />}
              onClick={() => onChangeStatus(phrase.id, "to_learn")}
              size="sm"
            >
              Add to Learn
            </Button>
          ) : (
            <Badge className="phrase-row__added" title="Added to your list" tone="success">
              <CheckIcon size={14} />
              <span className="phrase-row__added-label">Added</span>
            </Badge>
          )
        ) : (
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
        )}
      </div>
    </article>
  );
}
