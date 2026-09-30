"use client";

import { useId, useState } from "react";
import { BookmarkPlusIcon } from "@/app/components/ai-chat-icons";
import { Button, Notice } from "@/app/components/ui";

export type AiWriteProposalOperation =
  | "add_vocabulary_entries"
  | "add_vocabulary_meaning"
  | "update_vocabulary_meaning"
  | "set_vocabulary_category"
  | "change_vocabulary_state"
  | "vocabulary_change_set";

export type AiWriteProposalActionType =
  | "add_entry"
  | "add_meaning"
  | "update_meaning"
  | "change_state";

export type AiWriteProposalStatus =
  | "pending"
  | "busy"
  | "confirmed"
  | "cancelled"
  | "failed";

export type AiWriteProposalItem = Readonly<{
  id: string;
  text: string;
  actionType?: AiWriteProposalActionType;
  translation?: string;
  context?: string;
  previousTranslation?: string;
  fromCategory?: string;
  toCategory?: string;
}>;

export type AiWriteProposalProps = Readonly<{
  proposalId: string;
  operation: AiWriteProposalOperation;
  items: readonly AiWriteProposalItem[];
  status: AiWriteProposalStatus;
  result?: unknown;
  errorMessage?: string;
  collapsedItemCount?: number;
  onConfirm?: (proposalId: string) => void;
  onCancel?: (proposalId: string) => void;
}>;

function entryCountLabel(count: number) {
  return `${count} ${count === 1 ? "entry" : "entries"}`;
}

function changeCountLabel(count: number) {
  return `${count} ${count === 1 ? "change" : "changes"}`;
}

const changeSetGroups = [
  { actionType: "add_entry", label: "Add" },
  { actionType: "add_meaning", label: "Add meaning" },
  { actionType: "update_meaning", label: "Update meaning" },
  { actionType: "change_state", label: "Move / remove" },
] as const satisfies readonly {
  actionType: AiWriteProposalActionType;
  label: string;
}[];

function isRemovalProposal(
  operation: AiWriteProposalOperation,
  items: readonly AiWriteProposalItem[],
) {
  return operation === "change_vocabulary_state"
    && items.length > 0
    && items.every((item) => item.toCategory === "removed");
}

function categoryLabel(category: string) {
  if (category === "to_learn") return "To Learn";
  if (category === "learning") return "Learning";
  if (category === "learned") return "Learned";
  if (category === "removed") return "Removed from Practice";
  return category;
}

function ProposalItem({ item }: Readonly<{ item: AiWriteProposalItem }>) {
  return (
    <li>
      <strong>{item.text}</strong>
      {item.previousTranslation && item.translation ? (
        <span>{item.previousTranslation} → {item.translation}</span>
      ) : item.translation ? <span>{item.translation}</span> : null}
      {item.fromCategory && item.toCategory && (
        <span>{categoryLabel(item.fromCategory)} → {categoryLabel(item.toCategory)}</span>
      )}
    </li>
  );
}

function proposalTitle(operation: AiWriteProposalOperation, removal: boolean) {
  if (operation === "vocabulary_change_set") return "Review vocabulary changes";
  if (removal) return "Remove from Practice";
  if (operation === "add_vocabulary_meaning") return "Add meaning";
  if (operation === "update_vocabulary_meaning") return "Update meaning";
  if (
    operation === "set_vocabulary_category"
    || operation === "change_vocabulary_state"
  ) return "Change learning status";
  return "Add to vocabulary";
}

