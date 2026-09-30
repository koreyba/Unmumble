import assert from "node:assert/strict";
import test from "node:test";

const api = await import("../lib/ai-chat/api-contracts.ts").catch(() => ({}));

test("chat creation accepts an empty practice set or a bounded target list only", () => {
  assert.deepEqual(api.readCreateChatPayload({}), { ok: true, value: { targets: [] } });
  assert.deepEqual(
    api.readCreateChatPayload({
      targets: [
        { phraseId: " phrase-1 ", meaningMode: "all_saved" },
        { text: " get away ", meaningMode: "explore" },
      ],
    }),
    {
      ok: true,
      value: {
        targets: [
          { source: "saved", phraseId: "phrase-1", meaningMode: "all_saved" },
          { source: "ad_hoc", text: "get away", meaningMode: "explore" },
        ],
      },
    },
  );
  assert.deepEqual(api.readCreateChatPayload({ history: [] }), {
    ok: false,
    error: { code: "invalid_request", status: 400 },
  });
  assert.deepEqual(
    api.readCreateChatPayload({
      targets: Array.from({ length: 13 }, (_, index) => ({ text: `target-${index}` })),
    }),
    { ok: false, error: { code: "target_limit", status: 400 } },
  );
});

test("target replacement requires one exact bounded target array", () => {
  assert.deepEqual(api.readReplaceTargetsPayload({ targets: [] }), {
    ok: true,
    value: { targets: [] },
  });
  for (const payload of [{}, { targets: "issue" }, { targets: [], model: "other" }]) {
    assert.deepEqual(api.readReplaceTargetsPayload(payload), {
      ok: false,
      error: { code: "invalid_request", status: 400 },
    });
  }
});

test("generation accepts only a client id and one bounded user message", () => {
  assert.deepEqual(
    api.readGenerateMessagePayload({ clientMessageId: " turn-1 ", content: "  One\r\nexample  " }),
    { ok: true, value: { clientMessageId: "turn-1", content: "One\nexample" } },
  );
  for (const payload of [
    { clientMessageId: "turn-1", content: "hello", messages: [] },
    { clientMessageId: "turn-1", content: "hello", role: "system" },
    { clientMessageId: "turn-1", content: "hello", model: "other" },
    { clientMessageId: "turn-1", content: "hello", targets: [] },
    { clientMessageId: "turn-1", content: "hello", history: [] },
    { clientMessageId: "", content: "hello" },
    { clientMessageId: "turn-1", content: "🙂".repeat(4_001) },
  ]) {
    assert.equal(api.readGenerateMessagePayload(payload).ok, false);
  }
});

test("meaning creation is explicit, bounded, and cannot carry progress state", () => {
  assert.deepEqual(
    api.readCreateMeaningPayload({
      phraseId: " phrase-1 ",
      translation: "  управлять  ",
      context: "  run a company\nwell  ",
    }),
    {
      ok: true,
      value: {
        phraseId: "phrase-1",
        translation: "управлять",
        context: "run a company well",
      },
    },
  );
  for (const payload of [
    { phraseId: "phrase-1", translation: "управлять", status: "learnt" },
    { phraseId: "phrase-1", translation: "" },
    { phraseId: "phrase-1", translation: "x".repeat(1_001) },
  ]) {
    assert.equal(api.readCreateMeaningPayload(payload).ok, false);
  }
});

test("proposal decisions accept only an exact confirm or cancel command", () => {
  assert.deepEqual(api.readWriteProposalDecisionPayload({ decision: "confirm" }), {
    ok: true,
    value: { decision: "confirm" },
  });
  assert.deepEqual(api.readWriteProposalDecisionPayload({ decision: "cancel" }), {
    ok: true,
    value: { decision: "cancel" },
  });
  for (const payload of [
    {},
    { decision: "approve" },
    { decision: "confirm", entries: [{ text: "tampered" }] },
    { decision: "cancel", proposalId: "other" },
  ]) {
    assert.deepEqual(api.readWriteProposalDecisionPayload(payload), {
      ok: false,
      error: { code: "invalid_request", status: 400 },
    });
  }
});

test("turn cancellation accepts an empty command and no client-controlled state", () => {
  assert.deepEqual(api.readCancelTurnPayload({}), { ok: true, value: {} });
  for (const payload of [
    { attemptId: "attempt-1" },
    { errorCode: "generation_cancelled" },
    { status: "failed" },
  ]) {
    assert.deepEqual(api.readCancelTurnPayload(payload), {
      ok: false,
      error: { code: "invalid_request", status: 400 },
    });
  }
});

test("public API errors expose only a stable code and disable caching", async () => {
  const response = api.aiChatErrorResponse({ code: "provider_failed", status: 502 });

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { error: { code: "provider_failed" } });
});

test("one mutation boundary enforces exact origin and bounded JSON before parsing", async () => {
  const parse = (payload) => ({ ok: true, value: payload.content });
  const valid = new Request("https://unmumble.example/api/ai/chats", {
    method: "POST",
    headers: { Origin: "https://unmumble.example" },
    body: JSON.stringify({ content: "hello" }),
  });
  assert.deepEqual(await api.readAiMutationPayload(valid, parse), {
    ok: true,
    value: "hello",
  });

  const crossSite = new Request("https://unmumble.example/api/ai/chats", {
    method: "POST",
    headers: { Origin: "https://elsewhere.example" },
    body: JSON.stringify({ content: "hello" }),
  });
  assert.deepEqual(await api.readAiMutationPayload(crossSite, parse), {
    ok: false,
    error: { code: "invalid_origin", status: 403 },
  });

  const oversized = new Request("https://unmumble.example/api/ai/chats", {
    method: "POST",
    headers: { Origin: "https://unmumble.example" },
    body: JSON.stringify({ content: "x".repeat(17_000) }),
  });
  assert.deepEqual(await api.readAiMutationPayload(oversized, parse), {
    ok: false,
    error: { code: "request_too_large", status: 413 },
  });
});

test("renaming accepts exactly one trimmed single-line title up to 100 characters", () => {
  assert.deepEqual(api.readRenameChatPayload({ title: "  My\n  chat  " }), {
    ok: true,
    value: { title: "My chat" },
  });
  assert.deepEqual(api.readRenameChatPayload({ title: "x".repeat(100) }).ok, true);
  assert.deepEqual(api.readRenameChatPayload({ title: "x".repeat(101) }), {
    ok: false,
    error: { code: "field_too_long", status: 400 },
  });
  for (const payload of [{}, { title: "" }, { title: "   " }, { title: 4 }]) {
    assert.equal(api.readRenameChatPayload(payload).ok, false);
  }
  assert.deepEqual(api.readRenameChatPayload({ title: "ok", userId: "someone-else" }), {
    ok: false,
    error: { code: "invalid_request", status: 400 },
  });
});
