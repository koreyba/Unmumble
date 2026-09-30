"use client";

import {
  type UIEvent as ReactUIEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowDownIcon, MenuIcon, RetryIcon, SparkleIcon } from "@/app/components/ai-chat-icons";
import { ChatSelectionActions } from "@/app/components/ai-chat-selection-actions";
import { AiChatComposer } from "@/app/components/ai-chat-composer";
import { AiChatWriteProposal } from "@/app/components/ai-chat-write-proposal";
import { InteractiveEnglishText } from "@/app/components/interactive-english-text";
import { Badge, Button, EmptyState, Notice } from "@/app/components/ui";
import {
  useAiChatTurnController,
  type AiChatRefreshOptions,
} from "@/app/components/use-ai-chat-turn-controller";
import {
  aiChatUiMessageText,
  type AiChatClientDetail,
  type AiChatUiMetadata,
} from "@/lib/ai-chat/client";
import { aiChatApiError, requestAiChatJson } from "@/lib/ai-chat/client-http";
import { isSameChatSelection, type ChatTextSelection } from "@/lib/ai-chat/selection";

function generationFailureMessage(metadata: AiChatUiMetadata | undefined) {
  return aiChatApiError(
    { error: { code: metadata?.errorCode || undefined } },
    "The response failed.",
    metadata?.terminal || null,
  );
}

