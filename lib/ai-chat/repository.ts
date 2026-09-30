import {
  AI_CHAT_LIMITS,
  AI_CHAT_TITLE_MAX_CHARACTERS,
  isMeaningMode,
  type AiChatMeaningMode,
  type AiChatTargetInput,
} from "./contracts.ts";
import {
  VOCABULARY_LEGACY_MEANING_ID,
  type VocabularyMeaning,
} from "../vocabulary/contracts.ts";
import {
  createVocabularyPracticeReader,
  VocabularyPracticeReaderError,
  type VocabularyPracticeItem,
  type VocabularyPracticeTargetDraft,
} from "../vocabulary/practice-reader.ts";
import {
  AI_CHAT_PREVIEW_CHARACTERS,
  AI_CHAT_PREVIEW_SOURCE_CHARACTERS,
  toChatPreview,
} from "./preview.ts";
import {
  parseAiChatTerminalTelemetry,
  serializeAiChatTerminalTelemetry,
  type AiChatTerminalTelemetry,
} from "./terminal-telemetry.ts";

export const AI_CHAT_LEGACY_MEANING_ID = VOCABULARY_LEGACY_MEANING_ID;
// Crash recovery is independent from provider inactivity timeouts. Keep this
// lease generous relative to bounded output so ordinary active streams are not fenced.
export const AI_CHAT_PENDING_LEASE_MS = 5 * 60_000;
export const AI_CHAT_ACCOUNT_LIMIT = 100;
export const AI_CHAT_LIST_LIMIT = 100;
export const AI_CHAT_MESSAGE_LIST_LIMIT = 200;
export { AI_CHAT_PREVIEW_CHARACTERS, toChatPreview };

export type AiChatRepositoryErrorCode =
  | "not_found"
  | "conflict"
  | "turn_in_progress"
  | "invalid_target"
  | "target_limit";

export class AiChatRepositoryError extends Error {
  readonly code: AiChatRepositoryErrorCode;

  constructor(code: AiChatRepositoryErrorCode, message: string) {
    super(message);
    this.name = "AiChatRepositoryError";
    this.code = code;
  }
}

export type AiChatMeaning = VocabularyMeaning;

export type AiChatPracticeItem = VocabularyPracticeItem;

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  sequence: number;
  content: string;
  status: "complete" | "pending" | "failed";
  practiceContext: unknown;
  clientMessageId: string;
  provider: string | null;
  model: string | null;
  usage: unknown;
  errorCode: string | null;
  terminal: AiChatTerminalTelemetry | null;
  createdAt: string;
  updatedAt: string;
};