function proposalStatusMessage(
  operation: AiWriteProposalOperation,
  status: AiWriteProposalStatus,
  count: number,
  errorMessage: string | undefined,
  result: unknown,
  removal: boolean,
) {
  if (operation === "vocabulary_change_set") {
    if (status === "busy") return "Applying changes…";
    if (status === "confirmed") return "Vocabulary changes applied.";
    if (status === "cancelled") {
      return "Proposal cancelled. No vocabulary changes were made.";
    }
    if (status === "failed") {
      return errorMessage?.trim() || "The vocabulary changes could not be completed.";
    }
    return `Review ${count} vocabulary ${count === 1 ? "change" : "changes"} before applying ${count === 1 ? "it" : "them"}.`;
  }
  const entries = entryCountLabel(count);
  if (removal) {
    if (status === "busy") return "Applying your decision…";
    if (status === "confirmed") return `${entries} removed from Practice.`;
    if (status === "cancelled") {
      return "Removal cancelled. Nothing was removed from Practice.";
    }
    if (status === "failed") {
      return errorMessage?.trim() || "The selected entries could not be removed from Practice.";
    }
    if (errorMessage?.trim()) {
      return "The request did not complete. Review the list, then choose Cancel or Confirm again.";
    }
    return `Review ${entries} before removing ${count === 1 ? "it" : "them"} from Practice.`;
  }
  if (status === "busy") return "Applying change…";
  if (status === "confirmed") {
    if (operation !== "add_vocabulary_entries") return "Vocabulary updated.";
    const resultEntries = result && typeof result === "object" && !Array.isArray(result)
      ? (result as { entries?: unknown }).entries
      : null;
    if (Array.isArray(resultEntries)) {
      const added = resultEntries.filter((entry) => (
        entry && typeof entry === "object" && (entry as { state?: unknown }).state === "added"
      )).length;
      const saved = resultEntries.filter((entry) => (
        entry && typeof entry === "object"
        && (entry as { state?: unknown }).state === "already_saved"
      )).length;
      if (added > 0 && saved > 0) {
        return `${entryCountLabel(added)} added · ${saved} already saved.`;
      }
      if (added > 0) return `${entryCountLabel(added)} added to your vocabulary.`;
      if (saved > 0) return `${entryCountLabel(saved)} already saved.`;
    }
    return "Vocabulary update confirmed.";
  }
  if (status === "cancelled") {
    return "Proposal cancelled. No vocabulary changes were made.";
  }
  if (status === "failed") {
    return errorMessage?.trim() || "The proposal could not be completed.";
  }
  if (operation === "add_vocabulary_meaning") {
    return "Review this meaning before adding it.";
  }
  if (operation === "update_vocabulary_meaning") return "Review this meaning change.";
  if (operation === "set_vocabulary_category") {
    return "Review this learning-status change.";
  }
  return `Review ${entries} before adding ${count === 1 ? "it" : "them"}.`;
}

type ChangeSetGroup = Readonly<{
  actionType: AiWriteProposalActionType;
  label: string;
  items: readonly AiWriteProposalItem[];
}>;

function groupChangeSetItems(items: readonly AiWriteProposalItem[]): ChangeSetGroup[] {
  return changeSetGroups
    .map((group) => ({
      ...group,
      items: items.filter((item) => item.actionType === group.actionType),
    }))
    .filter((group) => group.items.length > 0);
}

/** A collapsed change set still previews every action group before it lists more items. */
function visibleChangeSetItems(
  groups: readonly ChangeSetGroup[],
  previewCount: number,
  collapsed: boolean,
) {
  const spareSlots = Math.max(0, previewCount - groups.length);
  return groups.map((group, groupIndex) => {
    if (!collapsed) return { ...group, visibleItems: group.items };
    const previousGroupCapacity = groups
      .slice(0, groupIndex)
      .reduce((total, previousGroup) => total + previousGroup.items.length - 1, 0);
    const additionalItemCount = Math.min(
      group.items.length - 1,
      Math.max(0, spareSlots - previousGroupCapacity),
    );
    return { ...group, visibleItems: group.items.slice(0, additionalItemCount + 1) };
  });
}

function statusPresentation(status: AiWriteProposalStatus) {
  if (status === "failed") return { role: "alert", tone: "danger" } as const;
  if (status === "confirmed") return { role: "status", tone: "success" } as const;
  return { role: "status", tone: null } as const;
}

function confirmLabel(busy: boolean, isChangeSet: boolean) {
  if (busy) return "Applying…";
  return isChangeSet ? "Confirm changes" : "Confirm";
}

function ProposalStatus({ message, status }: Readonly<{
  message: string;
  status: AiWriteProposalStatus;
}>) {
  const { role, tone } = statusPresentation(status);
  const live = role === "alert" ? "assertive" : "polite";
  if (tone) {
    return (
      <Notice aria-live={live} className="ai-chat-write-proposal-status" role={role} tone={tone}>
        {message}
      </Notice>
    );
  }
  return <p aria-live={live} className="ai-chat-write-proposal-status" role={role}>{message}</p>;
}

