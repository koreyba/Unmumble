import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().default(""),
  displayName: text("display_name").notNull().default(""),
  nativeLanguage: text("native_language").notNull().default("ru"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const appSessions = sqliteTable("app_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
}, (table) => [
  index("idx_app_sessions_user").on(table.userId),
  index("idx_app_sessions_expires").on(table.expiresAt),
]);

export const feedbackSubmissions = sqliteTable("feedback_submissions", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  message: text("message").notNull(),
  pageUrl: text("page_url").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  telegramStatus: text("telegram_status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  telegramDeliveredAt: text("telegram_delivered_at"),
}, (table) => [
  index("idx_feedback_created").on(sql`${table.createdAt} DESC`),
  check(
    "feedback_submissions_category_check",
    sql`${table.category} IN ('bug', 'idea', 'other')`,
  ),
  check(
    "feedback_submissions_message_check",
    sql`length(${table.message}) BETWEEN 1 AND 2000`,
  ),
  check(
    "feedback_submissions_telegram_status_check",
    sql`${table.telegramStatus} IN ('pending', 'sent', 'not_configured', 'failed')`,
  ),
]);

export const phrases = sqliteTable("phrases", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  pattern: text("pattern").notNull(),
  ipa: text("ipa").notNull().default(""),
  translation: text("translation").notNull().default(""),
  context: text("context").notNull().default(""),
  sourceType: text("source_type").notNull(),
  catalogOrder: integer("catalog_order"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pick"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_phrases_source_catalog").on(table.sourceType, table.catalogOrder),
  index("idx_phrases_owner_updated").on(table.ownerId, table.updatedAt),
  index("idx_phrases_text_nocase").on(sql`${table.text} COLLATE NOCASE`),
  uniqueIndex("idx_phrases_custom_owner_text_nocase")
    .on(table.ownerId, sql`${table.text} COLLATE NOCASE`)
    .where(sql`${table.sourceType} = 'custom' AND ${table.ownerId} IS NOT NULL`),
]);

export const catalogPhraseAnalysis = sqliteTable("catalog_phrase_analysis", {
  phraseId: text("phrase_id").primaryKey().references(() => phrases.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  rank: integer("rank").notNull(),
  pattern: text("pattern").notNull(),
  ipa: text("ipa").notNull(),
  searchQuery: text("search_query").notNull(),
  alternateQuery: text("alternate_query"),
  active: integer("active").notNull().default(1),
}, (table) => [
  index("idx_catalog_analysis_active_kind_rank").on(table.active, table.kind, table.rank),
]);

export const phraseMechanisms = sqliteTable("phrase_mechanisms", {
  phraseId: text("phrase_id").notNull().references(() => phrases.id, { onDelete: "cascade" }),
  mechanism: text("mechanism").notNull(),
  displayOrder: integer("display_order").notNull(),
}, (table) => [
  primaryKey({ columns: [table.phraseId, table.mechanism] }),
  index("idx_phrase_mechanisms_mechanism_phrase").on(table.mechanism, table.phraseId),
]);

export const phraseProgress = sqliteTable("phrase_progress", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phraseId: text("phrase_id").notNull().references(() => phrases.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pick"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.phraseId] }),
  index("idx_phrase_progress_phrase_user").on(table.phraseId, table.userId),
  index("idx_phrase_progress_user_status_created")
    .on(table.userId, table.status, sql`${table.createdAt} DESC`, sql`${table.phraseId} DESC`),
]);

export const phraseExamples = sqliteTable("phrase_examples", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phraseId: text("phrase_id").notNull().references(() => phrases.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  query: text("query").notNull(),
  caption: text("caption").notNull().default(""),
  accent: text("accent").notNull().default(""),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_phrase_examples_phrase_provider_external")
    .on(table.userId, table.phraseId, table.provider, table.externalId),
  index("idx_phrase_examples_user_phrase_created")
    .on(table.userId, table.phraseId, table.createdAt),
]);

export const savedVideos = sqliteTable("saved_videos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  youtubeVideoId: text("youtube_video_id").notNull(),
  originPhraseId: text("origin_phrase_id").references(() => phrases.id, { onDelete: "set null" }),
  originQuery: text("origin_query").notNull().default(""),
  restoreQuery: text("restore_query").notNull().default(""),
  restoreAnchorSeconds: real("restore_anchor_seconds").notNull().default(-1),
  originCaption: text("origin_caption").notNull().default(""),
  language: text("language").notNull().default("english"),
  accent: text("accent").notNull().default(""),
  resumeSeconds: real("resume_seconds").notNull().default(0),
  resumeCaptionId: text("resume_caption_id").notNull().default(""),
  resumeCaptionText: text("resume_caption_text").notNull().default(""),
  progressUpdatedAt: text("progress_updated_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_saved_videos_user_youtube")
    .on(table.userId, table.youtubeVideoId),
  index("idx_saved_videos_user_updated")
    .on(table.userId, table.updatedAt),
  index("idx_saved_videos_user_updated_id")
    .on(table.userId, sql`${table.updatedAt} DESC`, sql`${table.id} ASC`),
]);