export type AiChatSummary = {
  id: string;
  title: string;
  explanationLanguage: string;
  targetCount: number;
  messageCount: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

export type AiChatDetail = AiChatSummary & {
  targets: AiChatPracticeItem[];
  messages: AiChatMessage[];
};

export type AiChatCanonicalMessage = Pick<
  AiChatMessage,
  "id" | "role" | "sequence" | "content" | "clientMessageId"
>;

export type AiChatAssistantAttempt = {
  id: string;
  attemptNumber: number;
  status: "pending" | "complete" | "failed" | "expired";
  leaseExpiresAt: string;
  configuredProvenance: AiChatConfiguredProvenance;
  errorCode: string | null;
  terminal: AiChatTerminalTelemetry | null;
  createdAt: string;
  updatedAt: string;
};

export type AiChatConfiguredProvenance = {
  provider: string;
  model: string;
};

export type AiChatTurn = {
  state: "created" | "existing" | "retrying";
  user: AiChatMessage;
  assistant: AiChatMessage;
  attempt: AiChatAssistantAttempt | null;
};

type RepositoryOptions = {
  createId?: (kind: "chat" | "target" | "message" | "attempt") => string;
  now?: () => string;
  practiceReader?: ReturnType<typeof createVocabularyPracticeReader>;
};

type ChatRow = {
  id: string;
  title: string;
  explanation_language: string;
  target_count: number;
  message_count: number;
  preview_source: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  role: "user" | "assistant";
  sequence: number;
  content: string;
  status: "complete" | "pending" | "failed";
  practice_context_json: string;
  client_message_id: string;
  provider: string | null;
  model: string | null;
  usage_json: string | null;
  error_code: string | null;
  terminal_json?: string | null;
  created_at: string;
  updated_at: string;
};

type AttemptRow = {
  id: string;
  attempt_number: number;
  status: "pending" | "complete" | "failed" | "expired";
  lease_expires_at: string;
  configured_provider: string;
  configured_model: string;
  error_code: string | null;
  terminal_json: string | null;
  created_at: string;
  updated_at: string;
};

type TargetDraft = VocabularyPracticeTargetDraft;

type CreatedTargetDraft = TargetDraft & { id: string };

type CreatedChatPayloadRow = {
  chat_id: string;
  chat_title: string;
  explanation_language: string;
  chat_created_at: string;
  chat_updated_at: string;
  target_id: string | null;
  target_phrase_id: string | null;
  target_text_snapshot: string | null;
  target_meaning_mode: AiChatMeaningMode | null;
  target_selected_meaning_id: string | null;
  target_selected_meaning_snapshot: string | null;
  target_created_at: string | null;
  target_updated_at: string | null;
  message_id: string | null;
  message_role: "user" | "assistant" | null;
  message_sequence: number | null;
  message_content: string | null;
  message_status: "complete" | "pending" | "failed" | null;
  message_practice_context_json: string | null;
  message_client_message_id: string | null;
  message_provider: string | null;
  message_model: string | null;
  message_usage_json: string | null;
  message_error_code: string | null;
  message_created_at: string | null;
  message_updated_at: string | null;
};

function repositoryError(code: AiChatRepositoryErrorCode, message: string): never {
  throw new AiChatRepositoryError(code, message);
}

function cleanSingleLine(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function cleanContext(value: string) {
  return value.normalize("NFKC").trim().replace(/\r\n?/gu, "\n");
}

function truncateCharacters(value: string, maximum: number) {
  return [...value].slice(0, maximum).join("");
}

function parseJson(value: string | null, fallback: unknown) {
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return fallback;
  }
}

function pendingTurnIsStale(leaseExpiresAt: string, referenceTime: string) {
  const expires = Date.parse(leaseExpiresAt);
  const reference = Date.parse(referenceTime);
  return Number.isFinite(expires)
    && Number.isFinite(reference)
    && expires <= reference;
}

function attemptLeaseExpiresAt(timestamp: string) {
  const started = Date.parse(timestamp);
  return Number.isFinite(started)
    ? new Date(started + AI_CHAT_PENDING_LEASE_MS).toISOString()
    : timestamp;
}

function cleanConfiguredProvenance(
  value: AiChatConfiguredProvenance | undefined,
): AiChatConfiguredProvenance {
  const provider = cleanSingleLine(value?.provider || "");
  const model = cleanSingleLine(value?.model || "");
  return {
    provider: provider && provider.length <= 80 ? provider : "unknown",
    model: model && model.length <= 240 ? model : "unknown",
  };
}

function defaultCreateId(kind: "chat" | "target" | "message" | "attempt") {
  return `${kind}-${crypto.randomUUID()}`;
}

function mapChat(row: ChatRow): AiChatSummary {
  return {
    id: row.id,
    title: row.title,
    explanationLanguage: row.explanation_language,
    targetCount: Number(row.target_count),
    messageCount: Number(row.message_count),
    preview: toChatPreview(row.preview_source),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: MessageRow): AiChatMessage {
  return {
    id: row.id,
    role: row.role,
    sequence: Number(row.sequence),
    content: row.content,
    status: row.status,
    practiceContext: parseJson(row.practice_context_json, []),
    clientMessageId: row.client_message_id,
    provider: row.provider,
    model: row.model,
    usage: parseJson(row.usage_json, null),
    errorCode: row.error_code,
    terminal: parseAiChatTerminalTelemetry(row.terminal_json ?? null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttempt(row: AttemptRow): AiChatAssistantAttempt {
  return {
    id: row.id,
    attemptNumber: Number(row.attempt_number),
    status: row.status,
    leaseExpiresAt: row.lease_expires_at,
    configuredProvenance: {
      provider: row.configured_provider,
      model: row.configured_model,
    },
    errorCode: row.error_code,
    terminal: parseAiChatTerminalTelemetry(row.terminal_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deriveTitle(targets: readonly TargetDraft[]) {
  if (!targets.length) return "New vocabulary practice";
  const first = truncateCharacters(targets[0].text, 72);
  return targets.length === 1 ? first : `${first} +${targets.length - 1}`;
}

export function createAiChatRepository(
  db: D1Database,
  options: RepositoryOptions = {},
) {
  const createId = options.createId || defaultCreateId;
  const now = options.now || (() => new Date().toISOString());
  const practiceReader = options.practiceReader || createVocabularyPracticeReader(db, {
    meaningsPerTarget: AI_CHAT_LIMITS.meaningsPerTarget,
  });

  async function ownedChat(userId: string, chatId: string) {
    return db.prepare(`
      SELECT
        chats.id,
        chats.title,
        chats.explanation_language,
        (SELECT COUNT(*) FROM ai_chat_practice_items AS items WHERE items.chat_id = chats.id) AS target_count,
        (SELECT COUNT(*) FROM ai_chat_messages AS messages WHERE messages.chat_id = chats.id) AS message_count,
        (
          SELECT substr(previews.content, 1, ${AI_CHAT_PREVIEW_SOURCE_CHARACTERS})
          FROM ai_chat_messages AS previews
          WHERE previews.chat_id = chats.id AND previews.content <> ''
          ORDER BY previews.sequence DESC
          LIMIT 1
        ) AS preview_source,
        chats.created_at,
        chats.updated_at
      FROM ai_chats AS chats
      WHERE chats.id = ? AND chats.user_id = ?
      LIMIT 1
    `).bind(chatId, userId).first<ChatRow>();
  }

  async function requireOwnedChat(userId: string, chatId: string) {
    const chat = await ownedChat(userId, chatId);
    if (!chat) repositoryError("not_found", "Chat not found.");
    return chat;
  }

  async function resolveTarget(userId: string, input: AiChatTargetInput): Promise<TargetDraft> {
    const meaningMode: unknown = input.meaningMode;
    if (!isMeaningMode(meaningMode)) {
      repositoryError("invalid_target", "Unsupported meaning mode.");
    }
    if (input.source === "ad_hoc") {
      const text = cleanSingleLine(input.text);
      if (
        !text
        || [...text].length > AI_CHAT_LIMITS.targetTextCharacters
        || meaningMode === "selected"
      ) {
        repositoryError("invalid_target", "Invalid ad-hoc target.");
      }
      return {
        phraseId: null,
        text,
        meaningMode,
        selectedMeaningId: null,
        selectedMeaningSnapshot: "",
      };
    }

    try {
      return await practiceReader.resolveSavedTarget(userId, {
        phraseId: input.phraseId,
        meaningMode,
        selectedMeaningId: input.selectedMeaningId,
      });
    } catch (error) {
      if (error instanceof VocabularyPracticeReaderError) {
        repositoryError(error.code, error.message);
      }
      throw error;
    }
  }

  async function resolveTargets(userId: string, targets: readonly AiChatTargetInput[]) {
    if (targets.length > AI_CHAT_LIMITS.targetCount) {
      repositoryError("target_limit", "Too many practice targets.");
    }
    const resolved: TargetDraft[] = [];
    // Resolved one by one on purpose: the first invalid target decides the error, deterministically.
    for (const target of targets) resolved.push(await resolveTarget(userId, target)); // NOSONAR
    return resolved;
  }

  function targetInsert(chatId: string, target: TargetDraft, timestamp: string) {
    return db.prepare(`
      INSERT INTO ai_chat_practice_items (
        id, chat_id, phrase_id, text_snapshot, meaning_mode, selected_meaning_id,
        selected_meaning_snapshot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      createId("target"),
      chatId,
      target.phraseId,
      target.text,
      target.meaningMode,
      target.selectedMeaningId,
      target.selectedMeaningSnapshot,
      timestamp,
      timestamp,
    );
  }

  function createTargetInsert(
    userId: string,
    chatId: string,
    target: CreatedTargetDraft,
    timestamp: string,
  ) {
    return db.prepare(`
      INSERT INTO ai_chat_practice_items (
        id, chat_id, phrase_id, text_snapshot, meaning_mode, selected_meaning_id,
        selected_meaning_snapshot, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM ai_chats WHERE id = ? AND user_id = ?
      )
    `).bind(
      target.id,
      chatId,
      target.phraseId,
      target.text,
      target.meaningMode,
      target.selectedMeaningId,
      target.selectedMeaningSnapshot,
      timestamp,
      timestamp,
      chatId,
      userId,
    );
  }

  async function createdChatPayloadMatches(input: {
    userId: string;
    chatId: string;
    title: string;
    explanationLanguage: string;
    timestamp: string;
    targets: readonly CreatedTargetDraft[];
    openingMessageId: string | null;
    openingMessage: string;
  }) {
    const result = await db.prepare(`
      SELECT
        chats.id AS chat_id,
        chats.title AS chat_title,
        chats.explanation_language,
        chats.created_at AS chat_created_at,
        chats.updated_at AS chat_updated_at,
        items.id AS target_id,
        items.phrase_id AS target_phrase_id,
        items.text_snapshot AS target_text_snapshot,
        items.meaning_mode AS target_meaning_mode,
        items.selected_meaning_id AS target_selected_meaning_id,
        items.selected_meaning_snapshot AS target_selected_meaning_snapshot,
        items.created_at AS target_created_at,
        items.updated_at AS target_updated_at,
        messages.id AS message_id,
        messages.role AS message_role,
        messages.sequence AS message_sequence,
        messages.content AS message_content,
        messages.status AS message_status,
        messages.practice_context_json AS message_practice_context_json,
        messages.client_message_id AS message_client_message_id,
        messages.provider AS message_provider,
        messages.model AS message_model,
        messages.usage_json AS message_usage_json,
        messages.error_code AS message_error_code,
        messages.created_at AS message_created_at,
        messages.updated_at AS message_updated_at
      FROM ai_chats AS chats
      LEFT JOIN ai_chat_practice_items AS items ON items.chat_id = chats.id
      LEFT JOIN ai_chat_messages AS messages ON messages.chat_id = chats.id
      WHERE chats.id = ? AND chats.user_id = ?
    `).bind(input.chatId, input.userId).all<CreatedChatPayloadRow>();
    if (!result.results.length) return false;

    const targetRows = new Map<string, CreatedChatPayloadRow>();
    const messageRows = new Map<string, CreatedChatPayloadRow>();
    for (const row of result.results) {
      if (
        row.chat_id !== input.chatId
        || row.chat_title !== input.title
        || row.explanation_language !== input.explanationLanguage
        || row.chat_created_at !== input.timestamp
        || row.chat_updated_at !== input.timestamp
      ) {
        return false;
      }
      if (row.target_id) targetRows.set(row.target_id, row);
      if (row.message_id) messageRows.set(row.message_id, row);
    }
    if (targetRows.size !== input.targets.length) return false;
    for (const target of input.targets) {
      const row = targetRows.get(target.id);
      if (
        !row
        || row.target_phrase_id !== target.phraseId
        || row.target_text_snapshot !== target.text
        || row.target_meaning_mode !== target.meaningMode
        || row.target_selected_meaning_id !== target.selectedMeaningId
        || row.target_selected_meaning_snapshot !== target.selectedMeaningSnapshot
        || row.target_created_at !== input.timestamp
        || row.target_updated_at !== input.timestamp
      ) {
        return false;
      }
    }

    if (!input.openingMessageId) return messageRows.size === 0;
    if (messageRows.size !== 1) return false;
    const message = messageRows.get(input.openingMessageId);
    return Boolean(
      message
      && message.message_role === "assistant"
      && Number(message.message_sequence) === 1
      && message.message_content === input.openingMessage
      && message.message_status === "complete"
      && message.message_practice_context_json === "[]"
      && message.message_client_message_id === `opening:${input.chatId}`
      && message.message_provider === null
      && message.message_model === null
      && message.message_usage_json === null
      && message.message_error_code === null
      && message.message_created_at === input.timestamp
      && message.message_updated_at === input.timestamp
    );
  }

  async function getCurrentPracticeItems(userId: string, chatId: string) {
    await requireOwnedChat(userId, chatId);
    return practiceReader.readCurrentItems(userId, chatId);
  }

  async function listMessages(userId: string, chatId: string) {
    const result = await db.prepare(`
      SELECT
        bounded.id,
        bounded.role,
        bounded.sequence,
        bounded.content,
        bounded.status,
        bounded.practice_context_json,
        bounded.client_message_id,
        bounded.provider,
        bounded.model,
        bounded.usage_json,
        bounded.error_code,
        bounded.terminal_json,
        bounded.created_at,
        bounded.updated_at
      FROM (
        SELECT
          messages.id,
          messages.role,
          messages.sequence,
          messages.content,
          messages.status,
          messages.practice_context_json,
          messages.client_message_id,
          messages.provider,
          messages.model,
          messages.usage_json,
          messages.error_code,
          CASE WHEN messages.role = 'assistant' THEN (
            SELECT attempts.terminal_json
            FROM ai_chat_assistant_attempts AS attempts
            WHERE attempts.assistant_message_id = messages.id
            ORDER BY attempts.attempt_number DESC
            LIMIT 1
          ) ELSE NULL END AS terminal_json,
          messages.created_at,
          messages.updated_at
        FROM ai_chat_messages AS messages
        JOIN ai_chats AS chats ON chats.id = messages.chat_id
        WHERE messages.chat_id = ? AND chats.user_id = ?
        ORDER BY messages.sequence DESC
        LIMIT ?
      ) AS bounded
      ORDER BY bounded.sequence
    `).bind(chatId, userId, AI_CHAT_MESSAGE_LIST_LIMIT).all<MessageRow>();
    return result.results.map(mapMessage);
  }

  function stalePendingTurnRecoveryStatements(
    userId: string,
    chatId: string,
    timestamp: string,
  ) {
    const reference = Date.parse(timestamp);
    if (!Number.isFinite(reference)) return [];
    const staleBefore = new Date(reference - AI_CHAT_PENDING_LEASE_MS).toISOString();
    return [
      db.prepare(`
        UPDATE ai_chat_assistant_attempts
        SET status = 'expired', error_code = 'generation_interrupted',
            terminal_json = ?,
            updated_at = ?, completed_at = ?
        WHERE chat_id = ? AND user_id = ? AND status = 'pending'
          AND lease_expires_at <= ?
      `).bind(
        serializeAiChatTerminalTelemetry({ termination: "lease_expired" }),
        timestamp,
        timestamp,
        chatId,
        userId,
        timestamp,
      ),
      db.prepare(`
        UPDATE ai_chat_messages
        SET content = '', status = 'failed', provider = NULL, model = NULL,
            usage_json = NULL, error_code = 'generation_interrupted', updated_at = ?
        WHERE chat_id = ? AND role = 'assistant' AND status = 'pending'
          AND (
            updated_at <= ?
            OR EXISTS (
              SELECT 1
              FROM ai_chat_assistant_attempts AS attempts
              WHERE attempts.assistant_message_id = ai_chat_messages.id
                AND attempts.status = 'expired'
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM ai_chat_assistant_attempts AS active
            WHERE active.assistant_message_id = ai_chat_messages.id
              AND active.status = 'pending'
          )
          AND EXISTS (
            SELECT 1 FROM ai_chats WHERE ai_chats.id = ? AND ai_chats.user_id = ?
          )
      `).bind(timestamp, chatId, staleBefore, chatId, userId),
    ];
  }

  async function recoverStalePendingTurns(userId: string, chatId: string) {
    const timestamp = now();
    const recoveryStatements = stalePendingTurnRecoveryStatements(userId, chatId, timestamp);
    if (recoveryStatements.length === 0) return;
    const results = await db.batch([
      ...recoveryStatements,
      db.prepare(`
        UPDATE ai_chats
        SET updated_at = ?
        WHERE id = ? AND user_id = ?
          AND EXISTS (
            SELECT 1
            FROM ai_chat_messages
            WHERE chat_id = ? AND role = 'assistant'
              AND status = 'failed' AND updated_at = ?
          )
      `).bind(timestamp, chatId, userId, chatId, timestamp),
    ]);
    if (Number(results[1]?.meta.changes || 0) === 0) {
      return;
    }
  }

  async function getChatSummary(userId: string, chatId: string): Promise<AiChatSummary | null> {
    const row = await ownedChat(userId, chatId);
    return row ? mapChat(row) : null;
  }

  async function getChat(userId: string, chatId: string): Promise<AiChatDetail | null> {
    await recoverStalePendingTurns(userId, chatId);
    const row = await ownedChat(userId, chatId);
    if (!row) return null;
    const [targets, messages] = await Promise.all([
      practiceReader.readCurrentItems(userId, chatId),
      listMessages(userId, chatId),
    ]);
    return { ...mapChat(row), targets, messages };
  }

  async function listChats(userId: string) {
    const result = await db.prepare(`
      SELECT
        chats.id,
        chats.title,
        chats.explanation_language,
        (SELECT COUNT(*) FROM ai_chat_practice_items AS items WHERE items.chat_id = chats.id) AS target_count,
        (SELECT COUNT(*) FROM ai_chat_messages AS messages WHERE messages.chat_id = chats.id) AS message_count,
        (
          SELECT substr(previews.content, 1, ${AI_CHAT_PREVIEW_SOURCE_CHARACTERS})
          FROM ai_chat_messages AS previews
          WHERE previews.chat_id = chats.id AND previews.content <> ''
          ORDER BY previews.sequence DESC
          LIMIT 1
        ) AS preview_source,
        chats.created_at,
        chats.updated_at
      FROM ai_chats AS chats
      WHERE chats.user_id = ?
      ORDER BY chats.updated_at DESC, chats.id DESC
      LIMIT ?
    `).bind(userId, AI_CHAT_LIST_LIMIT).all<ChatRow>();
    return result.results.map(mapChat);
  }

  async function renameChat(userId: string, chatId: string, title: string) {
    const cleaned = truncateCharacters(cleanSingleLine(title), AI_CHAT_TITLE_MAX_CHARACTERS);
    // A rename is not activity: updated_at keeps ordering the list by real conversation.
    const result = await db.prepare(`
      UPDATE ai_chats SET title = ? WHERE id = ? AND user_id = ?
    `).bind(cleaned, chatId, userId).run();
    if (Number(result.meta.changes || 0) === 0) repositoryError("not_found", "Chat not found.");
    const summary = await getChatSummary(userId, chatId);
    if (!summary) repositoryError("not_found", "Chat not found.");
    return summary;
  }

  /**
   * Deletes one owned chat. Messages, targets, attempts, tool traces and write
   * proposals go with it through their ON DELETE CASCADE keys; vocabulary the
   * person already confirmed stays untouched. Refused while a reply is being
   * generated so an in-flight turn is never orphaned.
   */
  async function deleteChat(userId: string, chatId: string) {
    await requireOwnedChat(userId, chatId);
    const active = await db.prepare(`
      SELECT 1 AS active
      FROM ai_chat_assistant_attempts
      WHERE chat_id = ? AND user_id = ? AND status = 'pending' AND lease_expires_at > ?
      LIMIT 1
    `).bind(chatId, userId, now()).first<{ active: number }>();
    if (active) repositoryError("turn_in_progress", "A reply is still being generated.");
    const result = await db.prepare(`
      DELETE FROM ai_chats WHERE id = ? AND user_id = ?
    `).bind(chatId, userId).run();
    if (Number(result.meta.changes || 0) === 0) repositoryError("not_found", "Chat not found.");
  }

  async function createChat(
    userId: string,
    input: {
      targets?: readonly AiChatTargetInput[];
      explanationLanguage?: string;
      openingMessage?: string;
    } = {},
  ) {
    const targets = await resolveTargets(userId, input.targets || []);
    const timestamp = now();
    const chatId = createId("chat");
    const language = truncateCharacters(cleanSingleLine(input.explanationLanguage || "ru"), 35) || "ru";
    const title = deriveTitle(targets);
    const openingMessage = input.openingMessage === undefined
      ? ""
      : cleanContext(input.openingMessage);
    if ([...openingMessage].length > AI_CHAT_LIMITS.messageCharacters) {
      repositoryError("invalid_target", "Opening message is too long.");
    }
    const createdTargets = targets.map((target): CreatedTargetDraft => ({
      id: createId("target"),
      ...target,
    }));
    const openingMessageId = openingMessage ? createId("message") : null;
    const statements = [
      db.prepare(`
        INSERT INTO ai_chats (
          id, user_id, title, explanation_language, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?
        WHERE (
          SELECT COUNT(*) FROM ai_chats WHERE user_id = ?
        ) < ?
      `).bind(
        chatId,
        userId,
        title,
        language,
        timestamp,
        timestamp,
        userId,
        AI_CHAT_ACCOUNT_LIMIT,
      ),
      ...createdTargets.map((target) => createTargetInsert(userId, chatId, target, timestamp)),
    ];
    if (openingMessage) {
      statements.push(db.prepare(`
        INSERT INTO ai_chat_messages (
          id, chat_id, role, sequence, content, status, practice_context_json,
          client_message_id, provider, model, usage_json, error_code, created_at, updated_at
        )
        SELECT ?, ?, 'assistant', 1, ?, 'complete', '[]', ?,
          NULL, NULL, NULL, NULL, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ai_chats WHERE id = ? AND user_id = ?
        )
      `).bind(
        openingMessageId,
        chatId,
        openingMessage,
        `opening:${chatId}`,
        timestamp,
        timestamp,
        chatId,
        userId,
      ));
    }
    let results: D1Result<unknown>[];
    try {
      results = await db.batch(statements);
    } catch (error) {
      const exactPayloadCommitted = await createdChatPayloadMatches({
        userId,
        chatId,
        title,
        explanationLanguage: language,
        timestamp,
        targets: createdTargets,
        openingMessageId,
        openingMessage,
      });
      if (!exactPayloadCommitted) throw error;
      const recovered = await getChat(userId, chatId);
      if (!recovered) repositoryError("conflict", "Chat could not be recovered.");
      return recovered;
    }
    if (Number(results[0]?.meta.changes || 0) !== 1) {
      repositoryError("conflict", "Chat account limit reached.");
    }
    const chat = await getChat(userId, chatId);
    if (!chat) repositoryError("conflict", "Chat could not be persisted.");
    return chat;
  }

  async function replacePracticeItems(
    userId: string,
    chatId: string,
    inputs: readonly AiChatTargetInput[],
  ) {
    await requireOwnedChat(userId, chatId);
    const targets = await resolveTargets(userId, inputs);
    const timestamp = now();
    await db.batch([db.prepare(`
        DELETE FROM ai_chat_practice_items
        WHERE chat_id = ?
          AND EXISTS (
            SELECT 1 FROM ai_chats WHERE ai_chats.id = ? AND ai_chats.user_id = ?
          )
      `).bind(chatId, chatId, userId),
      ...targets.map((target) => targetInsert(chatId, target, timestamp)),
      db.prepare("UPDATE ai_chats SET updated_at = ? WHERE id = ? AND user_id = ?")
        .bind(timestamp, chatId, userId),
    ]);
    return practiceReader.readCurrentItems(userId, chatId);
  }

  async function getCanonicalHistory(
    userId: string,
    chatId: string,
    options: { excludeClientMessageId?: string; beforeSequence?: number } = {},
  ): Promise<AiChatCanonicalMessage[]> {
    await requireOwnedChat(userId, chatId);
    const exclusion = options.excludeClientMessageId
      ? "AND messages.client_message_id <> ?"
      : "";
    const beforeSequence = Number.isSafeInteger(options.beforeSequence)
      && Number(options.beforeSequence) > 0
      ? Number(options.beforeSequence)
      : null;
    const sequenceBoundary = beforeSequence === null
      ? ""
      : "AND messages.sequence < ?";
    const bindings: unknown[] = [chatId, userId];
    if (options.excludeClientMessageId) bindings.push(options.excludeClientMessageId);
    if (beforeSequence !== null) bindings.push(beforeSequence);
    bindings.push(AI_CHAT_LIMITS.historyMessages);
    const result = await db.prepare(`
      SELECT id, role, sequence, content, client_message_id
      FROM (
        SELECT
          messages.id,
          messages.role,
          messages.sequence,
          messages.content,
          messages.client_message_id
        FROM ai_chat_messages AS messages
        JOIN ai_chats AS chats ON chats.id = messages.chat_id
        WHERE messages.chat_id = ?
          AND chats.user_id = ?
          AND messages.status = 'complete'
          AND (
            messages.role = 'assistant'
            OR EXISTS (
              SELECT 1
              FROM ai_chat_messages AS paired_assistant
              WHERE paired_assistant.chat_id = messages.chat_id
                AND paired_assistant.client_message_id = messages.client_message_id
                AND paired_assistant.role = 'assistant'
                AND paired_assistant.status = 'complete'
            )
          )
          ${exclusion}
          ${sequenceBoundary}
        ORDER BY messages.sequence DESC
        LIMIT ?
      )
      ORDER BY sequence
    `).bind(...bindings).all<Pick<
      MessageRow,
      "id" | "role" | "sequence" | "content" | "client_message_id"
    >>();
    return result.results.map((row) => ({
      id: row.id,
      role: row.role,
      sequence: Number(row.sequence),
      content: row.content,
      clientMessageId: row.client_message_id,
    }));
  }

  async function findTurn(userId: string, chatId: string, clientMessageId: string) {
    const result = await db.prepare(`
      SELECT
        messages.id,
        messages.role,
        messages.sequence,
        messages.content,
        messages.status,
        messages.practice_context_json,
        messages.client_message_id,
        messages.provider,
        messages.model,
        messages.usage_json,
        messages.error_code,
        messages.created_at,
        messages.updated_at
      FROM ai_chat_messages AS messages
      JOIN ai_chats AS chats ON chats.id = messages.chat_id
      WHERE messages.chat_id = ?
        AND messages.client_message_id = ?
        AND chats.user_id = ?
      ORDER BY messages.sequence
    `).bind(chatId, clientMessageId, userId).all<MessageRow>();
    if (!result.results.length) return null;
    const messages = result.results.map(mapMessage);
    const user = messages.find((message) => message.role === "user");
    const assistant = messages.find((message) => message.role === "assistant");
    if (!user || !assistant) repositoryError("conflict", "Stored turn is incomplete.");
    const attemptRow = await db.prepare(`
      SELECT
        attempts.id,
        attempts.attempt_number,
        attempts.status,
        attempts.lease_expires_at,
        attempts.configured_provider,
        attempts.configured_model,
        attempts.error_code,
        attempts.terminal_json,
        attempts.created_at,
        attempts.updated_at
      FROM ai_chat_assistant_attempts AS attempts
      WHERE attempts.user_id = ?
        AND attempts.chat_id = ?
        AND attempts.user_message_id = ?
        AND attempts.assistant_message_id = ?
      ORDER BY attempts.attempt_number DESC
      LIMIT 1
    `).bind(userId, chatId, user.id, assistant.id).first<AttemptRow>();
    return { user, assistant, attempt: attemptRow ? mapAttempt(attemptRow) : null };
  }

  async function reuseTurn(
    userId: string,
    chatId: string,
    input: {
      clientMessageId: string;
      content: string;
      configuredProvenance?: AiChatConfiguredProvenance;
    },
    turn: {
      user: AiChatMessage;
      assistant: AiChatMessage;
      attempt: AiChatAssistantAttempt | null;
    },
  ): Promise<AiChatTurn> {
    if (turn.user.content !== input.content) {
      repositoryError("conflict", "Client message id was already used for different content.");
    }
    const timestamp = now();
    const recoverablePending = turn.assistant.status === "pending"
      && pendingTurnIsStale(
        turn.attempt?.status === "pending"
          ? turn.attempt.leaseExpiresAt
          : attemptLeaseExpiresAt(turn.assistant.updatedAt),
        timestamp,
      );
    if (turn.assistant.status !== "failed" && !recoverablePending) {
      return { state: "existing", ...turn };
    }
    const previousStatus = turn.assistant.status;
    const attemptId = createId("attempt");
    const attemptNumber = (turn.attempt?.attemptNumber || 0) + 1;
    const leaseExpiresAt = attemptLeaseExpiresAt(timestamp);
    const configuredProvenance = cleanConfiguredProvenance(input.configuredProvenance);
    let results: D1Result<unknown>[];
    try {
      results = await db.batch([
        db.prepare(`
          UPDATE ai_chat_assistant_attempts
          SET status = 'expired', error_code = 'generation_interrupted',
              terminal_json = ?,
              updated_at = ?, completed_at = ?
          WHERE id = ? AND status = 'pending'
        `).bind(
          serializeAiChatTerminalTelemetry({ termination: "lease_expired" }),
          timestamp,
          timestamp,
          turn.attempt?.id || "",
        ),
        db.prepare(`
          UPDATE ai_chat_messages
          SET content = '', status = 'pending', provider = NULL, model = NULL,
              usage_json = NULL, error_code = NULL, updated_at = ?
          WHERE id = ? AND chat_id = ? AND status = ? AND updated_at = ?
            AND EXISTS (
              SELECT 1 FROM ai_chats WHERE ai_chats.id = ? AND ai_chats.user_id = ?
            )
        `).bind(
          timestamp,
          turn.assistant.id,
          chatId,
          previousStatus,
          turn.assistant.updatedAt,
          chatId,
          userId,
        ),
        db.prepare(`
          INSERT INTO ai_chat_assistant_attempts (
            id, user_id, chat_id, user_message_id, assistant_message_id,
            attempt_number, status, lease_expires_at, configured_provider,
            configured_model, created_at, updated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1
            FROM ai_chat_messages AS messages
            JOIN ai_chats AS chats ON chats.id = messages.chat_id
            WHERE messages.id = ? AND messages.chat_id = ?
              AND messages.role = 'assistant' AND messages.status = 'pending'
              AND messages.updated_at = ? AND chats.user_id = ?
          )
        `).bind(
          attemptId,
          userId,
          chatId,
          turn.user.id,
          turn.assistant.id,
          attemptNumber,
          leaseExpiresAt,
          configuredProvenance.provider,
          configuredProvenance.model,
          timestamp,
          timestamp,
          turn.assistant.id,
          chatId,
          timestamp,
          userId,
        ),
        db.prepare("UPDATE ai_chats SET updated_at = ? WHERE id = ? AND user_id = ?")
          .bind(timestamp, chatId, userId),
      ]);
    } catch {
      const raced = await findTurn(userId, chatId, input.clientMessageId);
      if (!raced) repositoryError("conflict", "Turn retry could not be persisted.");
      if (
        raced.user.id === turn.user.id
        && raced.assistant.id === turn.assistant.id
        && raced.assistant.status === "pending"
        && raced.attempt?.id === attemptId
        && raced.attempt.status === "pending"
      ) {
        return { state: "retrying", ...raced };
      }
      return { state: "existing", ...raced };
    }
    const retried = await findTurn(userId, chatId, input.clientMessageId);
    if (!retried) repositoryError("conflict", "Turn retry could not be persisted.");
    return Number(results[2]?.meta.changes || 0) === 1
      ? { state: "retrying", ...retried }
      : { state: "existing", ...retried };
  }

  async function beginTurn(
    userId: string,
    chatId: string,
    input: {
      clientMessageId: string;
      content: string;
      practiceContext: unknown;
      configuredProvenance?: AiChatConfiguredProvenance;
    },
  ): Promise<AiChatTurn> {
    await requireOwnedChat(userId, chatId);
    const existing = await findTurn(userId, chatId, input.clientMessageId);
    if (existing) return reuseTurn(userId, chatId, input, existing);

    const timestamp = now();
    const practiceContextJson = JSON.stringify(input.practiceContext ?? []);
    const userMessageId = createId("message");
    const assistantMessageId = createId("message");
    const attemptId = createId("attempt");
    const leaseExpiresAt = attemptLeaseExpiresAt(timestamp);
    const configuredProvenance = cleanConfiguredProvenance(input.configuredProvenance);
    const recoveryStatements = stalePendingTurnRecoveryStatements(userId, chatId, timestamp);
    try {
      await db.batch([
        ...recoveryStatements,
        db.prepare(`
          INSERT INTO ai_chat_messages (
            id, chat_id, role, sequence, content, status, practice_context_json,
            client_message_id, created_at, updated_at
          ) VALUES (
            ?, ?, 'user',
            (SELECT COALESCE(MAX(sequence), 0) + 1 FROM ai_chat_messages WHERE chat_id = ?),
            ?, 'complete', ?, ?, ?, ?
          )
        `).bind(
          userMessageId,
          chatId,
          chatId,
          input.content,
          practiceContextJson,
          input.clientMessageId,
          timestamp,
          timestamp,
        ),
        db.prepare(`
          INSERT INTO ai_chat_messages (
            id, chat_id, role, sequence, content, status, practice_context_json,
            client_message_id, created_at, updated_at
          ) VALUES (
            ?, ?, 'assistant',
            (SELECT COALESCE(MAX(sequence), 0) + 1 FROM ai_chat_messages WHERE chat_id = ?),
            '', 'pending', ?, ?, ?, ?
          )
        `).bind(
          assistantMessageId,
          chatId,
          chatId,
          practiceContextJson,
          input.clientMessageId,
          timestamp,
          timestamp,
        ),
        db.prepare(`
          INSERT INTO ai_chat_assistant_attempts (
            id, user_id, chat_id, user_message_id, assistant_message_id,
            attempt_number, status, lease_expires_at, configured_provider,
            configured_model, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, 'pending', ?, ?, ?, ?, ?)
        `).bind(
          attemptId,
          userId,
          chatId,
          userMessageId,
          assistantMessageId,
          leaseExpiresAt,
          configuredProvenance.provider,
          configuredProvenance.model,
          timestamp,
          timestamp,
        ),
        db.prepare("UPDATE ai_chats SET updated_at = ? WHERE id = ? AND user_id = ?")
          .bind(timestamp, chatId, userId),
      ]);
    } catch (error) {
      const raced = await findTurn(userId, chatId, input.clientMessageId);
      if (!raced) {
        const active = await db.prepare(`
          SELECT 1 AS active
          FROM ai_chat_assistant_attempts AS attempts
          JOIN ai_chats AS chats ON chats.id = attempts.chat_id
          WHERE attempts.user_id = ? AND attempts.chat_id = ?
            AND attempts.status = 'pending' AND attempts.lease_expires_at > ?
            AND chats.user_id = ?
          LIMIT 1
        `).bind(userId, chatId, timestamp, userId).first<{ active: number }>();
        if (active) repositoryError("turn_in_progress", "Another turn is already running.");
        throw error;
      }
      if (
        raced.user.id === userMessageId
        && raced.assistant.id === assistantMessageId
        && raced.assistant.status === "pending"
        && raced.attempt?.id === attemptId
        && raced.attempt.status === "pending"
      ) {
        return { state: "created", ...raced };
      }
      return reuseTurn(userId, chatId, input, raced);
    }
    const created = await findTurn(userId, chatId, input.clientMessageId);
    if (!created) repositoryError("conflict", "Turn could not be persisted.");
    return { state: "created", ...created };
  }

  async function finishTurn(
    userId: string,
    chatId: string,
    clientMessageId: string,
    input: {
      attemptId: string;
      content: string;
      provider: string;
      model: string;
      usage?: unknown;
      terminal?: unknown;
    },
  ) {
    const existing = await findTurn(userId, chatId, clientMessageId);
    if (!existing) repositoryError("not_found", "Turn not found.");
    const timestamp = now();
    if (
      existing.assistant.status !== "pending"
      || existing.attempt?.id !== input.attemptId
      || existing.attempt.status !== "pending"
      || pendingTurnIsStale(existing.attempt.leaseExpiresAt, timestamp)
    ) {
      return { state: "existing", ...existing } satisfies AiChatTurn;
    }
    const usageJson = input.usage == null ? null : JSON.stringify(input.usage);
    const terminalJson = serializeAiChatTerminalTelemetry(input.terminal);
    const completionStatements = [
      db.prepare(`
        UPDATE ai_chat_messages
        SET content = ?, status = 'complete', provider = ?, model = ?, usage_json = ?,
            error_code = NULL, updated_at = ?
        WHERE chat_id = ? AND client_message_id = ? AND role = 'assistant'
          AND status = 'pending'
          AND EXISTS (
            SELECT 1
            FROM ai_chat_assistant_attempts AS attempts
            WHERE attempts.id = ?
              AND attempts.user_id = ?
              AND attempts.chat_id = ?
              AND attempts.user_message_id = ?
              AND attempts.assistant_message_id = ai_chat_messages.id
              AND attempts.status = 'pending'
              AND attempts.lease_expires_at > ?
          )
          AND EXISTS (
            SELECT 1 FROM ai_chats WHERE ai_chats.id = ? AND ai_chats.user_id = ?
          )
      `).bind(
        input.content,
        input.provider,
        input.model,
        usageJson,
        timestamp,
        chatId,
        clientMessageId,
        input.attemptId,
        userId,
        chatId,
        existing.user.id,
        timestamp,
        chatId,
        userId,
      ),
      db.prepare(`
        UPDATE ai_chat_assistant_attempts
        SET status = 'complete', provider = ?, model = ?, usage_json = ?,
            error_code = NULL, terminal_json = ?, updated_at = ?, completed_at = ?
        WHERE id = ? AND user_id = ? AND chat_id = ? AND status = 'pending'
          AND lease_expires_at > ?
          AND EXISTS (
            SELECT 1
            FROM ai_chat_messages
            WHERE id = ai_chat_assistant_attempts.assistant_message_id
              AND status = 'complete' AND updated_at = ?
          )
      `).bind(
        input.provider,
        input.model,
        usageJson,
        terminalJson,
        timestamp,
        timestamp,
        input.attemptId,
        userId,
        chatId,
        timestamp,
        timestamp,
      ),
      db.prepare(`
        UPDATE ai_chats SET updated_at = ?
        WHERE id = ? AND user_id = ?
          AND EXISTS (
            SELECT 1 FROM ai_chat_assistant_attempts
            WHERE id = ? AND status = 'complete' AND updated_at = ?
          )
      `).bind(timestamp, chatId, userId, input.attemptId, timestamp),
    ];
    let results: D1Result<unknown>[];
    try {
      results = await db.batch(completionStatements);
    } catch (error) {
      const completed = await findTurn(userId, chatId, clientMessageId);
      if (
        completed?.assistant.status === "complete"
        && completed.attempt?.id === input.attemptId
        && completed.attempt.status === "complete"
      ) {
        return { state: "existing", ...completed } satisfies AiChatTurn;
      }
      throw error;
    }
    if (
      Number(results[0]?.meta.changes || 0) !== 1
      || Number(results[1]?.meta.changes || 0) !== 1
    ) {
      const raced = await findTurn(userId, chatId, clientMessageId);
      if (!raced) repositoryError("conflict", "Turn completion could not be persisted.");
      return { state: "existing", ...raced } satisfies AiChatTurn;
    }
    return {
      state: "existing",
      user: existing.user,
      assistant: {
        ...existing.assistant,
        content: input.content,
        status: "complete",
        provider: input.provider,
        model: input.model,
        usage: input.usage ?? null,
        errorCode: null,
        terminal: parseAiChatTerminalTelemetry(terminalJson),
        updatedAt: timestamp,
      },
      attempt: existing.attempt
        ? {
            ...existing.attempt,
            status: "complete",
            terminal: parseAiChatTerminalTelemetry(terminalJson),
            updatedAt: timestamp,
          }
        : null,
    } satisfies AiChatTurn;
  }

  async function failTurn(
    userId: string,
    chatId: string,
    clientMessageId: string,
    errorCode: string,
    attemptId: string,
    terminal?: unknown,
  ) {
    const existing = await findTurn(userId, chatId, clientMessageId);
    if (!existing) repositoryError("not_found", "Turn not found.");
    const timestamp = now();
    const terminalJson = serializeAiChatTerminalTelemetry(terminal);
    if (
      existing.assistant.status !== "pending"
      || existing.attempt?.id !== attemptId
      || existing.attempt.status !== "pending"
      || pendingTurnIsStale(existing.attempt.leaseExpiresAt, timestamp)
    ) {
      return { state: "existing", ...existing } satisfies AiChatTurn;
    }
    let results: D1Result<unknown>[];
    try {
      results = await db.batch([
        db.prepare(`
          UPDATE ai_chat_messages
          SET content = '', status = 'failed', provider = NULL, model = NULL,
              usage_json = NULL, error_code = ?, updated_at = ?
          WHERE chat_id = ? AND client_message_id = ? AND role = 'assistant'
            AND status = 'pending'
            AND EXISTS (
              SELECT 1
              FROM ai_chat_assistant_attempts AS attempts
              WHERE attempts.id = ?
                AND attempts.user_id = ?
                AND attempts.chat_id = ?
                AND attempts.user_message_id = ?
                AND attempts.assistant_message_id = ai_chat_messages.id
                AND attempts.status = 'pending'
                AND attempts.lease_expires_at > ?
            )
            AND EXISTS (
              SELECT 1 FROM ai_chats WHERE ai_chats.id = ? AND ai_chats.user_id = ?
            )
        `).bind(
          errorCode,
          timestamp,
          chatId,
          clientMessageId,
          attemptId,
          userId,
          chatId,
          existing.user.id,
          timestamp,
          chatId,
          userId,
        ),
        db.prepare(`
          UPDATE ai_chat_assistant_attempts
          SET status = 'failed', provider = NULL, model = NULL, usage_json = NULL,
              error_code = ?, terminal_json = ?, updated_at = ?, completed_at = ?
          WHERE id = ? AND user_id = ? AND chat_id = ? AND status = 'pending'
            AND lease_expires_at > ?
            AND EXISTS (
              SELECT 1
              FROM ai_chat_messages
              WHERE id = ai_chat_assistant_attempts.assistant_message_id
                AND status = 'failed' AND updated_at = ?
            )
        `).bind(
          errorCode,
          terminalJson,
          timestamp,
          timestamp,
          attemptId,
          userId,
          chatId,
          timestamp,
          timestamp,
        ),
        db.prepare(`
          UPDATE ai_chats SET updated_at = ?
          WHERE id = ? AND user_id = ?
            AND EXISTS (
              SELECT 1 FROM ai_chat_assistant_attempts
              WHERE id = ? AND status = 'failed' AND updated_at = ?
            )
        `).bind(timestamp, chatId, userId, attemptId, timestamp),
      ]);
    } catch (error) {
      const recovered = await findTurn(userId, chatId, clientMessageId);
      if (
        recovered?.assistant.status === "failed"
        && recovered.assistant.errorCode === errorCode
        && recovered.attempt?.id === attemptId
        && recovered.attempt.status === "failed"
        && recovered.attempt.errorCode === errorCode
      ) {
        return { state: "existing", ...recovered } satisfies AiChatTurn;
      }
      throw error;
    }
    if (
      Number(results[0]?.meta.changes || 0) !== 1
      || Number(results[1]?.meta.changes || 0) !== 1
    ) {
      const failed = await findTurn(userId, chatId, clientMessageId);
      if (!failed) repositoryError("conflict", "Turn failure could not be persisted.");
      return { state: "existing", ...failed } satisfies AiChatTurn;
    }
    return {
      state: "existing",
      user: existing.user,
      assistant: {
        ...existing.assistant,
        content: "",
        status: "failed",
        provider: null,
        model: null,
        usage: null,
        errorCode,
        terminal: parseAiChatTerminalTelemetry(terminalJson),
        updatedAt: timestamp,
      },
      attempt: existing.attempt
        ? {
            ...existing.attempt,
            status: "failed",
            errorCode,
            terminal: parseAiChatTerminalTelemetry(terminalJson),
            updatedAt: timestamp,
          }
        : null,
    } satisfies AiChatTurn;
  }

  async function cancelTurn(
    userId: string,
    chatId: string,
    clientMessageId: string,
  ) {
    const existing = await findTurn(userId, chatId, clientMessageId);
    if (!existing) repositoryError("not_found", "Turn not found.");
    const attempt = existing.attempt;
    const interrupted = existing.assistant.status === "failed"
      && existing.assistant.errorCode === "generation_interrupted"
      && attempt?.status === "failed"
      && attempt.errorCode === "generation_interrupted";
    if (
      !attempt
      || (
        !interrupted
        && (
          existing.assistant.status !== "pending"
          || attempt.status !== "pending"
        )
      )
    ) {
      return { state: "existing", ...existing } satisfies AiChatTurn;
    }
    const timestamp = now();
    const attemptId = attempt.id;
    let results: D1Result<unknown>[];
    try {
      results = await db.batch([
        db.prepare(`
          UPDATE ai_chat_messages
          SET content = '', status = 'failed', provider = NULL, model = NULL,
              usage_json = NULL, error_code = 'generation_cancelled', updated_at = ?
          WHERE chat_id = ? AND client_message_id = ? AND role = 'assistant'
            AND (
              status = 'pending'
              OR (status = 'failed' AND error_code = 'generation_interrupted')
            )
            AND EXISTS (
              SELECT 1
              FROM ai_chat_assistant_attempts AS attempts
              WHERE attempts.id = ?
                AND attempts.user_id = ?
                AND attempts.chat_id = ?
                AND attempts.user_message_id = ?
                AND attempts.assistant_message_id = ai_chat_messages.id
                AND (
                  attempts.status = 'pending'
                  OR (
                    attempts.status = 'failed'
                    AND attempts.error_code = 'generation_interrupted'
                  )
                )
            )
            AND EXISTS (
              SELECT 1 FROM ai_chats WHERE ai_chats.id = ? AND ai_chats.user_id = ?
            )
        `).bind(
          timestamp,
          chatId,
          clientMessageId,
          attemptId,
          userId,
          chatId,
          existing.user.id,
          chatId,
          userId,
        ),
        db.prepare(`
          UPDATE ai_chat_assistant_attempts
          SET status = 'failed', provider = NULL, model = NULL, usage_json = NULL,
              error_code = 'generation_cancelled', terminal_json = NULL,
              updated_at = ?, completed_at = ?
          WHERE id = ? AND user_id = ? AND chat_id = ?
            AND (
              status = 'pending'
              OR (status = 'failed' AND error_code = 'generation_interrupted')
            )
            AND EXISTS (
              SELECT 1
              FROM ai_chat_messages
              WHERE id = ai_chat_assistant_attempts.assistant_message_id
                AND status = 'failed'
                AND error_code = 'generation_cancelled'
                AND updated_at = ?
            )
        `).bind(timestamp, timestamp, attemptId, userId, chatId, timestamp),
        db.prepare(`
          UPDATE ai_chats SET updated_at = ?
          WHERE id = ? AND user_id = ?
            AND EXISTS (
              SELECT 1 FROM ai_chat_assistant_attempts
              WHERE id = ? AND status = 'failed'
                AND error_code = 'generation_cancelled' AND updated_at = ?
            )
        `).bind(timestamp, chatId, userId, attemptId, timestamp),
      ]);
    } catch (error) {
      const recovered = await findTurn(userId, chatId, clientMessageId);
      if (
        recovered?.assistant.status === "failed"
        && recovered.assistant.errorCode === "generation_cancelled"
        && recovered.attempt?.id === attemptId
        && recovered.attempt.status === "failed"
        && recovered.attempt.errorCode === "generation_cancelled"
      ) {
        return { state: "existing", ...recovered } satisfies AiChatTurn;
      }
      throw error;
    }
    if (
      Number(results[0]?.meta.changes || 0) !== 1
      || Number(results[1]?.meta.changes || 0) !== 1
    ) {
      const raced = await findTurn(userId, chatId, clientMessageId);
      if (!raced) repositoryError("conflict", "Turn cancellation could not be persisted.");
      return { state: "existing", ...raced } satisfies AiChatTurn;
    }
    return {
      state: "existing",
      user: existing.user,
      assistant: {
        ...existing.assistant,
        content: "",
        status: "failed",
        provider: null,
        model: null,
        usage: null,
        errorCode: "generation_cancelled",
        terminal: null,
        updatedAt: timestamp,
      },
      attempt: {
        ...attempt,
        status: "failed",
        errorCode: "generation_cancelled",
        terminal: null,
        updatedAt: timestamp,
      },
    } satisfies AiChatTurn;
  }

  return {
    beginTurn,
    cancelTurn,
    createChat,
    deleteChat,
    failTurn,
    finishTurn,
    getCanonicalHistory,
    getChat,
    getChatSummary,
    getCurrentPracticeItems,
    listChats,
    renameChat,
    replacePracticeItems,
  };
}
