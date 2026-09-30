/// <reference types="@cloudflare/vitest-plugin/types" />

import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createAiChatRepository } from "../../lib/ai-chat/repository.ts";

type WorkerTestEnv = {
  DB: D1Database;
  TEST_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as WorkerTestEnv;

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await testEnv.DB.prepare(`
    INSERT INTO users (id, email, display_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    "runtime-user",
    "runtime@example.com",
    "Runtime User",
    "2026-09-01T10:00:00.000Z",
    "2026-09-01T10:00:00.000Z",
  ).run();
});

describe("AI chat lifecycle in the production Workers runtime", () => {
  it("keeps one pending attempt and idempotently reuses the same logical turn", async () => {
    let nextId = 0;
    let nextTime = Date.parse("2026-09-01T10:01:00.000Z");
    const repository = createAiChatRepository(testEnv.DB, {
      createId: (kind) => `runtime-${kind}-${++nextId}`,
      now: () => new Date(nextTime++).toISOString(),
    });
    const chat = await repository.createChat("runtime-user");
    const first = await repository.beginTurn("runtime-user", chat.id, {
      clientMessageId: "client-turn-1",
      content: "Please teach me resilient.",
      practiceContext: [],
      configuredProvenance: { provider: "test", model: "test/model" },
    });

    const duplicate = await repository.beginTurn("runtime-user", chat.id, {
      clientMessageId: "client-turn-1",
      content: "Please teach me resilient.",
      practiceContext: [],
      configuredProvenance: { provider: "test", model: "test/model" },
    });

    expect(first.state).toBe("created");
    expect(duplicate.state).toBe("existing");
    expect(duplicate.user.id).toBe(first.user.id);
    expect(duplicate.assistant.id).toBe(first.assistant.id);
    expect(duplicate.attempt?.id).toBe(first.attempt?.id);

    await expect(repository.beginTurn("runtime-user", chat.id, {
      clientMessageId: "client-turn-2",
      content: "Start another turn while the first is pending.",
      practiceContext: [],
      configuredProvenance: { provider: "test", model: "test/model" },
    })).rejects.toMatchObject({ code: "turn_in_progress" });

    await repository.finishTurn("runtime-user", chat.id, "client-turn-1", {
      attemptId: first.attempt?.id || "",
      content: "Resilient means able to recover quickly.",
      provider: "test",
      model: "test/model",
      terminal: { termination: "provider_finish", finishReason: "stop" },
    });

    const second = await repository.beginTurn("runtime-user", chat.id, {
      clientMessageId: "client-turn-2",
      content: "Now start the next turn.",
      practiceContext: [],
      configuredProvenance: { provider: "test", model: "test/model" },
    });
    expect(second.state).toBe("created");

    const detail = await repository.getChat("runtime-user", chat.id);
    expect(detail?.messages.map((message) => [message.role, message.status])).toEqual([
      ["user", "complete"],
      ["assistant", "complete"],
      ["user", "complete"],
      ["assistant", "pending"],
    ]);
  });
  it("renames, previews and deletes an owned chat with D1 enforcing the cascades", async () => {
    let nextId = 0;
    let nextTime = Date.parse("2026-09-01T11:00:00.000Z");
    const repository = createAiChatRepository(testEnv.DB, {
      createId: (kind) => `manage-${kind}-${++nextId}`,
      now: () => new Date(nextTime++).toISOString(),
    });
    const chat = await repository.createChat("runtime-user", { openingMessage: "Welcome **back**." });
    const started = await repository.beginTurn("runtime-user", chat.id, {
      clientMessageId: "manage-turn-1",
      content: "Teach me resilient.",
      practiceContext: [],
      configuredProvenance: { provider: "test", model: "test/model" },
    });
    await repository.finishTurn("runtime-user", chat.id, "manage-turn-1", {
      attemptId: started.attempt?.id || "",
      content: "Resilient means able to recover.",
      provider: "test",
      model: "test/model",
      terminal: { termination: "provider_finish", finishReason: "stop" },
    });

    const [listed] = (await repository.listChats("runtime-user")).filter((item) => item.id === chat.id);
    expect(listed.preview).toBe("Resilient means able to recover.");
    const renamed = await repository.renameChat("runtime-user", chat.id, "  Resilience   drill ");
    expect(renamed.title).toBe("Resilience drill");
    await expect(repository.renameChat("someone-else", chat.id, "Nope")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(repository.deleteChat("someone-else", chat.id)).rejects.toMatchObject({
      code: "not_found",
    });

    await repository.deleteChat("runtime-user", chat.id);
    expect(await repository.getChat("runtime-user", chat.id)).toBeNull();
    for (const table of ["ai_chat_messages", "ai_chat_assistant_attempts", "ai_chat_practice_items"]) {
      const row = await testEnv.DB.prepare(`SELECT count(*) AS count FROM ${table} WHERE chat_id = ?`)
        .bind(chat.id)
        .first<{ count: number }>();
      expect(row?.count, table).toBe(0);
    }
  });
});
