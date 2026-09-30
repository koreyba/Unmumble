"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatConversation } from "@/app/components/ai-chat-conversation";
import { CloseIcon, MessageIcon, MoreIcon, PlusIcon } from "@/app/components/ai-chat-icons";
import { ChatActionsSheet, type ChatActionMode } from "@/app/components/ai-chat-list-actions";
import { Button, Chip, EmptyState, IconButton, ListSkeleton, Notice, Skeleton, Spinner } from "@/app/components/ui";
import type { AiChatRefreshOptions } from "@/app/components/use-ai-chat-turn-controller";
import {
  type AiChatClientDetail,
  type AiChatClientSummary,
} from "@/lib/ai-chat/client";
import { requestAiChatJson } from "@/lib/ai-chat/client-http";

type HistoryMode = "none" | "push" | "replace";

function asSummary(chat: AiChatClientDetail): AiChatClientSummary {
  return {
    id: chat.id,
    title: chat.title,
    explanationLanguage: chat.explanationLanguage,
    targetCount: chat.targetCount,
    messageCount: chat.messageCount,
    preview: chat.preview || "",
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function selectedChatIdFromUrl() {
  return new URL(window.location.href).searchParams.get("chat") || "";
}

function updateChatUrl(chatId: string, mode: Exclude<HistoryMode, "none">) {
  const url = new URL(window.location.href);
  if (chatId) url.searchParams.set("chat", chatId);
  else url.searchParams.delete("chat");
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (mode === "push") window.history.pushState({}, "", next);
  else window.history.replaceState({}, "", next);
}

function chatListTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ChatWorkspace() {
  const [chats, setChats] = useState<AiChatClientSummary[]>([]);
  const [chat, setChat] = useState<AiChatClientDetail | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [generationConfigured, setGenerationConfigured] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openingChatId, setOpeningChatId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [manage, setManage] = useState<{ id: string; mode: ChatActionMode } | null>(null);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState("");
  const bootstrapped = useRef(false);
  const createInFlight = useRef(false);
  const openRequestId = useRef(0);
  const openController = useRef<AbortController | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const sidebarWasOpen = useRef(false);

  // Drawer focus: land on the close control when it opens, hand focus back to the
  // "Chats" trigger when it closes (desktop keeps the list inline and never opens it).
  useEffect(() => {
    if (sidebarOpen) {
      sidebarWasOpen.current = true;
      if (window.matchMedia("(max-width: 980px)").matches) {
        sidebarRef.current?.querySelector<HTMLElement>(".ai-chat-sidebar-close")?.focus({ preventScroll: true });
      }
      return;
    }
    if (!sidebarWasOpen.current) return;
    sidebarWasOpen.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || sidebarRef.current?.contains(active)) {
      document.querySelector<HTMLElement>(".ai-chat-mobile-chats")?.focus({ preventScroll: true });
    }
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen) return;
    function closeSidebarOnEscape(event: KeyboardEvent) {
      // An open actions sheet owns Escape; the drawer waits for the next press.
      if (event.key !== "Escape" || document.querySelector(".ui-sheet")) return;
      event.preventDefault();
      setSidebarOpen(false);
    }
    document.addEventListener("keydown", closeSidebarOnEscape);
    return () => document.removeEventListener("keydown", closeSidebarOnEscape);
  }, [sidebarOpen]);

  const openChat = useCallback(async (chatId: string, historyMode: HistoryMode = "push") => {
    const requestId = ++openRequestId.current;
    openController.current?.abort();
    const controller = new AbortController();
    openController.current = controller;
    setOpeningChatId(chatId);
    setError("");
    try {
      const result = await requestAiChatJson<{ chat: AiChatClientDetail }>(`/api/ai/chats/${chatId}`, {
        signal: controller.signal,
      });
      if (requestId !== openRequestId.current) return;
      setChat(result.chat);
      setSidebarOpen(false);
      if (historyMode !== "none") updateChatUrl(chatId, historyMode);
    } catch (reason) {
      if (controller.signal.aborted || requestId !== openRequestId.current) return;
      setError(reason instanceof Error ? reason.message : "Could not open this chat.");
    } finally {
      if (requestId === openRequestId.current) {
        setOpeningChatId("");
        if (openController.current === controller) openController.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    const requestId = ++openRequestId.current;
    const controller = new AbortController();
    openController.current = controller;
    void (async () => {
      try {
        const list = await requestAiChatJson<{
          chats: AiChatClientSummary[];
          generationConfigured: boolean;
        }>("/api/ai/chats", { signal: controller.signal });
        if (requestId !== openRequestId.current) return;
        setChats(list.chats);
        setGenerationConfigured(list.generationConfigured);
        const requestedId = selectedChatIdFromUrl();
        const targetId = list.chats.some((item) => item.id === requestedId)
          ? requestedId
          : list.chats[0]?.id || "";
        if (!targetId) {
          setChat(null);
          updateChatUrl("", "replace");
          return;
        }
        setOpeningChatId(targetId);
        const detail = await requestAiChatJson<{ chat: AiChatClientDetail }>(`/api/ai/chats/${targetId}`, {
          signal: controller.signal,
        });
        if (requestId !== openRequestId.current) return;
        setChat(detail.chat);
        updateChatUrl(targetId, "replace");
      } catch (reason) {
        if (!controller.signal.aborted && requestId === openRequestId.current) {
          setError(reason instanceof Error ? reason.message : "Could not load practice chats.");
        }
      } finally {
        if (requestId === openRequestId.current) {
          setOpeningChatId("");
          setInitialLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function restoreUrlChat() {
      const chatId = selectedChatIdFromUrl();
      if (chatId) void openChat(chatId, "none");
    }
    window.addEventListener("popstate", restoreUrlChat);
    return () => window.removeEventListener("popstate", restoreUrlChat);
  }, [openChat]);

  useEffect(() => () => openController.current?.abort(), []);

  async function createChat() {
    if (createInFlight.current) return;
    createInFlight.current = true;
    setCreating(true);
    setError("");
    openController.current?.abort();
    ++openRequestId.current;
    try {
      const result = await requestAiChatJson<{ chat: AiChatClientDetail }>("/api/ai/chats", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setChat(result.chat);
      setChats((current) => [asSummary(result.chat), ...current.filter((item) => item.id !== result.chat.id)]);
      setSidebarOpen(false);
      updateChatUrl(result.chat.id, "push");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the chat.");
    } finally {
      createInFlight.current = false;
      setCreating(false);
    }
  }

  function closeManage() {
    if (manageBusy) return;
    setManage(null);
    setManageError("");
  }

  async function renameChat(chatId: string, title: string) {
    setManageBusy(true);
    setManageError("");
    try {
      const result = await requestAiChatJson<{ chat: AiChatClientSummary }>(
        `/api/ai/chats/${encodeURIComponent(chatId)}`,
        { method: "PATCH", body: JSON.stringify({ title }) },
      );
      setChats((current) => current.map((item) => (
        item.id === chatId ? { ...item, title: result.chat.title } : item
      )));
      setChat((current) => current?.id === chatId ? { ...current, title: result.chat.title } : current);
      setManage(null);
    } catch (reason) {
      setManageError(reason instanceof Error ? reason.message : "Could not rename this chat.");
    } finally {
      setManageBusy(false);
    }
  }

  async function deleteChat(chatId: string) {
    setManageBusy(true);
    setManageError("");
    try {
      await requestAiChatJson<{ deleted: true }>(
        `/api/ai/chats/${encodeURIComponent(chatId)}`,
        { method: "DELETE" },
      );
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setManageError(message.startsWith("Another message is still being answered")
        ? "This chat is still answering. Stop the reply first, then delete it."
        : message || "Could not delete this chat.");
      setManageBusy(false);
      return;
    }
    const index = chats.findIndex((item) => item.id === chatId);
    const remaining = chats.filter((item) => item.id !== chatId);
    setChats(remaining);
    setDrafts((current) => Object.fromEntries(
      Object.entries(current).filter(([id]) => id !== chatId),
    ));
    setManage(null);
    setManageBusy(false);
    if (chat?.id !== chatId) return;
    // The open chat is gone: land on its neighbour, or on the empty state.
    const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
    if (next) {
      await openChat(next.id, "replace");
    } else {
      openRequestId.current += 1;
      openController.current?.abort();
      setChat(null);
      setSidebarOpen(false);
      updateChatUrl("", "replace");
    }
  }

  const refreshWorkspace = useCallback(async (
    chatId: string,
    signal?: AbortSignal,
    options?: AiChatRefreshOptions,
  ): Promise<AiChatClientDetail | null> => {
    const requestGuard = openRequestId.current;
    try {
      const [detail, list] = await Promise.all([
        requestAiChatJson<{ chat: AiChatClientDetail }>(`/api/ai/chats/${chatId}`, { signal }),
        options?.detailOnly
          ? Promise.resolve(null)
          : requestAiChatJson<{ chats: AiChatClientSummary[]; generationConfigured: boolean }>(
              "/api/ai/chats",
              { signal },
            ),
      ]);
      if (requestGuard !== openRequestId.current) return null;
      setChat((current) => current?.id === chatId ? detail.chat : current);
      if (list) {
        setChats(list.chats);
        setGenerationConfigured(list.generationConfigured);
      } else {
        setChats((current) => [
          asSummary(detail.chat),
          ...current.filter((item) => item.id !== detail.chat.id),
        ]);
      }
      setError("");
      return detail.chat;
    } catch (reason) {
      if (!options?.quiet && !signal?.aborted && requestGuard === openRequestId.current) {
        setError(reason instanceof Error ? reason.message : "Could not refresh this chat.");
      }
      return null;
    }
  }, []);

  const managedChat = manage ? chats.find((item) => item.id === manage.id) : undefined;

  return (
    <div className="ai-chat-workspace">
      <button
        aria-label="Close chat list"
        className={`ai-chat-sidebar-overlay ${sidebarOpen ? "open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
        type="button"
      />
      <aside className={`ai-chat-sidebar ${sidebarOpen ? "open" : ""}`} id="ai-chat-sidebar" ref={sidebarRef}>
        <div className="ai-chat-sidebar-heading">
          <div>
            <span>Practice space</span>
            <h2>Chats</h2>
          </div>
          <IconButton
            className="ai-chat-sidebar-close"
            label="Close chat list"
            onClick={() => setSidebarOpen(false)}
            variant="ghost"
          >
            <CloseIcon />
          </IconButton>
        </div>
        <Button
          block
          className="ai-chat-new"
          icon={<PlusIcon />}
          loading={creating}
          onClick={() => void createChat()}
          variant="primary"
        >New Chat</Button>
        <nav aria-busy={initialLoading} aria-label="Practice chats" className="ai-chat-list">
          {initialLoading ? (
            <ListSkeleton label="Loading chats" rows={3} />
          ) : chats.length === 0 ? (
            <p className="ai-chat-list-empty">No chats yet. Start one when you are ready.</p>
          ) : (
            <ul>
              {chats.map((item) => (
                <li className="ai-chat-list-row" key={item.id}>
                  <button
                    aria-current={chat?.id === item.id ? "page" : undefined}
                    className={chat?.id === item.id ? "ai-chat-list-item active" : "ai-chat-list-item"}
                    disabled={openingChatId === item.id}
                    onClick={() => void openChat(item.id)}
                    type="button"
                  >
                    <strong>{item.title}</strong>
                    {item.preview && <span className="ai-chat-list-preview">{item.preview}</span>}
                    <span className="ai-chat-list-meta">
                      {item.messageCount} {item.messageCount === 1 ? "message" : "messages"}
                      {chatListTime(item.updatedAt) ? ` · ${chatListTime(item.updatedAt)}` : ""}
                    </span>
                  </button>
                  <IconButton
                    aria-haspopup="dialog"
                    className="ai-chat-list-menu"
                    label={`Actions for ${item.title}`}
                    onClick={() => {
                      setManageError("");
                      setManage({ id: item.id, mode: "menu" });
                    }}
                    variant="ghost"
                  >
                    <MoreIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </aside>

      <section aria-busy={Boolean(openingChatId)} className="ai-chat-main">
        {error && (
          <Notice
            action={<Button onClick={() => setError("")} variant="ghost">Dismiss</Button>}
            className="ai-chat-inline-error ai-chat-workspace-error"
            tone="danger"
          >
            {error}
          </Notice>
        )}
        {initialLoading ? (
          <div aria-label="Loading conversation" className="ai-chat-conversation-loading" role="status">
            <Skeleton className="ai-chat-skeleton-bubble" />
            <Skeleton className="ai-chat-skeleton-bubble" />
            <Skeleton className="ai-chat-skeleton-bubble" />
          </div>
        ) : !chat ? (
          <EmptyState
            action={(
              <Button
                icon={<PlusIcon />}
                loading={creating}
                onClick={() => void createChat()}
                size="lg"
                variant="primary"
              >New Chat</Button>
            )}
            className="ai-chat-empty-panel"
            description="Create a chat, choose a word or phrase, and practise it in a real context."
            icon={<MessageIcon />}
            title="Start a conversation"
          />
        ) : (
          <ChatConversation
            chat={chat}
            draft={drafts[chat.id] || ""}
            generationConfigured={generationConfigured}
            key={chat.id}
            onDraftChange={(value) => setDrafts((current) => ({ ...current, [chat.id]: value }))}
            onOpenSidebar={() => setSidebarOpen(true)}
            refresh={(signal, options) => refreshWorkspace(chat.id, signal, options)}
            sidebarOpen={sidebarOpen}
          />
        )}
        {openingChatId && chat && openingChatId !== chat.id && (
          <Chip className="ai-chat-opening" role="status"><Spinner /> Opening chat…</Chip>
        )}
      </section>

      {managedChat && manage && (
        <ChatActionsSheet
          busy={manageBusy}
          chat={managedChat}
          error={manageError}
          key={managedChat.id}
          mode={manage.mode}
          onClose={closeManage}
          onDelete={() => void deleteChat(managedChat.id)}
          onModeChange={(mode) => {
            setManageError("");
            setManage({ id: managedChat.id, mode });
          }}
          onRename={(title) => void renameChat(managedChat.id, title)}
        />
      )}
    </div>
  );
}
