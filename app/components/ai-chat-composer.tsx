"use client";

import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ExpandIcon, SendIcon, StopIcon, CloseIcon } from "@/app/components/ai-chat-icons";
import { Button, IconButton, Notice } from "@/app/components/ui";
import {
  readComposerSelection,
  restoreComposerSelection,
  type ComposerSelection,
} from "@/lib/ai-chat/composer-selection";

type AiChatComposerProps = Readonly<{
  cancelling: boolean;
  chatId: string;
  draft: string;
  generationConfigured: boolean;
  onDraftChange: (value: string) => void;
  onExpand: () => void;
  onRetryRecoverable: () => void;
  onSend: () => void | Promise<void>;
  onStop: () => void;
  showRecoverableOutbound: boolean;
  turnBusy: boolean;
  turnControlError: string;
  turnRecoveryNotice: string;
}>;

/** The expanded editor sends with the platform's own modifier: ⌘ on Apple devices, Ctrl elsewhere. */
function sendShortcutLabel() {
  if (typeof navigator === "undefined") return "Ctrl+Enter";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad|ipod/iu.test(platform) ? "⌘+Enter" : "Ctrl+Enter";
}

const COMPACT_MAX_HEIGHT = 116;
const MULTILINE_THRESHOLD = 56;

export function AiChatComposer({
  cancelling,
  chatId,
  draft,
  generationConfigured,
  onDraftChange,
  onExpand,
  onRetryRecoverable,
  onSend,
  onStop,
  showRecoverableOutbound,
  turnBusy,
  turnControlError,
  turnRecoveryNotice,
}: AiChatComposerProps) {
  const [expanded, setExpanded] = useState(false);
  // The expand control only earns its space once the draft wraps onto a second line.
  const [multiline, setMultiline] = useState(false);
  const compactComposer = useRef<HTMLTextAreaElement | null>(null);
  const expandedComposer = useRef<HTMLTextAreaElement | null>(null);
  const composerSelection = useRef<ComposerSelection | null>(null);
  const composerHasExpanded = useRef(false);
  const composerDialog = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const input = compactComposer.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(44, Math.min(input.scrollHeight, COMPACT_MAX_HEIGHT))}px`;
    // Overflowing drafts scroll inside the field; the scrollbar itself stays hidden in CSS.
    input.style.overflowY = input.scrollHeight > COMPACT_MAX_HEIGHT ? "auto" : "hidden";
    setMultiline(input.scrollHeight > MULTILINE_THRESHOLD);
  }, [draft]);

  useEffect(() => {
    if (!expanded) {
      if (!composerHasExpanded.current) return;
      const frame = window.requestAnimationFrame(() => {
        restoreComposerSelection(compactComposer.current, composerSelection.current);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    composerHasExpanded.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      restoreComposerSelection(expandedComposer.current, composerSelection.current);
    });

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        composerSelection.current = readComposerSelection(expandedComposer.current);
        setExpanded(false);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = composerDialog.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void onSend();
    // A mouse click on Send moves focus onto a button that is replaced while the reply
    // streams; hand it back to the field. Touch keeps the keyboard state the user chose.
    if (!window.matchMedia("(pointer: coarse)").matches) {
      compactComposer.current?.focus({ preventScroll: true });
    }
  }

  function submitExpanded(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || turnBusy || !generationConfigured) return;
    composerSelection.current = readComposerSelection(expandedComposer.current);
    setExpanded(false);
    void onSend();
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter"
      || event.shiftKey
      || event.nativeEvent.isComposing
      || window.matchMedia("(pointer: coarse)").matches
    ) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function handleExpandedComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter"
      || (!event.metaKey && !event.ctrlKey)
      || event.nativeEvent.isComposing
    ) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  const showExpand = Boolean(draft) && multiline;
  // Only read while the dialog is open, so it never renders during server rendering.
  const sendShortcut = expanded ? sendShortcutLabel() : "Ctrl+Enter";

  return (
    <>
      <div className="ai-chat-composer-region">
        <div className="ai-chat-composer-notices">
          {!generationConfigured && (
            <Notice className="ai-chat-inline-error" role="status" tone="warning">
              AI generation is not configured on the server.
            </Notice>
          )}
          {turnControlError && (
            <Notice className="ai-chat-inline-error" tone="danger">{turnControlError}</Notice>
          )}
          {turnRecoveryNotice && (
            <Notice className="ai-chat-inline-notice" tone="info">{turnRecoveryNotice}</Notice>
          )}
          {showRecoverableOutbound && (
            <Notice
              action={(
                <Button
                  disabled={turnBusy || !generationConfigured}
                  onClick={onRetryRecoverable}
                >Retry message</Button>
              )}
              className="ai-chat-outbound-recovery"
              tone="danger"
            >
              Your previous message is available to retry safely. Your current draft is unchanged.
            </Notice>
          )}
        </div>
        <form className="ai-chat-composer" onSubmit={submit}>
          <label className="ai-chat-visually-hidden" htmlFor={`ai-chat-message-${chatId}`}>
            Your practice request
          </label>
          <div className={`ai-chat-composer-field ${draft ? "has-draft" : ""} ${showExpand ? "is-multiline" : ""}`}>
            <textarea
              disabled={!generationConfigured}
              id={`ai-chat-message-${chatId}`}
              maxLength={4_000}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Message Unmumble…"
              ref={compactComposer}
              rows={1}
              value={draft}
            />
            {showExpand && (
              <IconButton
                aria-expanded={expanded}
                aria-haspopup="dialog"
                className="ai-chat-composer-expand"
                label="Expand composer"
                onClick={() => {
                  composerSelection.current = readComposerSelection(compactComposer.current);
                  onExpand();
                  setExpanded(true);
                }}
                variant="ghost"
              >
                <ExpandIcon />
              </IconButton>
            )}
          </div>
          {turnBusy ? (
            <IconButton
              className="ai-chat-stop"
              disabled={cancelling}
              label={cancelling ? "Stopping response" : "Stop response"}
              loading={cancelling}
              onClick={onStop}
              pill
              variant="danger"
            >
              <StopIcon />
            </IconButton>
          ) : (
            <IconButton
              className="ai-chat-send"
              disabled={!draft.trim() || !generationConfigured}
              label="Send message"
              pill
              type="submit"
              variant="primary"
            >
              <SendIcon />
            </IconButton>
          )}
        </form>
        <p className="ai-chat-composer-hint">Enter to send · Shift+Enter for a new line</p>
      </div>

      {expanded && (
        <div
          aria-labelledby={`ai-chat-composer-dialog-title-${chatId}`}
          aria-modal="true"
          className="ai-chat-composer-dialog"
          ref={composerDialog}
          role="dialog"
        >
          <header>
            <div>
              <span>AI vocabulary practice</span>
              <h2 id={`ai-chat-composer-dialog-title-${chatId}`}>Compose message</h2>
            </div>
            <IconButton
              label="Close expanded composer"
              onClick={() => {
                composerSelection.current = readComposerSelection(expandedComposer.current);
                setExpanded(false);
              }}
            >
              <CloseIcon />
            </IconButton>
          </header>
          <form className="ai-chat-composer-dialog-editor" onSubmit={submitExpanded}>
            <label className="ai-chat-visually-hidden" htmlFor={`ai-chat-expanded-message-${chatId}`}>
              Expanded practice request
            </label>
            <textarea
              id={`ai-chat-expanded-message-${chatId}`}
              maxLength={4_000}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={handleExpandedComposerKeyDown}
              placeholder="Ask for an example, change the context, or write a longer answer…"
              ref={expandedComposer}
              value={draft}
            />
            <footer>
              <span>{draft.length.toLocaleString()} / 4,000</span>
              <span>{sendShortcut} to send</span>
              <Button
                aria-keyshortcuts="Control+Enter Meta+Enter"
                disabled={!draft.trim() || turnBusy || !generationConfigured}
                size="lg"
                title={`Send message (${sendShortcut})`}
                type="submit"
                variant="primary"
              >
                Send message
                <SendIcon />
              </Button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
