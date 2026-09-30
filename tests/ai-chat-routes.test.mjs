import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const httpModule = await import("../lib/ai-chat/http.ts").catch(() => ({}));

const routeUrls = {
  chats: new URL("../app/api/ai/chats/route.ts", import.meta.url),
  detail: new URL("../app/api/ai/chats/[chatId]/route.ts", import.meta.url),
  targets: new URL("../app/api/ai/chats/[chatId]/targets/route.ts", import.meta.url),
  messages: new URL("../app/api/ai/chats/[chatId]/messages/route.ts", import.meta.url),
  cancelTurn: new URL(
    "../app/api/ai/chats/[chatId]/messages/[clientMessageId]/cancel/route.ts",
    import.meta.url,
  ),
  meanings: new URL("../app/api/ai/meanings/route.ts", import.meta.url),
  writeProposal: new URL(
    "../app/api/ai/chats/[chatId]/write-proposals/[proposalId]/route.ts",
    import.meta.url,
  ),
};
const httpUrl = new URL("../lib/ai-chat/http.ts", import.meta.url);
const clientUrl = new URL("../lib/ai-chat/client.ts", import.meta.url);
const serverConfigUrl = new URL("../lib/ai-chat/server-config.ts", import.meta.url);

async function sources() {
  return Object.fromEntries(await Promise.all(
    Object.entries(routeUrls).map(async ([name, url]) => [name, await readFile(url, "utf8")]),
  ));
}

