"use client";

import { useState, type FormEvent } from "react";
import { PencilIcon, TrashIcon } from "@/app/components/ai-chat-icons";
import { BottomSheet, Button, Field, Notice, TextInput } from "@/app/components/ui";
import { AI_CHAT_TITLE_MAX_CHARACTERS } from "@/lib/ai-chat/contracts";

export type ChatActionMode = "menu" | "rename" | "delete";

type ChatActionsSheetProps = {
  chat: { id: string; title: string; messageCount: number };
  mode: ChatActionMode;
  busy: boolean;
  error: string;
  onModeChange: (mode: ChatActionMode) => void;
  onClose: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
};

/**
 * Row actions for one chat, shown in the shared bottom sheet so the same dialog
 * works on a phone and a desktop: pick an action, then rename inline or confirm
 * the delete. The sheet owns focus, Escape and scroll locking.
 */
export function ChatActionsSheet({
  chat,
  mode,
  busy,
  error,
  onModeChange,
  onClose,
  onRename,
  onDelete,
}: ChatActionsSheetProps) {
  const [title, setTitle] = useState(chat.title);
  const trimmed = title.trim().replace(/\s+/gu, " ");
  const unchanged = trimmed === chat.title;
  const renameFormId = `ai-chat-rename-${chat.id}`;

  function submitRename(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || busy) return;
    if (unchanged) {
      onClose();
      return;
    }
    onRename(trimmed);
  }

  const errorNotice = error ? <Notice tone="danger">{error}</Notice> : null;

  if (mode === "rename") {
    return (
      <BottomSheet
        footer={(
          <div className="ui-sheet__actions ai-chat-sheet-actions">
            <Button disabled={busy} onClick={() => onModeChange("menu")}>Cancel</Button>
            <Button
              disabled={!trimmed}
              form={renameFormId}
              loading={busy}
              type="submit"
              variant="primary"
            >Save name</Button>
          </div>
        )}
        onClose={onClose}
        open
        title="Rename chat"
      >
        <form className="ai-chat-sheet-form" id={renameFormId} onSubmit={submitRename}>
          <Field
            hint={`Up to ${AI_CHAT_TITLE_MAX_CHARACTERS} characters.`}
            htmlFor={`${renameFormId}-title`}
            label="Chat name"
          >
            <TextInput
              autoComplete="off"
              autoFocus
              id={`${renameFormId}-title`}
              maxLength={AI_CHAT_TITLE_MAX_CHARACTERS}
              onChange={(event) => setTitle(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              value={title}
            />
          </Field>
          {errorNotice}
        </form>
      </BottomSheet>
    );
  }

  if (mode === "delete") {
    return (
      <BottomSheet
        footer={(
          <div className="ui-sheet__actions ai-chat-sheet-actions">
            <Button disabled={busy} onClick={() => onModeChange("menu")}>Keep chat</Button>
            <Button
              icon={<TrashIcon />}
              loading={busy}
              onClick={onDelete}
              variant="danger"
            >Delete chat</Button>
          </div>
        )}
        onClose={onClose}
        open
        subtitle={(
          <>
            <strong className="ai-chat-sheet-chat-name">{chat.title}</strong> and its{" "}
            {chat.messageCount} {chat.messageCount === 1 ? "message" : "messages"} will be removed
            for good. Words you already added to learning stay in your library.
          </>
        )}
        title="Delete this chat?"
      >
        {errorNotice}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet onClose={onClose} open subtitle="Chat actions" title={chat.title}>
      <div className="ai-chat-sheet-menu">
        <Button
          block
          icon={<PencilIcon />}
          onClick={() => {
            setTitle(chat.title);
            onModeChange("rename");
          }}
        >Rename</Button>
        <Button block icon={<TrashIcon />} onClick={() => onModeChange("delete")} quietDanger>
          Delete chat
        </Button>
      </div>
    </BottomSheet>
  );
}