export const integrationSecrets = sqliteTable("integration_secrets", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  encryptionVersion: integer("encryption_version").notNull().default(2),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_integration_secrets_user_provider")
    .on(table.userId, table.provider),
]);

export const phraseMeanings = sqliteTable("phrase_meanings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phraseId: text("phrase_id").notNull().references(() => phrases.id, { onDelete: "cascade" }),
  translation: text("translation").notNull(),
  normalizedTranslation: text("normalized_translation").notNull(),
  context: text("context").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_phrase_meanings_user_phrase_updated")
    .on(table.userId, table.phraseId, table.updatedAt),
  uniqueIndex("idx_phrase_meanings_user_phrase_normalized")
    .on(table.userId, table.phraseId, table.normalizedTranslation),
  index("idx_phrase_meanings_user_phrase_created")
    .on(table.userId, table.phraseId, table.createdAt, table.id),
]);

export const aiChats = sqliteTable("ai_chats", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  explanationLanguage: text("explanation_language").notNull().default("ru"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_ai_chats_user_updated").on(table.userId, table.updatedAt),
]);

export const aiChatPracticeItems = sqliteTable("ai_chat_practice_items", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  phraseId: text("phrase_id").references(() => phrases.id, { onDelete: "set null" }),
  textSnapshot: text("text_snapshot").notNull(),
  meaningMode: text("meaning_mode").notNull(),
  selectedMeaningId: text("selected_meaning_id").references(() => phraseMeanings.id, { onDelete: "set null" }),
  selectedMeaningSnapshot: text("selected_meaning_snapshot").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_ai_chat_practice_items_chat_created").on(table.chatId, table.createdAt),
  check(
    "ai_chat_practice_items_meaning_mode_check",
    sql`${table.meaningMode} IN ('all_saved', 'selected', 'explore')`,
  ),
]);

export const aiChatMessages = sqliteTable("ai_chat_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  sequence: integer("sequence").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull(),
  practiceContextJson: text("practice_context_json").notNull().default("[]"),
  clientMessageId: text("client_message_id").notNull(),
  provider: text("provider"),
  model: text("model"),
  usageJson: text("usage_json"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  index("idx_ai_chat_messages_chat_sequence").on(table.chatId, table.sequence),
  uniqueIndex("idx_ai_chat_messages_chat_sequence_unique").on(table.chatId, table.sequence),
  uniqueIndex("idx_ai_chat_messages_chat_client_role")
    .on(table.chatId, table.clientMessageId, table.role),
  check("ai_chat_messages_role_check", sql`${table.role} IN ('user', 'assistant')`),
  check(
    "ai_chat_messages_status_check",
    sql`${table.status} IN ('complete', 'pending', 'failed')`,
  ),
]);

export const aiChatAssistantAttempts = sqliteTable("ai_chat_assistant_attempts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  userMessageId: text("user_message_id").notNull().references(() => aiChatMessages.id, { onDelete: "cascade" }),
  assistantMessageId: text("assistant_message_id").notNull().references(() => aiChatMessages.id, { onDelete: "cascade" }),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull(),
  configuredProvider: text("configured_provider").notNull().default("unknown"),
  configuredModel: text("configured_model").notNull().default("unknown"),
  provider: text("provider"),
  model: text("model"),
  usageJson: text("usage_json"),
  errorCode: text("error_code"),
  terminalJson: text("terminal_json"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  uniqueIndex("idx_ai_chat_assistant_attempts_message_number")
    .on(table.assistantMessageId, table.attemptNumber),
  uniqueIndex("idx_ai_chat_assistant_attempts_one_pending")
    .on(table.assistantMessageId)
    .where(sql`${table.status} = 'pending'`),
  uniqueIndex("idx_ai_chat_assistant_attempts_one_pending_chat")
    .on(table.chatId)
    .where(sql`${table.status} = 'pending'`),
  index("idx_ai_chat_assistant_attempts_user_chat_created")
    .on(table.userId, table.chatId, table.createdAt),
  check(
    "ai_chat_assistant_attempts_number_check",
    sql`${table.attemptNumber} > 0`,
  ),
  check(
    "ai_chat_assistant_attempts_status_check",
    sql`${table.status} IN ('pending', 'complete', 'failed', 'expired')`,
  ),
  check(
    "ai_chat_assistant_attempts_usage_json_check",
    sql`${table.usageJson} IS NULL OR (json_valid(${table.usageJson}) AND length(${table.usageJson}) <= 4096)`,
  ),
  check(
    "ai_chat_assistant_attempts_terminal_json_check",
    sql`${table.terminalJson} IS NULL OR (json_valid(${table.terminalJson}) AND length(${table.terminalJson}) <= 2048)`,
  ),
]);