function ProposalActions({ busy, isChangeSet, proposalId, onCancel, onConfirm }: Readonly<{
  busy: boolean;
  isChangeSet: boolean;
  proposalId: string;
  onCancel?: (proposalId: string) => void;
  onConfirm?: (proposalId: string) => void;
}>) {
  return (
    <div className="ai-chat-write-proposal-actions">
      <Button
        disabled={busy}
        onClick={() => onCancel?.(proposalId)}
      >Cancel</Button>
      <Button
        disabled={busy}
        loading={busy}
        onClick={() => onConfirm?.(proposalId)}
        variant="primary"
      >{confirmLabel(busy, isChangeSet)}</Button>
    </div>
  );
}

export function AiChatWriteProposal({
  proposalId,
  collapsedItemCount = 3,
  errorMessage,
  items,
  operation,
  onCancel,
  onConfirm,
  result,
  status,
}: AiWriteProposalProps) {
  const titleId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const count = items.length;
  const isChangeSet = operation === "vocabulary_change_set";
  const removal = isRemovalProposal(operation, items);
  const previewCount = Math.max(1, Math.floor(collapsedItemCount));
  const groups = isChangeSet ? groupChangeSetItems(items) : [];
  const previewLimit = isChangeSet ? Math.max(previewCount, groups.length) : previewCount;
  const expandable = count > previewLimit;
  const collapsed = expandable && !expanded;
  const visibleItems = !isChangeSet && collapsed ? items.slice(0, previewCount) : items;
  const visibleGroups = visibleChangeSetItems(groups, previewCount, collapsed);
  const visibleItemCount = isChangeSet
    ? visibleGroups.reduce((total, group) => total + group.visibleItems.length, 0)
    : visibleItems.length;
  const busy = status === "busy";
  const showActions = status === "pending" || busy;
  const statusMessage = proposalStatusMessage(operation, status, count, errorMessage, result, removal);

  return (
    <section
      aria-busy={busy}
      aria-labelledby={titleId}
      className="ai-chat-write-proposal"
      data-ai-write-proposal={proposalId}
      data-status={status}
    >
      <header className="ai-chat-write-proposal-heading">
        <span aria-hidden="true" className="ai-chat-write-proposal-icon"><BookmarkPlusIcon /></span>
        <div>
          <h3 id={titleId}>{proposalTitle(operation, removal)}</h3>
          <p className="ai-chat-write-proposal-count">
            {isChangeSet ? changeCountLabel(count) : entryCountLabel(count)}
          </p>
        </div>
      </header>

      {isChangeSet ? (
        <div className="ai-chat-write-proposal-groups" id={listId}>
          {visibleGroups.map((group) => (
            <section
              className="ai-chat-write-proposal-group"
              data-action-group={group.actionType}
              key={group.actionType}
            >
              <h4>
                <span>{group.label}</span>
                <span>{changeCountLabel(group.items.length)}</span>
              </h4>
              <ol className="ai-chat-write-proposal-items">
                {group.visibleItems.map((item) => (
                  <ProposalItem item={item} key={item.id} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <ol className="ai-chat-write-proposal-items" id={listId}>
          {visibleItems.map((item) => (
            <ProposalItem item={item} key={item.id} />
          ))}
        </ol>
      )}

      {expandable && (
        <Button
          aria-controls={listId}
          aria-expanded={expanded}
          className="ai-chat-write-proposal-toggle"
          onClick={() => setExpanded((value) => !value)}
          variant="ghost"
        >{expanded ? "Show fewer" : `Show ${count - visibleItemCount} more`}</Button>
      )}

      <ProposalStatus message={statusMessage} status={status} />

      {showActions && errorMessage && (
        <Notice
          aria-live="assertive"
          className="ai-chat-write-proposal-error"
          role="alert"
          tone="danger"
        >
          {errorMessage}
        </Notice>
      )}

      {showActions && (
        <ProposalActions
          busy={busy}
          isChangeSet={isChangeSet}
          onCancel={onCancel}
          onConfirm={onConfirm}
          proposalId={proposalId}
        />
      )}
    </section>
  );
}
