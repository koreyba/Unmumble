import { BottomSheet, Button } from "@/app/components/ui";
import type { Phrase, PhraseStatus } from "./model";

const forwardActions: Partial<Record<PhraseStatus, { label: string; next: PhraseStatus }>> = {
  to_learn: { label: "Move to Learning Now", next: "learning_now" },
  learning_now: { label: "Mark as Learned", next: "learnt" },
  learnt: { label: "Learn Again", next: "learning_now" },
};

/** Row actions for touch screens, where the inline buttons are replaced by a "⋯" menu. */
export function PhraseOptionsSheet({
  phrase,
  busy,
  onClose,
  onChangeStatus,
  onRemove,
}: {
  phrase: Phrase | null;
  busy: boolean;
  onClose: () => void;
  onChangeStatus: (id: string, status: PhraseStatus) => void;
  onRemove: (phrase: Phrase) => Promise<void> | void;
}) {
  const forward = phrase ? forwardActions[phrase.status] : undefined;

  return (
    <BottomSheet
      onClose={onClose}
      open={Boolean(phrase)}
      subtitle={phrase?.translation || phrase?.context || undefined}
      title={phrase?.text}
    >
      {phrase && (
        <div className="ui-sheet__actions">
          {forward && (
            <Button
              block
              disabled={busy}
              onClick={() => {
                onClose();
                onChangeStatus(phrase.id, forward.next);
              }}
              size="lg"
              variant="primary"
            >
              {forward.label}
            </Button>
          )}
          <Button
            block
            disabled={busy}
            onClick={async () => {
              await onRemove(phrase);
              onClose();
            }}
            size="lg"
            variant="danger"
          >
            Remove from Library
          </Button>
          <Button block onClick={onClose} size="lg">Cancel</Button>
        </div>
      )}
    </BottomSheet>
  );
}