export const aiChatToolMutationReceipts = sqliteTable("ai_chat_tool_mutation_receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  userMessageId: text("user_message_id").notNull().references(() => aiChatMessages.id, { onDelete: "cascade" }),
  committedByAttemptId: text("committed_by_attempt_id").notNull().references(
    () => aiChatAssistantAttempts.id,
    { onDelete: "cascade" },
  ),
  providerToolCallId: text("provider_tool_call_id").notNull(),
  toolName: text("tool_name").notNull(),
  operation: text("operation").notNull(),
  targetKey: text("target_key").notNull(),
  argsJson: text("args_json").notNull(),
  argsSha256: text("args_sha256").notNull(),
  status: text("status").notNull(),
  resultJson: text("result_json").notNull(),
  errorCode: text("error_code"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at").notNull(),
}, (table) => [
  uniqueIndex("idx_ai_chat_tool_receipts_message_operation_target")
    .on(table.userMessageId, table.operation, table.targetKey),
  index("idx_ai_chat_tool_receipts_user_chat_completed")
    .on(table.userId, table.chatId, table.completedAt),
  index("idx_ai_chat_tool_receipts_attempt")
    .on(table.committedByAttemptId),
  check(
    "ai_chat_tool_receipts_status_check",
    sql`${table.status} IN ('committed', 'rejected')`,
  ),
  check(
    "ai_chat_tool_receipts_args_json_check",
    sql`json_valid(${table.argsJson}) AND length(${table.argsJson}) <= 4096`,
  ),
  check(
    "ai_chat_tool_receipts_result_json_check",
    sql`json_valid(${table.resultJson}) AND length(${table.resultJson}) <= 8192`,
  ),
  check(
    "ai_chat_tool_receipts_args_hash_check",
    sql`length(${table.argsSha256}) = 64 AND ${table.argsSha256} NOT GLOB '*[^0-9a-f]*'`,
  ),
  check(
    "ai_chat_tool_receipts_metadata_check",
    sql`length(${table.providerToolCallId}) BETWEEN 1 AND 240 AND length(${table.toolName}) BETWEEN 1 AND 120 AND length(${table.operation}) BETWEEN 1 AND 120 AND length(${table.targetKey}) BETWEEN 1 AND 1400`,
  ),
  check(
    "ai_chat_tool_receipts_entity_check",
    sql`${table.entityId} IS NULL OR ${table.entityType} IS NOT NULL`,
  ),
]);

export const aiChatToolCalls = sqliteTable("ai_chat_tool_calls", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  userMessageId: text("user_message_id").notNull().references(() => aiChatMessages.id, { onDelete: "cascade" }),
  assistantAttemptId: text("assistant_attempt_id").notNull().references(
    () => aiChatAssistantAttempts.id,
    { onDelete: "cascade" },
  ),
  providerToolCallId: text("provider_tool_call_id").notNull(),
  toolName: text("tool_name").notNull(),
  argsJson: text("args_json").notNull(),
  argsSha256: text("args_sha256").notNull(),
  status: text("status").notNull(),
  resultJson: text("result_json"),
  errorCode: text("error_code"),
  receiptId: text("receipt_id").references(
    () => aiChatToolMutationReceipts.id,
    { onDelete: "cascade" },
  ),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, (table) => [
  uniqueIndex("idx_ai_chat_tool_calls_attempt_provider_call")
    .on(table.assistantAttemptId, table.providerToolCallId),
  index("idx_ai_chat_tool_calls_user_chat_created")
    .on(table.userId, table.chatId, table.createdAt),
  index("idx_ai_chat_tool_calls_receipt")
    .on(table.receiptId),
  check(
    "ai_chat_tool_calls_status_check",
    sql`${table.status} IN ('received', 'succeeded', 'committed', 'replayed', 'rejected', 'failed')`,
  ),
  check(
    "ai_chat_tool_calls_args_json_check",
    sql`json_valid(${table.argsJson}) AND length(${table.argsJson}) <= 4096`,
  ),
  check(
    "ai_chat_tool_calls_result_json_check",
    sql`${table.resultJson} IS NULL OR (json_valid(${table.resultJson}) AND length(${table.resultJson}) <= 8192)`,
  ),
  check(
    "ai_chat_tool_calls_args_hash_check",
    sql`length(${table.argsSha256}) = 64 AND ${table.argsSha256} NOT GLOB '*[^0-9a-f]*'`,
  ),
  check(
    "ai_chat_tool_calls_metadata_check",
    sql`length(${table.providerToolCallId}) BETWEEN 1 AND 240 AND length(${table.toolName}) BETWEEN 1 AND 120`,
  ),
]);