test("every AI route stays dynamic, authenticated, owner-scoped, and uncached", async () => {
  const routeSources = await sources();
  for (const [name, source] of Object.entries(routeSources)) {
    assert.match(source, /export const dynamic = "force-dynamic"/, name);
    assert.match(source, /getCurrentUser\(request\)/, name);
    assert.match(source, /unauthorizedResponse\(\)/, name);
    assert.match(
      source,
      /create(?:AiChat|AiChatWriteProposal|Vocabulary)Repository\((?:getD1\(\)|db)/,
      name,
    );
    assert.match(source, /noStoreJson|aiChatErrorResponse|createUIMessageStreamResponse/, name);
    assert.doesNotMatch(source, /request\.json\(\)/, name);
    assert.doesNotMatch(source, /process\.env|OPENROUTER_API_KEY\s*[:=]\s*["']sk-/, name);
  }
  assert.match(routeSources.messages, /createAiChatRepository\(db\)/);
  assert.match(routeSources.messages, /createVocabularyRepository\(db\)/);
  assert.match(routeSources.messages, /createVocabularyMutationPlanner\(db\)/);
  assert.match(routeSources.messages, /createAiChatToolTraceRepository\(db\)/);
  assert.match(routeSources.meanings, /createVocabularyRepository\(getD1\(\)\)/);
  assert.match(routeSources.writeProposal, /createAiChatWriteProposalRepository\(db/);
});

test("AI mutations share the exact-origin bounded body boundary", async () => {
  const routeSources = await sources();
  for (const name of [
    "chats",
    "detail",
    "targets",
    "messages",
    "cancelTurn",
    "meanings",
    "writeProposal",
  ]) {
    assert.match(routeSources[name], /readAiMutationPayload\(/, name);
  }
  assert.match(routeSources.chats, /readCreateChatPayload/);
  assert.match(routeSources.detail, /readRenameChatPayload/);
  assert.match(routeSources.targets, /readReplaceTargetsPayload/);
  assert.match(routeSources.messages, /readGenerateMessagePayload/);
  assert.match(routeSources.cancelTurn, /readCancelTurnPayload/);
  assert.match(routeSources.meanings, /readCreateMeaningPayload/);
  assert.match(routeSources.writeProposal, /readWriteProposalDecisionPayload/);
});

test("turn cancellation route terminalizes through the owner-scoped service without generation", async () => {
  const routeSources = await sources();
  assert.match(routeSources.cancelTurn, /export async function POST/);
  assert.match(routeSources.cancelTurn, /cancelAiChatTurn\(/);
  assert.match(routeSources.cancelTurn, /createAiChatRepository\(getD1\(\)\)/);
  assert.match(routeSources.cancelTurn, /toPublicAiChatTurnTerminal\(/);
  assert.match(routeSources.cancelTurn, /event: "ai_chat_turn_cancelled"/);
  assert.doesNotMatch(routeSources.cancelTurn, /prepareAiChatGeneration|createUIMessageStreamResponse/);
  assert.doesNotMatch(routeSources.cancelTurn, /enforceAiChatGenerationRateLimit/);
});

test("message streaming delegates canonical state and configuration to the service", async () => {
  const routeSources = await sources();
  assert.match(routeSources.messages, /enforceAiChatGenerationRateLimit\(/);
  assert.match(routeSources.messages, /getAiChatRateLimitBindings\(\)/);
  assert.match(routeSources.messages, /recordAiChatOperationalEvent\(/);
  assert.ok(
    routeSources.messages.indexOf("enforceAiChatGenerationRateLimit(")
      < routeSources.messages.indexOf("getD1()"),
    "the availability gate must run before starting a D1/provider turn",
  );
  assert.match(routeSources.messages, /prepareAiChatGeneration\(/);
  assert.match(routeSources.messages, /getAiChatServerConfig\(\)/);
  assert.match(routeSources.messages, /createUIMessageStreamResponse\(/);
  assert.match(routeSources.messages, /abortSignal:\s*request\.signal/);
  assert.match(routeSources.messages, /aiChatRouteErrorResponse\(error\)/);
  assert.doesNotMatch(routeSources.messages, /messages\s*:/);
  assert.doesNotMatch(routeSources.messages, /model\s*:\s*payload/);
});

test("chat configuration status delegates to the runtime model allowlist", async () => {
  const source = await readFile(serverConfigUrl, "utf8");
  assert.match(source, /isAiChatRuntimeConfigured/);
  assert.match(
    source,
    /return isAiChatRuntimeConfigured\(getAiChatServerConfig\(\)\)/,
  );
  assert.doesNotMatch(source, /config\.model\?\.trim\(\)/);
});

test("chat, target, and meaning routes expose the complete first-slice persistence API", async () => {
  const routeSources = await sources();
  assert.match(routeSources.chats, /export async function GET/);
  assert.match(routeSources.chats, /export async function POST/);
  assert.match(routeSources.detail, /export async function GET/);
  assert.match(routeSources.detail, /export async function PATCH/);
  assert.match(routeSources.detail, /export async function DELETE/);
  assert.match(routeSources.targets, /export async function PATCH/);
  assert.match(routeSources.meanings, /export async function GET/);
  assert.match(routeSources.meanings, /export async function POST/);
  assert.match(routeSources.writeProposal, /export async function PATCH/);
  assert.match(routeSources.chats, /generationConfigured/);
  assert.match(routeSources.chats, /createChatWithVocabularyOpening\(/);
  assert.doesNotMatch(routeSources.chats, /repository\.createChat\(/);
});

test("chat routes expose a whitelisted public message contract", async () => {
  assert.equal(typeof httpModule.toPublicAiChatDetail, "function");
  const chat = httpModule.toPublicAiChatDetail({
    id: "chat-1",
    title: "Practice",
    explanationLanguage: "ru",
    targetCount: 0,
    messageCount: 1,
    preview: "Hello",
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:01.000Z",
    targets: [],
    writeProposals: [{
      id: "proposal-1",
      assistantMessageId: "message-1",
      operation: "add_vocabulary_entries",
      items: [{ id: "entry-1", text: "uncanny", translation: "странный" }],
      status: "pending",
      result: null,
      errorCode: null,
      createdAt: "2026-08-29T10:00:01.000Z",
      decidedAt: null,
      targetKey: "must-not-leak",
      mutationInput: { entries: [{ text: "must-not-leak" }] },
    }],
    messages: [{
      id: "message-1",
      role: "assistant",
      sequence: 1,
      content: "Hello",
      status: "complete",
      practiceContext: [],
      clientMessageId: "opening:chat-1",
      provider: "openrouter",
      model: "private/model-routing-id",
      usage: { inputTokens: 123, outputTokens: 45 },
      errorCode: null,
      terminal: {
        finishReason: "length",
        elapsedMs: 12_345,
        rawError: "must-not-leak",
      },
      createdAt: "2026-08-29T10:00:00.000Z",
      updatedAt: "2026-08-29T10:00:01.000Z",
    }],
  });

  assert.equal(chat.preview, "Hello");
  assert.deepEqual(chat.messages, [{
    id: "message-1",
    role: "assistant",
    sequence: 1,
    content: "Hello",
    status: "complete",
    clientMessageId: "opening:chat-1",
    errorCode: null,
    terminal: { finishReason: "length", elapsedMs: 12_345 },
    createdAt: "2026-08-29T10:00:00.000Z",
    updatedAt: "2026-08-29T10:00:01.000Z",
  }]);
  assert.equal("provider" in chat.messages[0], false);
  assert.equal("model" in chat.messages[0], false);
  assert.equal("usage" in chat.messages[0], false);
  assert.equal("practiceContext" in chat.messages[0], false);
  assert.equal(JSON.stringify(chat.messages).includes("must-not-leak"), false);
  assert.deepEqual(chat.writeProposals, [{
    id: "proposal-1",
    assistantMessageId: "message-1",
    operation: "add_vocabulary_entries",
    items: [{ id: "entry-1", text: "uncanny", translation: "странный" }],
    status: "pending",
    result: null,
    errorCode: null,
    createdAt: "2026-08-29T10:00:01.000Z",
    decidedAt: null,
  }]);
  assert.equal("targetKey" in chat.writeProposals[0], false);
  assert.equal("mutationInput" in chat.writeProposals[0], false);

  const routeSources = await sources();
  assert.match(routeSources.chats, /toPublicAiChatDetail\(chat\)/);
  assert.match(routeSources.detail, /toPublicAiChatDetail\(chat\)/);
  assert.match(routeSources.detail, /listForChat\(/);
});

test("turn cancellation exposes only the stable public terminal message state", () => {
  const terminal = httpModule.toPublicAiChatTurnTerminal({
    state: "existing",
    user: {
      id: "user-row",
      clientMessageId: "turn-1",
      content: "private prompt",
    },
    assistant: {
      id: "assistant-row",
      status: "failed",
      errorCode: "generation_cancelled",
      provider: "private-provider",
      model: "private-model",
      usage: { inputTokens: 123 },
    },
    attempt: {
      id: "attempt-row",
      status: "failed",
      errorCode: "generation_cancelled",
      configuredProvenance: { provider: "private", model: "private" },
    },
  });

  assert.deepEqual(terminal, {
    clientMessageId: "turn-1",
    assistantMessageId: "assistant-row",
    status: "failed",
    errorCode: "generation_cancelled",
  });
  assert.equal("attempt" in terminal, false);
  assert.equal("provider" in terminal, false);
  assert.equal("model" in terminal, false);
  assert.equal("usage" in terminal, false);
});

test("server and browser share explicit allowlisted chat DTOs", async () => {
  const [httpSource, clientSource] = await Promise.all([
    readFile(httpUrl, "utf8"),
    readFile(clientUrl, "utf8"),
  ]);
  assert.match(httpSource, /from "\.\/public-contracts\.ts"/u);
  assert.match(clientSource, /from "\.\/public-contracts\.ts"/u);
  assert.doesNotMatch(httpSource, /\bOmit</u);
  assert.doesNotMatch(clientSource, /export type AiChatClientMessage = \{/u);
});

test("renaming and deleting a chat are owner-scoped, exact-origin, and never leak the row", async () => {
  const { detail } = await sources();

  // Both mutations go through the authenticated user's subject only.
  assert.match(detail, /repository\.renameChat\(user\.subject, chatId\.value, payload\.value\.title\)/);
  assert.match(detail, /repository\.deleteChat\(user\.subject, chatId\.value\)/);
  // DELETE has no body, so the exact-origin check runs before anything else happens.
  const deleteHandler = detail.slice(detail.indexOf("export async function DELETE"));
  assert.ok(
    deleteHandler.indexOf("hasSameOrigin(request)") < deleteHandler.indexOf("deleteChat("),
    "origin is verified before deleting",
  );
  assert.match(deleteHandler, /invalid_origin/);
  assert.match(deleteHandler, /noStoreJson\(\{ deleted: true \}\)/);
  assert.match(detail, /noStoreJson\(\{ chat \}\)/);
});
