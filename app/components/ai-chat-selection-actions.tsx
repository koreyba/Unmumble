"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { BookmarkPlusIcon, CloseIcon, TranslateIcon } from "@/app/components/ai-chat-icons";
import { Button, IconButton } from "@/app/components/ui";
import {
  classifyInteractiveSelection,
  isSingleInteractiveEnglishWord,
} from "@/lib/interactive-english-text";
import {
  canAddChatSelection,
  canTranslateChatSelection,
  chatPhrasePayload,
  chatTranslationPayload,
  chatVocabularyStatusLabel,
  type ChatTextSelection,
} from "@/lib/ai-chat/selection";

type ApiError = { error?: string | { code?: string } };

type PhraseResponse = {
  status: string;
  translationPending?: boolean;
};

async function postJson<T>(url: string, payload: object, signal?: AbortSignal) {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const body = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) {
    const message = typeof body.error === "string"
      ? body.error
      : "The request could not be completed.";
    throw new Error(message);
  }
  return body;
}

export function ChatSelectionActions({
  selection,
  onDismiss,
}: Readonly<{
  selection: ChatTextSelection;
  onDismiss: () => void;
}>) {
  const identity = `${selection.messageId}\u0000${selection.text}\u0000${selection.context}`;
  return (
    <ChatSelectionActionPanel
      key={identity}
      onDismiss={onDismiss}
      selection={selection}
    />
  );
}

function ChatSelectionActionPanel({
  selection,
  onDismiss,
}: Readonly<{
  selection: ChatTextSelection;
  onDismiss: () => void;
}>) {
  const [translation, setTranslation] = useState("");
  const [translationError, setTranslationError] = useState("");
  const [translating, setTranslating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const translationController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const composition = useMemo(
    () => classifyInteractiveSelection(selection.text),
    [selection.text],
  );
  const selectionLabel = composition === "mixed"
    ? "Mixed text"
    : isSingleInteractiveEnglishWord(selection.text)
      ? "Word"
      : composition === "latin"
        ? "Selected phrase"
        : "Selected text";
  const canTranslate = canTranslateChatSelection(selection);
  const canAdd = canAddChatSelection(selection);
  const placeAbove = selection.anchor.top > 220;
  const style = {
    "--ai-chat-selection-x": `${(selection.anchor.left + selection.anchor.right) / 2}px`,
    "--ai-chat-selection-y": `${placeAbove ? selection.anchor.top : selection.anchor.bottom}px`,
  } as CSSProperties;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      translationController.current?.abort();
    };
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onDismiss();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onDismiss, saving]);

  async function translate() {
    if (!canTranslate || translating) return;
    const snapshot = selection;
    translationController.current?.abort();
    const controller = new AbortController();
    translationController.current = controller;
    setTranslating(true);
    setTranslationError("");
    setSaveMessage("");
    setSaveError("");
    try {
      const result = await postJson<{ translation?: string }>(
        "/api/translate",
        chatTranslationPayload(snapshot),
        controller.signal,
      );
      if (!mounted.current) return;
      setTranslation(result.translation?.trim() || "");
      if (!result.translation?.trim()) setTranslationError("DeepL returned an empty translation.");
    } catch (error) {
      if (controller.signal.aborted || !mounted.current) return;
      setTranslationError(error instanceof Error ? error.message : "Could not translate this selection.");
    } finally {
      if (mounted.current && translationController.current === controller) {
        translationController.current = null;
        setTranslating(false);
      }
    }
  }

  async function addToLearning() {
    if (!canAdd || saving) return;
    const snapshot = selection;
    setSaving(true);
    setSaveMessage("");
    setSaveError("");
    try {
      const result = await postJson<PhraseResponse>(
        "/api/phrases",
        chatPhrasePayload(snapshot, translation),
      );
      if (!mounted.current) return;
      const category = chatVocabularyStatusLabel(result.status);
      setSaveMessage(result.translationPending
        ? `Saved in ${category}. A translation is not available yet.`
        : `Saved in ${category}.`);
    } catch (error) {
      if (!mounted.current) return;
      setSaveError(error instanceof Error ? error.message : "Could not save this selection.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  const addLimitMessage = !canAdd
    ? "Select 240 characters or fewer to add this text. You can still translate up to 500."
    : "";

  return (
    <aside
      aria-label="Selected text actions"
      className={`ai-chat-selection-actions ${placeAbove ? "above" : "below"}`}
      role="toolbar"
      style={style}
    >
      <div className="ai-chat-selection-heading">
        <span>{selectionLabel}</span>
        <IconButton
          className="ai-chat-selection-close"
          disabled={saving}
          label="Close selected text actions"
          onClick={onDismiss}
          variant="ghost"
        >
          <CloseIcon />
        </IconButton>
      </div>
      <blockquote>{selection.text}</blockquote>
      {composition === "mixed" && (
        <p className="ai-chat-selection-note">Mixed-language text will be saved as one phrase.</p>
      )}
      {translation && (
        <p className="ai-chat-selection-translation" role="status">
          <span>DeepL</span>
          <strong>{translation}</strong>
        </p>
      )}
      {translationError && <p className="ai-chat-selection-error" role="alert">{translationError}</p>}
      {addLimitMessage && <p className="ai-chat-selection-note" id="ai-chat-add-limit">{addLimitMessage}</p>}
      {saveError && <p className="ai-chat-selection-error" role="alert">{saveError}</p>}
      {saveMessage && <p className="ai-chat-selection-status" role="status">{saveMessage}</p>}
      <div className="ai-chat-selection-buttons">
        <Button
          disabled={!canTranslate}
          icon={<TranslateIcon />}
          loading={translating}
          onClick={() => void translate()}
        >
          {translating ? "Translating…" : "Translate"}
        </Button>
        <Button
          aria-describedby={addLimitMessage ? "ai-chat-add-limit" : undefined}
          disabled={!canAdd}
          icon={<BookmarkPlusIcon />}
          loading={saving}
          onClick={() => void addToLearning()}
          variant="primary"
        >{saving ? "Adding…" : "Add to learning"}</Button>
      </div>
    </aside>
  );
}