export const aiChatVocabularyWriteProposals = sqliteTable("ai_chat_vocabulary_write_proposals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chatId: text("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  userMessageId: text("user_message_id").notNull().references(
    () => aiChatMessages.id,
    { onDelete: "cascade" },
  ),
  assistantMessageId: text("assistant_message_id").notNull().references(
    () => aiChatMessages.id,
    { onDelete: "cascade" },
  ),
  originAttemptId: text("origin_attempt_id").notNull().references(
    () => aiChatAssistantAttempts.id,
    { onDelete: "cascade" },
  ),
  originToolCallId: text("origin_tool_call_id").notNull().references(
    () => aiChatToolCalls.id,
    { onDelete: "cascade" },
  ),
  operation: text("operation").notNull(),
  targetKey: text("target_key").notNull(),
  mutationInputJson: text("mutation_input_json").notNull(),
  mutationInputSha256: text("mutation_input_sha256").notNull(),
  publicJson: text("public_json").notNull(),
  status: text("status").notNull(),
  resultJson: text("result_json"),
  errorCode: text("error_code"),
  receiptId: text("receipt_id").references(
    () => aiChatToolMutationReceipts.id,
    { onDelete: "set null" },
  ),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  decidedAt: text("decided_at"),
}, (table) => [
  uniqueIndex("idx_ai_chat_write_proposals_attempt_operation_target")
    .on(table.originAttemptId, table.operation, table.targetKey),
  uniqueIndex("idx_ai_chat_write_proposals_origin_call")
    .on(table.originToolCallId),
  index("idx_ai_chat_write_proposals_user_chat_assistant_created")
    .on(table.userId, table.chatId, table.assistantMessageId, table.createdAt),
  index("idx_ai_chat_write_proposals_receipt").on(table.receiptId),
  check(
    "ai_chat_write_proposals_status_check",
    sql`${table.status} IN ('pending', 'committed', 'cancelled', 'conflict')`,
  ),
  check(
    "ai_chat_write_proposals_input_json_check",
    sql`json_valid(${table.mutationInputJson}) AND length(${table.mutationInputJson}) <= 4096`,
  ),
  check(
    "ai_chat_write_proposals_public_json_check",
    sql`json_valid(${table.publicJson}) AND length(${table.publicJson}) <= 4096`,
  ),
  check(
    "ai_chat_write_proposals_result_json_check",
    sql`${table.resultJson} IS NULL OR (json_valid(${table.resultJson}) AND length(${table.resultJson}) <= 8192)`,
  ),
  check(
    "ai_chat_write_proposals_input_hash_check",
    sql`length(${table.mutationInputSha256}) = 64 AND ${table.mutationInputSha256} NOT GLOB '*[^0-9a-f]*'`,
  ),
  check(
    "ai_chat_write_proposals_metadata_check",
    sql`length(${table.operation}) BETWEEN 1 AND 120 AND length(${table.targetKey}) BETWEEN 1 AND 1400`,
  ),
  check(
    "ai_chat_write_proposals_lifecycle_check",
    sql`(
      ${table.status} = 'pending'
      AND ${table.resultJson} IS NULL
      AND ${table.errorCode} IS NULL
      AND ${table.receiptId} IS NULL
      AND ${table.decidedAt} IS NULL
    ) OR (
      ${table.status} = 'committed'
      AND ${table.resultJson} IS NOT NULL
      AND ${table.errorCode} IS NULL
      AND ${table.receiptId} IS NOT NULL
      AND ${table.decidedAt} IS NOT NULL
    ) OR (
      ${table.status} = 'cancelled'
      AND ${table.resultJson} IS NULL
      AND ${table.errorCode} IS NULL
      AND ${table.receiptId} IS NULL
      AND ${table.decidedAt} IS NOT NULL
    ) OR (
      ${table.status} = 'conflict'
      AND ${table.errorCode} IS NOT NULL
      AND ${table.receiptId} IS NULL
      AND ${table.decidedAt} IS NOT NULL
    )`,
  ),
]);