export function ChatConversation({
  chat,
  draft,
  generationConfigured,
  onDraftChange,
  onOpenSidebar,
  refresh,
  sidebarOpen,
}: {
  chat: AiChatClientDetail;
  draft: string;
  generationConfigured: boolean;
  onDraftChange: (value: string) => void;
  onOpenSidebar: () => void;
  refresh: (signal?: AbortSignal, options?: AiChatRefreshOptions) => Promise<AiChatClientDetail | null>;
  sidebarOpen: boolean;
}) {
  const [selection, setSelection] = useState<ChatTextSelection | null>(null);
  const [following, setFollowing] = useState(true);
  const [proposalDecision, setProposalDecision] = useState<{
    proposalId: string;
    decision: "confirm" | "cancel";
  } | null>(null);
  const [proposalErrors, setProposalErrors] = useState<Record<string, string>>({});
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const followLatest = useCallback(() => setFollowing(true), []);
  const {
    cancelling,
    messages,
    recoverableOutbound,
    retry,
    retryRecoverableOutbound,
    sendDraft,
    status,
    stopPendingTurn,
    turnBusy,
    turnControlError,
    turnRecoveryNotice,
    updateDraft,
    waitingForResponse,
  } = useAiChatTurnController({
    chat,
    draft,
    generationConfigured,
    onDraftChange,
    onFollowLatest: followLatest,
    refresh,
  });

  // Messages that were already in the chat when it opened do not animate in.
  const [openingMessageIds] = useState(() => new Set(messages.map((message) => message.id)));

  useEffect(() => {
    if (following) messageEnd.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [following, messages, status]);

  useEffect(() => {
    const dismiss = () => setSelection(null);
    window.addEventListener("resize", dismiss);
    return () => window.removeEventListener("resize", dismiss);
  }, []);

  async function decideWriteProposal(
    proposalId: string,
    command: { decision: "confirm" | "cancel" },
  ) {
    const { decision } = command;
    if (proposalDecision) return;
    setProposalDecision({ proposalId, decision });
    setProposalErrors((current) => ({ ...current, [proposalId]: "" }));
    try {
      await requestAiChatJson(`/api/ai/chats/${chat.id}/write-proposals/${proposalId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      await refresh();
    } catch (decisionError) {
      setProposalErrors((current) => ({
        ...current,
        [proposalId]: decisionError instanceof Error
          ? decisionError.message
          : "The proposal could not be updated. Try again.",
      }));
    } finally {
      setProposalDecision(null);
    }
  }

  function handleMessageScroll(event: ReactUIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    setFollowing(nearBottom);
    if (selection) setSelection(null);
  }

  function chooseText(
    messageId: string,
    text: string,
    context: string,
    anchor: ChatTextSelection["anchor"],
  ) {
    const next = { messageId, text, context, anchor };
    setSelection((current) => isSameChatSelection(current, next) ? current : next);
  }

  return (
    <section className="ai-chat-conversation" aria-label={`Conversation: ${chat.title}`}>
      <header className="ai-chat-conversation-header">
        <Button
          aria-controls="ai-chat-sidebar"
          aria-expanded={sidebarOpen}
          className="ai-chat-mobile-chats"
          icon={<MenuIcon />}
          onClick={onOpenSidebar}
        >
          Chats
        </Button>
        <div className="ai-chat-conversation-title">
          <span className="ai-chat-conversation-label">Vocabulary practice</span>
          <h2>{chat.title}</h2>
        </div>
        <Badge
          aria-live="polite"
          className={`ai-chat-generation-status ${turnBusy ? "busy" : ""}`}
          role="status"
          tone={turnBusy ? "warning" : "success"}
        >
          {cancelling
            ? "Stopping…"
            : status === "submitted"
            ? "Thinking…"
            : status === "streaming"
              ? "Responding…"
              : waitingForResponse ? "Waiting…" : "Ready"}
        </Badge>
      </header>

      <div className="ai-chat-log">
        <div
          aria-live="polite"
          aria-relevant="additions text"
          className="ai-chat-messages"
          onScroll={handleMessageScroll}
          role="log"
        >
          {messages.length === 0 ? (
            <EmptyState
              className="ai-chat-empty"
              description="Ask for examples, another context, an explanation, or a translation exercise."
              icon={<SparkleIcon />}
              title="You lead the practice"
            />
          ) : messages.map((message) => {
            const text = aiChatUiMessageText(message);
            const failed = message.metadata?.status === "failed";
            const writeProposals = (chat.writeProposals || []).filter(
              (proposal) => proposal.assistantMessageId === message.id,
            );
            return (
              <article
                className={`ai-chat-message ${message.role}${openingMessageIds.has(message.id) ? "" : " ai-chat-message-enter"}`}
                key={message.id}
              >
                <span className="ai-chat-message-role">{message.role === "user" ? "You" : "Unmumble AI"}</span>
                {text ? (
                  <div className="ai-chat-message-text" data-chat-message-id={message.id}>
                    <InteractiveEnglishText
                      markdown={message.role === "assistant"}
                      maxSelectionCharacters={500}
                      onPhraseSelect={(phrase, context, details) => chooseText(
                        message.id,
                        phrase,
                        context,
                        details.anchor,
                      )}
                      onWordActivate={(word, context, details) => chooseText(
                        message.id,
                        word,
                        context,
                        details.anchor,
                      )}
                      text={text}
                    />
                  </div>
                ) : !failed ? (
                  <span className="ai-chat-thinking">
                    <span aria-hidden="true" className="ai-chat-typing"><i /><i /><i /></span>
                    <span className="ai-chat-visually-hidden">Preparing a response…</span>
                  </span>
                ) : null}
                {failed && (
                  <Notice
                    action={(
                      <Button
                        disabled={turnBusy || !generationConfigured}
                        icon={<RetryIcon />}
                        onClick={() => void retry(message.metadata!.clientMessageId)}
                      >Retry</Button>
                    )}
                    className="ai-chat-message-failure"
                    tone="danger"
                  >
                    {generationFailureMessage(message.metadata)}
                  </Notice>
                )}
                {writeProposals.map((proposal) => {
                  const deciding = proposalDecision?.proposalId === proposal.id;
                  const errorMessage = proposalErrors[proposal.id]
                    || (proposal.errorCode === "mutation_conflict"
                      ? "Your vocabulary changed after this proposal was prepared. Nothing was overwritten."
                      : undefined);
                  return (
                    <AiChatWriteProposal
                      errorMessage={errorMessage}
                      items={proposal.items}
                      key={proposal.id}
                      onCancel={(proposalId) => void decideWriteProposal(proposalId, {
                        decision: "cancel",
                      })}
                      onConfirm={(proposalId) => void decideWriteProposal(proposalId, {
                        decision: "confirm",
                      })}
                      operation={proposal.operation}
                      proposalId={proposal.id}
                      result={proposal.result}
                      status={deciding ? "busy" : proposal.status}
                    />
                  );
                })}
              </article>
            );
          })}
          {status === "submitted" && messages[messages.length - 1]?.role === "user" && (
            <article className="ai-chat-message assistant ai-chat-message-enter">
              <span className="ai-chat-message-role">Unmumble AI</span>
              <span className="ai-chat-thinking">
                <span aria-hidden="true" className="ai-chat-typing"><i /><i /><i /></span>
                <span className="ai-chat-visually-hidden">Preparing a response…</span>
              </span>
            </article>
          )}
          <div aria-hidden="true" className="ai-chat-message-end" ref={messageEnd} />
        </div>

        {!following && (
          <Button
            className="ai-chat-jump-latest"
            icon={<ArrowDownIcon />}
            onClick={() => {
              setFollowing(true);
              const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              messageEnd.current?.scrollIntoView({
                behavior: reduceMotion ? "auto" : "smooth",
                block: "end",
              });
            }}
            pill
            size="sm"
          >Jump to latest</Button>
        )}
      </div>

      {selection && (
        <ChatSelectionActions
          key={`${selection.messageId}:${selection.text}:${selection.context}`}
          onDismiss={() => setSelection(null)}
          selection={selection}
        />
      )}

      <AiChatComposer
        cancelling={cancelling}
        chatId={chat.id}
        draft={draft}
        generationConfigured={generationConfigured}
        onDraftChange={updateDraft}
        onExpand={() => setSelection(null)}
        onRetryRecoverable={() => void retryRecoverableOutbound()}
        onSend={sendDraft}
        onStop={stopPendingTurn}
        showRecoverableOutbound={Boolean(recoverableOutbound)}
        turnBusy={turnBusy}
        turnControlError={turnControlError}
        turnRecoveryNotice={turnRecoveryNotice}
      />
    </section>
  );
}
