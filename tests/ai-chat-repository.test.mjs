import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryModule = await import("../lib/ai-chat/repository.ts").catch(() => ({}));
const vocabularyModule = await import("../lib/vocabulary/repository.ts").catch(() => ({}));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

class SQLiteD1Statement {
  constructor(database, sql, bindings = [], observeRows = () => {}, beforeExecute = () => {}) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
    this.observeRows = observeRows;
    this.beforeExecute = beforeExecute;
  }

  bind(...bindings) {
    return new SQLiteD1Statement(
      this.database,
      this.sql,
      bindings,
      this.observeRows,
      this.beforeExecute,
    );
  }

  execute() {
    this.beforeExecute(this.sql);
    const statement = this.database.prepare(this.sql);
    if (/^\s*(?:SELECT|WITH|PRAGMA)\b/iu.test(this.sql)) {
      return { results: statement.all(...this.bindings), success: true, meta: {} };
    }
    const result = statement.run(...this.bindings);
    return {
      results: [],
      success: true,
      meta: { changes: Number(result.changes) },
    };
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.bindings) || null;
  }

  async all() {
    const results = this.database.prepare(this.sql).all(...this.bindings);
    this.observeRows(this.sql, results);
    return {
      results,
      success: true,
      meta: {},
    };
  }

  async run() {
    return this.execute();
  }
}

class SQLiteD1Database {
  constructor(database) {
    this.database = database;
    this.throwAfterNextBatchCommit = false;
    this.throwBeforeNextSqlContaining = null;
    this.lastPracticeItemRowCount = null;
  }

  prepare(sql) {
    return new SQLiteD1Statement(
      this.database,
      sql,
      [],
      (executedSql, rows) => {
        if (executedSql.includes("items.id AS item_id")) {
          this.lastPracticeItemRowCount = rows.length;
        }
      },
      (executedSql) => {
        if (
          this.throwBeforeNextSqlContaining
          && executedSql.includes(this.throwBeforeNextSqlContaining)
        ) {
          this.throwBeforeNextSqlContaining = null;
          throw new Error("Simulated D1 statement failure before commit.");
        }
      },
    );
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    let results;
    try {
      results = statements.map((statement) => statement.execute());
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    if (this.throwAfterNextBatchCommit) {
      this.throwAfterNextBatchCommit = false;
      throw new Error("Simulated ambiguous response after D1 commit.");
    }
    return results;
  }
}

function createFixture() {
  assert.equal(
    typeof repositoryModule.createAiChatRepository,
    "function",
    "lib/ai-chat/repository.ts must export createAiChatRepository",
  );
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = readdirSync(join(root, "drizzle"))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    sqlite.exec(readFileSync(join(root, "drizzle", migration), "utf8"));
  }
  sqlite.exec(`
    INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES
      ('user-a', 'a@example.com', 'A', '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'),
      ('user-b', 'b@example.com', 'B', '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z');
    INSERT INTO phrases (
      id, text, pattern, translation, context, source_type, owner_id, status, created_at, updated_at
    ) VALUES
      ('phrase-shared', 'run', '', 'бежать', 'run every morning', 'preset', NULL, 'pick',
        '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'),
      ('phrase-a', 'figure out', '', 'разобраться', 'figure out a problem', 'custom', 'user-a', 'pick',
        '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'),
      ('phrase-b', 'get away', '', 'сбежать', 'get away safely', 'custom', 'user-b', 'pick',
        '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z');
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at) VALUES
      ('user-a', 'phrase-shared', 'learned', '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'),
      ('user-b', 'phrase-shared', 'to_learn', '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z');
  `);

  let id = 0;
  let milliseconds = Date.parse("2026-08-29T11:00:00.000Z");
  const database = new SQLiteD1Database(sqlite);
  const options = {
    createId: (kind) => `${kind}-${++id}`,
    now: () => new Date(milliseconds++).toISOString(),
  };
  const repository = repositoryModule.createAiChatRepository(database, options);
  const vocabulary = vocabularyModule.createVocabularyRepository(database, options);
  return { database, repository, sqlite, vocabulary };
}

function hasCode(code) {
  return (error) => error && typeof error === "object" && error.code === code;
}

test("chat aggregate limits are explicit and server enforced", async () => {
  assert.equal(repositoryModule.AI_CHAT_ACCOUNT_LIMIT, 100);
  assert.equal(repositoryModule.AI_CHAT_LIST_LIMIT, 100);
  assert.equal(repositoryModule.AI_CHAT_MESSAGE_LIST_LIMIT, 200);

  const { repository, sqlite } = createFixture();
  const insertChat = sqlite.prepare(`
    INSERT INTO ai_chats (
      id, user_id, title, explanation_language, created_at, updated_at
    ) VALUES (?, 'user-a', ?, 'ru', ?, ?)
  `);
  for (let index = 0; index < repositoryModule.AI_CHAT_ACCOUNT_LIMIT - 1; index += 1) {
    const timestamp = new Date(Date.parse("2026-08-29T09:00:00.000Z") + index).toISOString();
    insertChat.run(`seed-chat-${index}`, `Seed ${index}`, timestamp, timestamp);
  }

  const lastAllowed = await repository.createChat("user-a", {
    openingMessage: "Последние слова готовы к практике.",
  });
  assert.equal(lastAllowed.messageCount, 1);
  await assert.rejects(
    repository.createChat("user-a", {
      targets: [{ source: "ad_hoc", text: "overflow", meaningMode: "explore" }],
      openingMessage: "This must not be persisted.",
    }),
    hasCode("conflict"),
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chats WHERE user_id = 'user-a'").get().count,
    repositoryModule.AI_CHAT_ACCOUNT_LIMIT,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chat_practice_items").get().count,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages").get().count,
    1,
  );

  insertChat.run(
    "raw-overflow-chat",
    "Newest raw row",
    "2026-08-29T12:00:00.000Z",
    "2026-08-29T12:00:00.000Z",
  );
  const listed = await repository.listChats("user-a");
  assert.equal(listed.length, repositoryModule.AI_CHAT_LIST_LIMIT);
  assert.equal(listed[0].id, "raw-overflow-chat");
  assert.equal(listed.some((chat) => chat.id === "seed-chat-0"), false);
});

test("chat restoration returns only the latest bounded messages in chronological order", async () => {
  assert.equal(repositoryModule.AI_CHAT_MESSAGE_LIST_LIMIT, 200);
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const insertMessage = sqlite.prepare(`
    INSERT INTO ai_chat_messages (
      id, chat_id, role, sequence, content, status, practice_context_json,
      client_message_id, provider, model, usage_json, error_code, created_at, updated_at
    ) VALUES (?, ?, 'assistant', ?, ?, 'complete', '[]', ?,
      'openrouter', 'internal/model', '{"inputTokens":1}', NULL, ?, ?)
  `);
  for (let sequence = 1; sequence <= repositoryModule.AI_CHAT_MESSAGE_LIST_LIMIT + 2; sequence += 1) {
    const timestamp = new Date(Date.parse("2026-08-29T12:00:00.000Z") + sequence).toISOString();
    insertMessage.run(
      `bounded-message-${sequence}`,
      chat.id,
      sequence,
      `Message ${sequence}`,
      `bounded-client-${sequence}`,
      timestamp,
      timestamp,
    );
  }

  const restored = await repository.getChat("user-a", chat.id);
  assert.equal(restored.messageCount, repositoryModule.AI_CHAT_MESSAGE_LIST_LIMIT + 2);
  assert.equal(restored.messages.length, repositoryModule.AI_CHAT_MESSAGE_LIST_LIMIT);
  assert.deepEqual(
    restored.messages.map((message) => message.sequence),
    Array.from(
      { length: repositoryModule.AI_CHAT_MESSAGE_LIST_LIMIT },
      (_, index) => index + 3,
    ),
  );
});

test("concurrent chat creation cannot race past the per-account cap", async () => {
  const { repository, sqlite } = createFixture();
  const insertChat = sqlite.prepare(`
    INSERT INTO ai_chats (
      id, user_id, title, explanation_language, created_at, updated_at
    ) VALUES (?, 'user-a', ?, 'ru', ?, ?)
  `);
  for (let index = 0; index < repositoryModule.AI_CHAT_ACCOUNT_LIMIT - 1; index += 1) {
    const timestamp = new Date(Date.parse("2026-08-29T09:00:00.000Z") + index).toISOString();
    insertChat.run(`race-seed-${index}`, `Race seed ${index}`, timestamp, timestamp);
  }

  const attempts = await Promise.allSettled([
    repository.createChat("user-a", { openingMessage: "First contender." }),
    repository.createChat("user-a", { openingMessage: "Second contender." }),
  ]);
  assert.deepEqual(
    attempts.map((attempt) => attempt.status).sort(),
    ["fulfilled", "rejected"],
  );
  assert.equal(
    attempts.find((attempt) => attempt.status === "rejected").reason.code,
    "conflict",
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chats WHERE user_id = 'user-a'").get().count,
    repositoryModule.AI_CHAT_ACCOUNT_LIMIT,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages").get().count,
    1,
  );

  const otherOwner = await repository.createChat("user-b");
  assert.equal(otherOwner.id.length > 0, true);
});

test("meaning fallback and personal meanings stay owner-scoped and status-neutral", async () => {
  const { vocabulary, sqlite } = createFixture();

  assert.deepEqual(await vocabulary.listMeanings("user-a", "phrase-shared"), {
    phraseId: "phrase-shared",
    text: "run",
    meanings: [{
      id: "legacy",
      source: "legacy",
      translation: "бежать",
      context: "run every morning",
    }],
    meaningCount: 1,
    meaningsTruncated: false,
  });

  const created = await vocabulary.addMeaning("user-a", {
    phraseId: "phrase-shared",
    translation: "управлять",
    context: "run a company",
  });
  const deduped = await vocabulary.addMeaning("user-a", {
    phraseId: "phrase-shared",
    translation: "  УПРАВЛЯТЬ  ",
    context: "run an organization",
  });
  const preserved = await vocabulary.addMeaning("user-a", {
    phraseId: "phrase-shared",
    translation: "управлять",
  });
  assert.equal(deduped.id, created.id);
  assert.equal(preserved.context, "run an organization");
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM phrase_meanings").get().count, 1);
  assert.equal(
    sqlite.prepare("SELECT status FROM phrase_progress WHERE user_id = 'user-a' AND phrase_id = 'phrase-shared'").get().status,
    "learned",
  );

  const contextOnly = await vocabulary.addEntry("user-a", {
    text: "edge case",
    context: "an existing context",
  });
  const filledLater = await vocabulary.addEntry("user-a", {
    text: "edge case",
    translation: "пограничный случай",
  });
  assert.equal(filledLater.entry.phraseId, contextOnly.entry.phraseId);
  assert.equal(filledLater.entry.meanings[0].context, "an existing context");

  const owned = await vocabulary.listMeanings("user-a", "phrase-shared");
  assert.deepEqual(owned.meanings.map(({ source, translation, context }) => ({ source, translation, context })), [
    { source: "legacy", translation: "бежать", context: "run every morning" },
    { source: "personal", translation: "управлять", context: "run an organization" },
  ]);
  assert.equal((await vocabulary.listMeanings("user-b", "phrase-shared")).meanings.length, 1);
  await assert.rejects(
    vocabulary.addMeaning("user-a", {
      phraseId: "phrase-b",
      translation: "уйти",
      context: "",
    }),
    hasCode("not_found"),
  );
  assert.equal(await vocabulary.listMeanings("user-a", "phrase-b"), null);
});

test("meaning lists are owner-scoped, bounded, and disclose truncation", async () => {
  const { vocabulary } = createFixture();
  for (let index = 0; index < vocabularyModule.VOCABULARY_LIMITS.meaningList + 2; index += 1) {
    await vocabulary.addMeaning("user-a", {
      phraseId: "phrase-shared",
      translation: `значение ${index}`,
    });
  }

  const result = await vocabulary.listMeanings("user-a", "phrase-shared");
  assert.equal(result.meanings.length, vocabularyModule.VOCABULARY_LIMITS.meaningList + 1);
  assert.equal(result.meaningCount, vocabularyModule.VOCABULARY_LIMITS.meaningList + 3);
  assert.equal(result.meaningsTruncated, true);
  assert.equal(result.meanings[0].source, "legacy");
});

test("recent and searched vocabulary stay owner-scoped and include saved meanings", async () => {
  const { vocabulary, sqlite } = createFixture();
  sqlite.exec(`
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at)
    VALUES ('user-a', 'phrase-a', 'to_learn',
      '2026-08-29T10:30:00.000Z', '2026-08-29T10:30:00.000Z');
  `);
  await vocabulary.addMeaning("user-a", {
    phraseId: "phrase-shared",
    translation: "управлять",
    context: "run a company",
  });

  const recent = await vocabulary.listRecent("user-a", 2);
  assert.deepEqual(recent.map(({ text, status }) => ({ text, status })), [
    { text: "figure out", status: "to_learn" },
    { text: "run", status: "learned" },
  ]);
  assert.deepEqual(recent[1].meanings.map(({ translation }) => translation), [
    "бежать",
    "управлять",
  ]);

  const searched = await vocabulary.search("user-a", "RUN", 5);
  assert.deepEqual(searched.map(({ phraseId, text }) => ({ phraseId, text })), [
    { phraseId: "phrase-shared", text: "run" },
  ]);
  assert.deepEqual(
    (await vocabulary.search("user-a", "управлять", 5)).map(({ phraseId, text }) => ({
      phraseId,
      text,
    })),
    [{ phraseId: "phrase-shared", text: "run" }],
  );
  assert.deepEqual(
    (await vocabulary.search("user-a", "УПРАВЛЯТЬ", 5)).map(({ phraseId, text }) => ({
      phraseId,
      text,
    })),
    [{ phraseId: "phrase-shared", text: "run" }],
  );
  assert.deepEqual(
    (await vocabulary.search("user-a", "разобраться", 5)).map(({ phraseId, text }) => ({
      phraseId,
      text,
    })),
    [{ phraseId: "phrase-a", text: "figure out" }],
  );
  assert.equal((await vocabulary.search("user-b", "управлять", 5)).length, 0);
  assert.equal((await vocabulary.search("user-a", "get away", 5)).length, 0);
});

test("vocabulary pages traverse every owned entry without duplicates and filter canonical categories", async () => {
  const { vocabulary, sqlite } = createFixture();
  const insertPhrase = sqlite.prepare(`
    INSERT INTO phrases (
      id, text, pattern, translation, context, source_type, owner_id, status,
      created_at, updated_at
    ) VALUES (?, ?, '', '', '', 'custom', ?, 'pick', ?, ?)
  `);
  const insertProgress = sqlite.prepare(`
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of [
    ["phrase-sqlite-newest", "sqlite newest", "user-a", "to_learn", "2026-08-29 23:00:00"],
    ["phrase-learning-b", "learning b", "user-a", "learning_now", "2026-08-29T12:00:00.000Z"],
    ["phrase-learning-a", "learning a", "user-a", "learning_now", "2026-08-29T12:00:00.000Z"],
    ["phrase-legacy-learnt", "legacy learnt", "user-a", "learnt", "2026-08-29T11:50:00.000Z"],
    ["phrase-new-learned", "new learned", "user-a", "learned", "2026-08-29T11:40:00.000Z"],
    ["phrase-to-learn", "to learn", "user-a", "to_learn", "2026-08-29T11:30:00.000Z"],
    ["phrase-sqlite-b", "sqlite b", "user-a", "to_learn", "2026-08-29 11:20:00"],
    ["phrase-sqlite-a", "sqlite a", "user-a", "to_learn", "2026-08-29 11:20:00"],
    ["phrase-sqlite-old", "sqlite old", "user-a", "to_learn", "2026-08-28 11:20:00"],
    ["phrase-foreign", "foreign", "user-b", "learning_now", "2026-08-29T12:30:00.000Z"],
  ]) {
    const [id, text, userId, status, timestamp] = row;
    insertPhrase.run(id, text, userId, timestamp, timestamp);
    insertProgress.run(userId, id, status, timestamp, timestamp);
  }

  const collected = [];
  let cursor = null;
  do {
    const page = await vocabulary.listPage("user-a", {
      category: "all",
      limit: 2,
      cursor,
    });
    collected.push(...page.entries.map(({ phraseId }) => phraseId));
    cursor = page.nextCursor;
    assert.equal(page.hasMore, cursor !== null);
  } while (cursor);

  assert.deepEqual(collected, [
    "phrase-sqlite-newest",
    "phrase-learning-b",
    "phrase-learning-a",
    "phrase-legacy-learnt",
    "phrase-new-learned",
    "phrase-to-learn",
    "phrase-sqlite-b",
    "phrase-sqlite-a",
    "phrase-shared",
    "phrase-sqlite-old",
  ]);
  assert.equal(new Set(collected).size, collected.length);
  assert.equal(collected.includes("phrase-foreign"), false);

  const categories = async (category) => {
    const page = await vocabulary.listPage("user-a", { category, limit: 20 });
    assert.equal(page.hasMore, false);
    assert.equal(page.nextCursor, null);
    return page.entries.map(({ phraseId, status }) => ({ phraseId, status }));
  };
  assert.deepEqual(await categories("learning"), [
    { phraseId: "phrase-learning-b", status: "learning_now" },
    { phraseId: "phrase-learning-a", status: "learning_now" },
  ]);
  assert.deepEqual(await categories("learned"), [
    { phraseId: "phrase-legacy-learnt", status: "learnt" },
    { phraseId: "phrase-new-learned", status: "learned" },
    { phraseId: "phrase-shared", status: "learned" },
  ]);
  assert.deepEqual(await categories("to_learn"), [
    { phraseId: "phrase-sqlite-newest", status: "to_learn" },
    { phraseId: "phrase-to-learn", status: "to_learn" },
    { phraseId: "phrase-sqlite-b", status: "to_learn" },
    { phraseId: "phrase-sqlite-a", status: "to_learn" },
    { phraseId: "phrase-sqlite-old", status: "to_learn" },
  ]);
});

test("category mutation target is owner-scoped and does not load meanings", async () => {
  const { sqlite, vocabulary } = createFixture();
  sqlite.exec(`
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at) VALUES
      ('user-a', 'phrase-a', 'learning_now',
       '2026-08-29T11:00:00.000Z', '2026-08-29T11:00:00.000Z'),
      ('user-a', 'phrase-b', 'to_learn',
       '2026-08-29T11:00:00.000Z', '2026-08-29T11:00:00.000Z');
  `);

  assert.deepEqual(await vocabulary.getCategoryTarget("user-a", "phrase-a"), {
    phraseId: "phrase-a",
    text: "figure out",
    storedStatus: "learning_now",
    category: "learning",
  });
  assert.deepEqual(await vocabulary.getCategoryTarget("user-a", "phrase-shared"), {
    phraseId: "phrase-shared",
    text: "run",
    storedStatus: "learned",
    category: "learned",
  });
  assert.equal(await vocabulary.getCategoryTarget("user-a", "phrase-b"), null);
  assert.equal(await vocabulary.getCategoryTarget("user-b", "phrase-a"), null);
  sqlite.close();
});

test("state-change targets resolve an exact batch owner-scoped with owned custom precedence", async () => {
  const { sqlite, vocabulary } = createFixture();
  sqlite.exec(`
    INSERT INTO phrases (
      id, text, pattern, source_type, owner_id, status, created_at, updated_at
    ) VALUES ('phrase-owned-run', 'run', '', 'custom', 'user-a', 'pick', 'now', 'now');
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at) VALUES
      ('user-a', 'phrase-a', 'learning_now', 'now', 'now'),
      ('user-a', 'phrase-owned-run', 'to_learn', 'now', 'now'),
      ('user-b', 'phrase-b', 'to_learn', 'now', 'now');
  `);

  assert.deepEqual(await vocabulary.getStateTargets("user-a", [
    "run",
    "figure out",
    "get away",
    "missing",
  ]), [
    {
      phraseId: "phrase-owned-run",
      text: "run",
      sourceType: "custom",
      storedStatus: "to_learn",
      category: "to_learn",
    },
    {
      phraseId: "phrase-a",
      text: "figure out",
      sourceType: "custom",
      storedStatus: "learning_now",
      category: "learning",
    },
  ]);
  sqlite.close();
});

test("vocabulary search rejects LIKE patterns above 50 UTF-8 bytes after escaping", async () => {
  assert.equal(typeof vocabularyModule.createVocabularySearchPattern, "function");
  assert.deepEqual(vocabularyModule.createVocabularySearchPattern(`  ${"%".repeat(24)}  `), {
    query: "%".repeat(24),
    normalizedQuery: "%".repeat(24),
    pattern: `%${"\\%".repeat(24)}%`,
  });
  assert.equal(
    new TextEncoder().encode(vocabularyModule.createVocabularySearchPattern("\ud83d\ude80".repeat(12)).pattern).byteLength,
    50,
  );
  assert.equal(vocabularyModule.createVocabularySearchPattern("%".repeat(25)), null);
  assert.equal(vocabularyModule.createVocabularySearchPattern("％".repeat(25)), null);
  assert.equal(vocabularyModule.createVocabularySearchPattern("\ud83d\ude80".repeat(13)), null);

  const { vocabulary } = createFixture();
  assert.deepEqual(await vocabulary.search("user-a", "%".repeat(25), 5), []);
  assert.deepEqual(await vocabulary.search("user-a", "\ud83d\ude80".repeat(13), 5), []);
});

test("provider-facing vocabulary reads bound meanings at the D1 query", async () => {
  const { vocabulary } = createFixture();
  for (let index = 0; index < 12; index += 1) {
    await vocabulary.addMeaning("user-a", {
      phraseId: "phrase-shared",
      translation: `значение ${index}`,
      context: `context ${index}`,
    });
  }

  const [entry] = await vocabulary.listRecent("user-a", 1);
  assert.equal(entry.meaningCount, 13);
  assert.equal(entry.meanings.length, 8);
  assert.equal(entry.meanings[0].source, "legacy");
  assert.equal(entry.meanings.filter(({ source }) => source === "personal").length, 7);
});

test("agent vocabulary writes are idempotent, owner-scoped, and status-safe", async () => {
  const { vocabulary, sqlite } = createFixture();

  const first = await vocabulary.addEntry("user-a", {
    text: "serendipity",
    translation: "счастливая случайность",
    context: "a lucky discovery",
  });
  const duplicate = await vocabulary.addEntry("user-a", {
    text: "  SERENDIPITY  ",
    translation: "счастливая случайность",
    context: "a lucky discovery",
  });
  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.entry.phraseId, first.entry.phraseId);
  assert.equal(duplicate.entry.status, "to_learn");
  assert.deepEqual(duplicate.entry.meanings.map(({ translation }) => translation), [
    "счастливая случайность",
  ]);
  assert.equal(duplicate.entry.meanings[0].source, "personal");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT translation, context FROM phrases WHERE id = ?
  `).get(first.entry.phraseId) }, { translation: "", context: "" });
  const firstMeaning = duplicate.entry.meanings[0];
  const revisedFirstMeaning = await vocabulary.updateMeaning("user-a", {
    meaningId: firstMeaning.id,
    phraseId: first.entry.phraseId,
    expectedTranslation: firstMeaning.translation,
    expectedContext: firstMeaning.context,
    translation: "удачная случайность",
  });
  assert.deepEqual({
    translation: revisedFirstMeaning.translation,
    context: revisedFirstMeaning.context,
  }, {
    translation: "удачная случайность",
    context: "a lucky discovery",
  });
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM phrases WHERE text = 'serendipity' COLLATE NOCASE").get().count,
    1,
  );

  const existing = await vocabulary.addEntry("user-a", {
    text: "run",
    translation: "управлять",
    context: "run a company",
  });
  assert.equal(existing.created, false);
  assert.equal(existing.entry.status, "learned");
  assert.deepEqual(existing.entry.meanings.map(({ translation }) => translation), [
    "бежать",
    "управлять",
  ]);
  assert.equal(
    sqlite.prepare("SELECT status FROM phrase_progress WHERE user_id = 'user-a' AND phrase_id = 'phrase-shared'").get().status,
    "learned",
  );

  const personal = existing.entry.meanings.find(({ source }) => source === "personal");
  assert.equal(
    (await vocabulary.getEntryForMeaning("user-a", personal.id)).phraseId,
    "phrase-shared",
  );
  assert.equal(await vocabulary.getEntryForMeaning("user-b", personal.id), null);
  assert.equal(await vocabulary.getEntryForMeaning("user-a", "legacy"), null);

  sqlite.exec(`
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at)
    VALUES (
      'user-a', 'phrase-a', 'learning_now',
      '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'
    )
  `);
  const historicalLegacy = await vocabulary.getEntryForMeaning("user-a", "legacy:phrase-a");
  assert.deepEqual(historicalLegacy?.selectedMeaning, {
    id: "legacy:phrase-a",
    source: "legacy",
    translation: "разобраться",
    context: "figure out a problem",
  });
  assert.equal(await vocabulary.getEntryForMeaning("user-b", "legacy:phrase-a"), null);
  assert.equal(await vocabulary.getEntryForMeaning("user-a", "legacy:phrase-shared"), null);
  const updated = await vocabulary.updateMeaning("user-a", {
    meaningId: personal.id,
    phraseId: "phrase-shared",
    expectedTranslation: "управлять",
    expectedContext: "run a company",
    translation: "руководить",
    context: "run an organisation",
  });
  assert.deepEqual(
    { id: updated.id, translation: updated.translation, context: updated.context },
    { id: personal.id, translation: "руководить", context: "run an organisation" },
  );
  const preservedUpdate = await vocabulary.updateMeaning("user-a", {
    meaningId: personal.id,
    phraseId: "phrase-shared",
    expectedTranslation: "руководить",
    expectedContext: "run an organisation",
    translation: "руководить организацией",
  });
  assert.equal(preservedUpdate.context, "run an organisation");
  await assert.rejects(
    vocabulary.updateMeaning("user-b", {
      meaningId: personal.id,
      phraseId: "phrase-shared",
      expectedTranslation: "руководить организацией",
      expectedContext: "run an organisation",
      translation: "работать",
      context: "a machine runs",
    }),
    hasCode("not_found"),
  );

  await assert.rejects(
    vocabulary.updateMeaning("user-a", {
      meaningId: personal.id,
      phraseId: "phrase-shared",
      expectedTranslation: "руководить",
      expectedContext: "run an organisation",
      translation: "вести",
    }),
    hasCode("conflict"),
  );
});

test("concurrent agent retries converge on one custom vocabulary entry", async () => {
  const { vocabulary, sqlite } = createFixture();

  const [first, second] = await Promise.all([
    vocabulary.addEntry("user-a", {
      text: "concurrency",
      translation: "конкурентность",
    }),
    vocabulary.addEntry("user-a", {
      text: "CONCURRENCY",
      translation: "конкурентность",
    }),
  ]);

  assert.equal(first.entry.phraseId, second.entry.phraseId);
  assert.equal(
    sqlite.prepare(`
      SELECT count(*) AS count
      FROM phrases
      WHERE owner_id = 'user-a' AND text = 'concurrency' COLLATE NOCASE
    `).get().count,
    1,
  );
});

test("create, list, and get expose only owned chats with empty or multiple targets", async () => {
  const { repository } = createFixture();
  const empty = await repository.createChat("user-a");
  const initialized = await repository.createChat("user-a", {
    targets: [
      { source: "saved", phraseId: "phrase-shared", meaningMode: "all_saved" },
      { source: "ad_hoc", text: "make it up", meaningMode: "explore" },
    ],
  });
  const foreign = await repository.createChat("user-b", {
    targets: [{ source: "saved", phraseId: "phrase-b", meaningMode: "all_saved" }],
  });

  assert.equal(empty.targets.length, 0);
  assert.deepEqual(initialized.targets.map(({ text, meaningMode }) => ({ text, meaningMode })), [
    { text: "run", meaningMode: "all_saved" },
    { text: "make it up", meaningMode: "explore" },
  ]);
  assert.match(initialized.title, /run/i);
  assert.deepEqual((await repository.listChats("user-a")).map((chat) => chat.id), [initialized.id, empty.id]);
  assert.deepEqual(await repository.getChatSummary("user-a", initialized.id), {
    id: initialized.id,
    title: initialized.title,
    explanationLanguage: "ru",
    targetCount: 2,
    messageCount: 0,
    preview: "",
    createdAt: initialized.createdAt,
    updatedAt: initialized.updatedAt,
  });
  assert.equal(await repository.getChatSummary("user-b", initialized.id), null);
  assert.equal(await repository.getChat("user-a", foreign.id), null);
  assert.equal(await repository.getChat("user-b", initialized.id), null);
  assert.equal((await repository.getChat("user-a", initialized.id)).messages.length, 0);
});

test("chat creation can persist a deterministic assistant opening without a model turn", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a", {
    openingMessage: "Последние 1 добавленных слов и фраз:\n\n1. run — бежать",
  });

  assert.equal(chat.messageCount, 1);
  assert.deepEqual(chat.messages.map((message) => ({
    role: message.role,
    sequence: message.sequence,
    content: message.content,
    status: message.status,
    practiceContext: message.practiceContext,
    provider: message.provider,
    model: message.model,
  })), [{
    role: "assistant",
    sequence: 1,
    content: "Последние 1 добавленных слов и фраз:\n\n1. run — бежать",
    status: "complete",
    practiceContext: [],
    provider: null,
    model: null,
  }]);
});

test("chat creation recovers its exact committed payload after an ambiguous D1 response", async () => {
  const { database, repository, sqlite } = createFixture();
  database.throwAfterNextBatchCommit = true;

  const chat = await repository.createChat("user-a", {
    targets: [
      { source: "saved", phraseId: "phrase-shared", meaningMode: "all_saved" },
      { source: "ad_hoc", text: "break even", meaningMode: "explore" },
    ],
    explanationLanguage: "uk",
    openingMessage: "A deterministic opening.",
  });

  assert.equal(chat.id, "chat-1");
  assert.equal(chat.explanationLanguage, "uk");
  assert.deepEqual(chat.targets.map(({ id, phraseId, text, meaningMode }) => ({
    id,
    phraseId,
    text,
    meaningMode,
  })), [
    { id: "target-2", phraseId: "phrase-shared", text: "run", meaningMode: "all_saved" },
    { id: "target-3", phraseId: null, text: "break even", meaningMode: "explore" },
  ]);
  assert.deepEqual(chat.messages.map(({ id, clientMessageId, content, status }) => ({
    id,
    clientMessageId,
    content,
    status,
  })), [{
    id: "message-4",
    clientMessageId: "opening:chat-1",
    content: "A deterministic opening.",
    status: "complete",
  }]);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM ai_chats").get().count, 1);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM ai_chat_practice_items").get().count, 2);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages").get().count, 1);
});

test("chat creation never treats an unrelated generated-ID collision as its own commit", async () => {
  const { repository, sqlite } = createFixture();
  sqlite.prepare(`
    INSERT INTO ai_chats (
      id, user_id, title, explanation_language, created_at, updated_at
    ) VALUES ('chat-1', 'user-a', 'Pre-existing collision', 'en', ?, ?)
  `).run("2026-08-29T09:00:00.000Z", "2026-08-29T09:00:00.000Z");

  await assert.rejects(
    repository.createChat("user-a", { openingMessage: "Must not be replayed." }),
    /UNIQUE constraint failed/,
  );
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT title, explanation_language, created_at, updated_at
    FROM ai_chats WHERE id = 'chat-1'
  `).get() }, {
    title: "Pre-existing collision",
    explanation_language: "en",
    created_at: "2026-08-29T09:00:00.000Z",
    updated_at: "2026-08-29T09:00:00.000Z",
  });
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages").get().count, 0);
});

test("replacing current targets validates visibility, ownership, limits, and snapshots before mutation", async () => {
  const { repository, sqlite, vocabulary } = createFixture();
  const selected = await vocabulary.addMeaning("user-a", {
    phraseId: "phrase-shared",
    translation: "управлять",
    context: "run a company",
  });
  const foreignMeaning = await vocabulary.addMeaning("user-b", {
    phraseId: "phrase-shared",
    translation: "работать",
    context: "a machine runs",
  });
  const chat = await repository.createChat("user-a", {
    targets: [{ source: "saved", phraseId: "phrase-shared", meaningMode: "all_saved" }],
  });
  assert.deepEqual(chat.targets[0].knownMeanings.map((meaning) => meaning.translation), [
    "бежать",
    "управлять",
  ]);

  const current = await repository.replacePracticeItems("user-a", chat.id, [
    {
      source: "saved",
      phraseId: "phrase-shared",
      meaningMode: "selected",
      selectedMeaningId: selected.id,
    },
    { source: "ad_hoc", text: "break even", meaningMode: "explore" },
  ]);
  assert.deepEqual(current.map((target) => ({
    text: target.text,
    meaningMode: target.meaningMode,
    selected: target.selectedMeaning?.translation || null,
  })), [
    { text: "run", meaningMode: "selected", selected: "управлять" },
    { text: "break even", meaningMode: "explore", selected: null },
  ]);

  sqlite.prepare("UPDATE phrase_meanings SET translation = 'руководить' WHERE id = ?").run(selected.id);
  let restored = await repository.getCurrentPracticeItems("user-a", chat.id);
  assert.equal(restored[0].selectedMeaning.translation, "управлять");
  sqlite.prepare("DELETE FROM phrase_meanings WHERE id = ?").run(selected.id);
  restored = await repository.getCurrentPracticeItems("user-a", chat.id);
  assert.equal(restored[0].selectedMeaningId, null);
  assert.equal(restored[0].selectedMeaning.translation, "управлять");
  assert.equal(restored[0].selectedMeaning.source, "personal");

  for (const invalidTargets of [
    [{ source: "saved", phraseId: "phrase-b", meaningMode: "all_saved" }],
    [{
      source: "saved",
      phraseId: "phrase-shared",
      meaningMode: "selected",
      selectedMeaningId: foreignMeaning.id,
    }],
  ]) {
    await assert.rejects(
      repository.replacePracticeItems("user-a", chat.id, invalidTargets),
      hasCode("invalid_target"),
    );
    assert.deepEqual(
      (await repository.getCurrentPracticeItems("user-a", chat.id)).map((target) => target.text),
      ["run", "break even"],
    );
  }

  await assert.rejects(
    repository.replacePracticeItems(
      "user-a",
      chat.id,
      Array.from({ length: 13 }, (_, index) => ({
        source: "ad_hoc",
        text: `target ${index}`,
        meaningMode: "all_saved",
      })),
    ),
    hasCode("target_limit"),
  );
  await assert.rejects(
    repository.replacePracticeItems("user-b", chat.id, []),
    hasCode("not_found"),
  );
});

test("practice-item persistence reads bound all-saved meanings and fetch only the selected meaning", async () => {
  const { database, repository, sqlite } = createFixture();
  const insertMeaning = sqlite.prepare(`
    INSERT INTO phrase_meanings (
      id, user_id, phrase_id, translation, normalized_translation, context,
      created_at, updated_at
    ) VALUES (?, 'user-a', 'phrase-shared', ?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < 20; index += 1) {
    const timestamp = `2026-08-29T10:01:${String(index).padStart(2, "0")}.000Z`;
    insertMeaning.run(
      `bounded-meaning-${index}`,
      `meaning ${index}`,
      `meaning ${index}`,
      `context ${index}`,
      timestamp,
      timestamp,
    );
  }

  const allSaved = await repository.createChat("user-a", {
    targets: [{ source: "saved", phraseId: "phrase-shared", meaningMode: "all_saved" }],
  });
  assert.equal(allSaved.targets[0].knownMeanings.length, 12);
  assert.deepEqual(
    allSaved.targets[0].knownMeanings.map(({ id }) => id),
    ["legacy", ...Array.from({ length: 11 }, (_, index) => `bounded-meaning-${index}`)],
  );
  assert.equal(database.lastPracticeItemRowCount, 11);

  const selected = await repository.createChat("user-a", {
    targets: [{
      source: "saved",
      phraseId: "phrase-shared",
      meaningMode: "selected",
      selectedMeaningId: "bounded-meaning-17",
    }],
  });
  assert.equal(selected.targets[0].selectedMeaning.id, "bounded-meaning-17");
  assert.equal(selected.targets[0].selectedMeaning.context, "context 17");
  assert.equal(database.lastPracticeItemRowCount, 1);
});

test("selected meaning accepts the explicit legacy sentinel without creating a personal row", async () => {
  const { repository, sqlite } = createFixture();
  assert.equal(repositoryModule.AI_CHAT_LEGACY_MEANING_ID, "legacy");

  const chat = await repository.createChat("user-a", {
    targets: [{
      source: "saved",
      phraseId: "phrase-shared",
      meaningMode: "selected",
      selectedMeaningId: "legacy",
    }],
  });
  assert.equal(chat.targets[0].selectedMeaningId, null);
  assert.equal(chat.targets[0].selectedMeaningSnapshot, "бежать");
  assert.deepEqual(chat.targets[0].selectedMeaning, {
    id: "legacy",
    source: "legacy",
    translation: "бежать",
    context: "run every morning",
  });
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM phrase_meanings").get().count, 0);

  sqlite.exec(`
    INSERT INTO phrases (
      id, text, pattern, translation, context, source_type, owner_id, status, created_at, updated_at
    ) VALUES (
      'phrase-empty', 'set aside', '', '', '', 'custom', 'user-a', 'pick',
      '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'
    );
  `);
  await assert.rejects(
    repository.replacePracticeItems("user-a", chat.id, [{
      source: "saved",
      phraseId: "phrase-empty",
      meaningMode: "selected",
      selectedMeaningId: "legacy",
    }]),
    hasCode("invalid_target"),
  );
  assert.equal((await repository.getCurrentPracticeItems("user-a", chat.id))[0].selectedMeaningSnapshot, "бежать");
});

test("canonical history is ordered, bounded, and excludes unfinished assistant rows", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");

  const firstTurn = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "turn-1",
    content: "Give me an example.",
    practiceContext: [{ text: "run", meaningMode: "all_saved" }],
  });
  await repository.finishTurn("user-a", chat.id, "turn-1", {
    attemptId: firstTurn.attempt.id,
    content: "I run every morning.",
    provider: "openrouter",
    model: "test/model",
    usage: { inputTokens: 10, outputTokens: 6 },
  });
  const secondTurn = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "turn-2",
    content: "Another one.",
    practiceContext: [],
  });
  await repository.failTurn(
    "user-a",
    chat.id,
    "turn-2",
    "provider_timeout",
    secondTurn.attempt.id,
  );
  await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "turn-3",
    content: "Explain the first sentence.",
    practiceContext: [],
  });

  assert.deepEqual((await repository.getCanonicalHistory("user-a", chat.id)).map(({ role, content }) => ({ role, content })), [
    { role: "user", content: "Give me an example." },
    { role: "assistant", content: "I run every morning." },
  ]);
  assert.deepEqual(
    (await repository.getCanonicalHistory("user-a", chat.id, { excludeClientMessageId: "turn-2" }))
      .map(({ content }) => content),
    ["Give me an example.", "I run every morning."],
  );
  assert.deepEqual(
    (await repository.getCanonicalHistory("user-a", chat.id, { beforeSequence: 5 }))
      .map(({ content }) => content),
    ["Give me an example.", "I run every morning."],
  );
  await assert.rejects(
    repository.getCanonicalHistory("user-b", chat.id),
    hasCode("not_found"),
  );

  const boundedChat = await repository.createChat("user-a");
  const insert = sqlite.prepare(`
    INSERT INTO ai_chat_messages (
      id, chat_id, role, sequence, content, status, practice_context_json,
      client_message_id, created_at, updated_at
    ) VALUES
      (?, ?, 'user', ?, ?, 'complete', '[]', ?,
        '2026-08-29T12:00:00.000Z', '2026-08-29T12:00:00.000Z'),
      (?, ?, 'assistant', ?, ?, 'complete', '[]', ?,
        '2026-08-29T12:00:00.000Z', '2026-08-29T12:00:00.000Z')
  `);
  for (let index = 1; index <= 45; index += 1) {
    insert.run(
      `bounded-user-${index}`, boundedChat.id, (index * 2) - 1, `bulk ${index}`, `bounded-${index}`,
      `bounded-assistant-${index}`, boundedChat.id, index * 2, `answer ${index}`, `bounded-${index}`,
    );
  }
  const bounded = await repository.getCanonicalHistory("user-a", boundedChat.id);
  assert.equal(bounded.length, 40);
  assert.equal(bounded[0].content, "bulk 26");
  assert.equal(bounded.at(-1).content, "answer 45");
});

test("beginTurn atomically creates one ordered pair and reuses a client id", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const input = {
    clientMessageId: "client-1",
    content: "Practice run.",
    practiceContext: [{ text: "run", meanings: ["бежать"] }],
  };

  const created = await repository.beginTurn("user-a", chat.id, input);
  assert.equal(created.state, "created");
  assert.deepEqual([created.user.sequence, created.assistant.sequence], [1, 2]);
  assert.equal(created.assistant.status, "pending");
  assert.equal(created.attempt.status, "pending");
  assert.equal(created.attempt.attemptNumber, 1);
  const duplicate = await repository.beginTurn("user-a", chat.id, input);
  assert.equal(duplicate.state, "existing");
  assert.equal(duplicate.user.id, created.user.id);
  assert.equal(duplicate.assistant.id, created.assistant.id);
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages WHERE chat_id = ?").get(chat.id).count,
    2,
  );
  await assert.rejects(
    repository.beginTurn("user-a", chat.id, { ...input, content: "Different content." }),
    hasCode("conflict"),
  );

  const secondInput = {
    clientMessageId: "client-2",
    content: "One more.",
    practiceContext: [],
  };
  await assert.rejects(
    repository.beginTurn("user-a", chat.id, secondInput),
    hasCode("turn_in_progress"),
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages WHERE chat_id = ?")
      .get(chat.id).count,
    2,
  );
  await repository.finishTurn("user-a", chat.id, input.clientMessageId, {
    attemptId: created.attempt.id,
    content: "Run every morning.",
    provider: "openrouter",
    model: "test/model",
  });
  const second = await repository.beginTurn("user-a", chat.id, secondInput);
  assert.deepEqual([second.user.sequence, second.assistant.sequence], [3, 4]);
  await assert.rejects(
    repository.beginTurn("user-b", chat.id, {
      clientMessageId: "foreign",
      content: "Leak the chat.",
      practiceContext: [],
    }),
    hasCode("not_found"),
  );
});

test("a different turn expires a stale chat lease before acquiring single-flight", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const first = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "stale-first",
    content: "First prompt.",
    practiceContext: [],
  });
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(first.attempt.id);

  const second = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "after-stale",
    content: "Second prompt.",
    practiceContext: [],
  });

  assert.equal(second.state, "created");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT status, error_code, terminal_json
    FROM ai_chat_assistant_attempts WHERE id = ?
  `).get(first.attempt.id) }, {
    status: "expired",
    error_code: "generation_interrupted",
    terminal_json: '{"termination":"lease_expired"}',
  });
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT status, error_code FROM ai_chat_messages WHERE id = ?
  `).get(first.assistant.id) }, {
    status: "failed",
    error_code: "generation_interrupted",
  });
  assert.equal(sqlite.prepare(`
    SELECT count(*) AS count FROM ai_chat_assistant_attempts
    WHERE chat_id = ? AND status = 'pending'
  `).get(chat.id).count, 1);
});

test("stale lease recovery is atomic when D1 fails between cleanup statements", async () => {
  const { database, repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const first = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "atomic-stale-first",
    content: "First prompt.",
    practiceContext: [],
  });
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(first.attempt.id);
  database.throwBeforeNextSqlContaining = "UPDATE ai_chat_messages";

  await assert.rejects(
    repository.beginTurn("user-a", chat.id, {
      clientMessageId: "atomic-after-stale",
      content: "Second prompt.",
      practiceContext: [],
    }),
    /Simulated D1 statement failure before commit/u,
  );

  assert.deepEqual({ ...sqlite.prepare(`
    SELECT attempts.status AS attempt_status, messages.status AS message_status
    FROM ai_chat_assistant_attempts AS attempts
    JOIN ai_chat_messages AS messages ON messages.id = attempts.assistant_message_id
    WHERE attempts.id = ?
  `).get(first.attempt.id) }, {
    attempt_status: "pending",
    message_status: "pending",
  });
  assert.equal(sqlite.prepare(`
    SELECT count(*) AS count
    FROM ai_chat_messages
    WHERE chat_id = ? AND client_message_id = 'atomic-after-stale'
  `).get(chat.id).count, 0);

  const recovered = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "atomic-after-stale",
    content: "Second prompt.",
    practiceContext: [],
  });
  assert.equal(recovered.state, "created");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT attempts.status AS attempt_status, messages.status AS message_status
    FROM ai_chat_assistant_attempts AS attempts
    JOIN ai_chat_messages AS messages ON messages.id = attempts.assistant_message_id
    WHERE attempts.id = ?
  `).get(first.attempt.id) }, {
    attempt_status: "expired",
    message_status: "failed",
  });
});

test("beginTurn repairs an orphaned pending assistant from a previously expired attempt", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const first = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "orphaned-stale-first",
    content: "First prompt.",
    practiceContext: [],
  });
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET status = 'expired', error_code = 'generation_interrupted',
        terminal_json = '{"termination":"lease_expired"}',
        lease_expires_at = '2026-08-29T10:00:00.000Z',
        completed_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(first.attempt.id);

  const recovered = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "after-orphaned-stale",
    content: "Second prompt.",
    practiceContext: [],
  });

  assert.equal(recovered.state, "created");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT status, error_code FROM ai_chat_messages WHERE id = ?
  `).get(first.assistant.id) }, {
    status: "failed",
    error_code: "generation_interrupted",
  });
});

test("beginTurn recovers its freshly committed turn after an ambiguous D1 response", async () => {
  const { database, repository } = createFixture();
  const chat = await repository.createChat("user-a");
  database.throwAfterNextBatchCommit = true;

  const recovered = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "ambiguous-create",
    content: "Practice run.",
    practiceContext: [],
  });

  assert.equal(recovered.state, "created");
  assert.equal(recovered.assistant.status, "pending");
  assert.equal(recovered.attempt.status, "pending");
  assert.equal(recovered.attempt.attemptNumber, 1);
});

test("finishTurn recovers its exact completion after an ambiguous D1 response", async () => {
  const { database, repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "ambiguous-finish",
    content: "Give me a sentence.",
    practiceContext: [],
  });
  database.throwAfterNextBatchCommit = true;

  const recovered = await repository.finishTurn("user-a", chat.id, "ambiguous-finish", {
    attemptId: started.attempt.id,
    content: "I figured out the answer.",
    provider: "openrouter",
    model: "test/model",
    usage: { inputTokens: 12, outputTokens: 7 },
    terminal: {
      elapsedMs: 20_234,
      finishReason: "stop",
      stepCount: 3,
      toolCallCount: 2,
      rawError: "must not persist",
    },
  });

  assert.equal(recovered.assistant.status, "complete");
  assert.equal(recovered.assistant.content, "I figured out the answer.");
  assert.equal(recovered.assistant.provider, "openrouter");
  assert.equal(recovered.assistant.model, "test/model");
  assert.deepEqual(recovered.assistant.usage, { inputTokens: 12, outputTokens: 7 });
  assert.equal(recovered.attempt.id, started.attempt.id);
  assert.equal(recovered.attempt.status, "complete");
  assert.deepEqual(recovered.attempt.terminal, {
    elapsedMs: 20_234,
    finishReason: "stop",
    stepCount: 3,
    toolCallCount: 2,
  });
});

test("cancelling an active owned turn immediately persists a retryable terminal state", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "cancel-active",
    content: "Give me a long answer.",
    practiceContext: [],
  });

  const cancelled = await repository.cancelTurn("user-a", chat.id, "cancel-active");

  assert.equal(cancelled.assistant.status, "failed");
  assert.equal(cancelled.assistant.errorCode, "generation_cancelled");
  assert.equal(cancelled.attempt.id, started.attempt.id);
  assert.equal(cancelled.attempt.status, "failed");
  assert.equal(cancelled.attempt.errorCode, "generation_cancelled");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT attempts.status AS attempt_status, attempts.error_code AS attempt_error,
      messages.status AS message_status, messages.error_code AS message_error
    FROM ai_chat_assistant_attempts AS attempts
    JOIN ai_chat_messages AS messages ON messages.id = attempts.assistant_message_id
    WHERE attempts.id = ?
  `).get(started.attempt.id) }, {
    attempt_status: "failed",
    attempt_error: "generation_cancelled",
    message_status: "failed",
    message_error: "generation_cancelled",
  });
});

test("explicit cancellation terminalizes a still-pending turn even after its lease elapsed", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "cancel-expired-lease",
    content: "Keep working.",
    practiceContext: [],
  });
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(started.attempt.id);

  const cancelled = await repository.cancelTurn(
    "user-a",
    chat.id,
    "cancel-expired-lease",
  );

  assert.equal(cancelled.assistant.status, "failed");
  assert.equal(cancelled.assistant.errorCode, "generation_cancelled");
  assert.equal(cancelled.attempt.status, "failed");
  assert.equal(cancelled.attempt.errorCode, "generation_cancelled");
});

test("turn cancellation is idempotent and preserves an already terminal result", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const cancelledStart = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "cancel-replay",
    content: "Stop this.",
    practiceContext: [],
  });
  const first = await repository.cancelTurn("user-a", chat.id, "cancel-replay");
  const replay = await repository.cancelTurn("user-a", chat.id, "cancel-replay");
  assert.deepEqual(replay, first);

  const completedStart = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "cancel-after-complete",
    content: "Finish this.",
    practiceContext: [],
  });
  const completed = await repository.finishTurn(
    "user-a",
    chat.id,
    "cancel-after-complete",
    {
      attemptId: completedStart.attempt.id,
      content: "Finished.",
      provider: "openrouter",
      model: "test/model",
    },
  );
  assert.deepEqual(
    await repository.cancelTurn("user-a", chat.id, "cancel-after-complete"),
    completed,
  );

  const failedStart = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "cancel-after-failure",
    content: "This will fail.",
    practiceContext: [],
  });
  const failed = await repository.failTurn(
    "user-a",
    chat.id,
    "cancel-after-failure",
    "provider_failed",
    failedStart.attempt.id,
  );
  assert.deepEqual(
    await repository.cancelTurn("user-a", chat.id, "cancel-after-failure"),
    failed,
  );
  assert.equal(cancelledStart.attempt.status, "pending");
});

test("explicit Stop may relabel only a transport interruption as user cancellation", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const interruptedStart = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "stop-after-disconnect",
    content: "Keep working.",
    practiceContext: [],
  });
  await repository.failTurn(
    "user-a",
    chat.id,
    "stop-after-disconnect",
    "generation_interrupted",
    interruptedStart.attempt.id,
    { termination: "transport_disconnected" },
  );

  const cancelled = await repository.cancelTurn(
    "user-a",
    chat.id,
    "stop-after-disconnect",
  );
  assert.equal(cancelled.assistant.errorCode, "generation_cancelled");
  assert.equal(cancelled.attempt.errorCode, "generation_cancelled");

  const providerStart = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "stop-after-provider-failure",
    content: "This will fail.",
    practiceContext: [],
  });
  const providerFailure = await repository.failTurn(
    "user-a",
    chat.id,
    "stop-after-provider-failure",
    "provider_failed",
    providerStart.attempt.id,
  );
  assert.deepEqual(
    await repository.cancelTurn("user-a", chat.id, "stop-after-provider-failure"),
    providerFailure,
  );
});

test("chat detail exposes only normalized terminal telemetry for the latest attempt", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "terminal-detail",
    content: "Write too much.",
    practiceContext: [],
  });
  await repository.failTurn(
    "user-a",
    chat.id,
    "terminal-detail",
    "response_incomplete",
    started.attempt.id,
    { finishReason: "length", elapsedMs: 12_345, rawError: "secret" },
  );

  const detail = await repository.getChat("user-a", chat.id);
  const assistant = detail.messages.find((message) => message.clientMessageId === "terminal-detail" && message.role === "assistant");
  assert.deepEqual(assistant.terminal, { finishReason: "length", elapsedMs: 12_345 });
  assert.equal(JSON.stringify(assistant).includes("secret"), false);
});

test("late generation callbacks cannot overwrite an explicitly cancelled attempt", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "cancel-fences-callbacks",
    content: "Stop before completion.",
    practiceContext: [],
  });
  const cancelled = await repository.cancelTurn(
    "user-a",
    chat.id,
    "cancel-fences-callbacks",
  );

  const lateCompletion = await repository.finishTurn(
    "user-a",
    chat.id,
    "cancel-fences-callbacks",
    {
      attemptId: started.attempt.id,
      content: "Too late.",
      provider: "openrouter",
      model: "test/model",
    },
  );
  const lateFailure = await repository.failTurn(
    "user-a",
    chat.id,
    "cancel-fences-callbacks",
    "provider_failed",
    started.attempt.id,
  );

  assert.deepEqual(lateCompletion, cancelled);
  assert.deepEqual(lateFailure, cancelled);
});

test("turn cancellation is owner scoped and hides missing turns", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "owned-cancel",
    content: "Private turn.",
    practiceContext: [],
  });

  await assert.rejects(
    repository.cancelTurn("user-b", chat.id, "owned-cancel"),
    hasCode("not_found"),
  );
  await assert.rejects(
    repository.cancelTurn("user-a", chat.id, "missing-turn"),
    hasCode("not_found"),
  );
});

test("failed attempts retain configured provenance and recover an ambiguous commit", async () => {
  const { database, repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const configuredProvenance = {
    provider: "openrouter",
    model: "@preset/free-unmubme-test",
  };
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "ambiguous-failure",
    content: "Give me a sentence.",
    practiceContext: [],
    configuredProvenance,
  });
  assert.deepEqual(started.attempt.configuredProvenance, configuredProvenance);
  database.throwAfterNextBatchCommit = true;

  const recovered = await repository.failTurn(
    "user-a",
    chat.id,
    "ambiguous-failure",
    "provider_rate_limited",
    started.attempt.id,
    {
      elapsedMs: 19_409,
      finishReason: "length",
      stepCount: 1,
      toolCallCount: 0,
      providerError: "must not persist",
    },
  );

  assert.equal(recovered.assistant.status, "failed");
  assert.equal(recovered.assistant.errorCode, "provider_rate_limited");
  assert.equal(recovered.attempt.status, "failed");
  assert.equal(recovered.attempt.errorCode, "provider_rate_limited");
  assert.deepEqual(recovered.attempt.configuredProvenance, configuredProvenance);
  const failedAttemptRow = { ...sqlite.prepare(`
    SELECT configured_provider, configured_model, provider, model, error_code, terminal_json
    FROM ai_chat_assistant_attempts WHERE id = ?
  `).get(started.attempt.id) };
  assert.deepEqual({ ...failedAttemptRow, terminal_json: undefined }, {
    configured_provider: "openrouter",
    configured_model: "@preset/free-unmubme-test",
    provider: null,
    model: null,
    error_code: "provider_rate_limited",
    terminal_json: undefined,
  });
  assert.deepEqual(JSON.parse(failedAttemptRow.terminal_json), {
    elapsedMs: 19_409,
    stepCount: 1,
    toolCallCount: 0,
    finishReason: "length",
  });
});

test("failed turns retain the user row and retry the same assistant to completion", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const input = {
    clientMessageId: "retry-me",
    content: "Give me a sentence.",
    practiceContext: [{ text: "figure out", meaningMode: "all_saved" }],
  };
  const started = await repository.beginTurn("user-a", chat.id, input);

  const failed = await repository.failTurn(
    "user-a",
    chat.id,
    "retry-me",
    "provider_timeout",
    started.attempt.id,
  );
  assert.equal(failed.assistant.status, "failed");
  assert.equal(failed.assistant.errorCode, "provider_timeout");
  assert.equal(failed.user.content, input.content);
  const failedAgain = await repository.failTurn(
    "user-a",
    chat.id,
    "retry-me",
    "provider_timeout",
    failed.attempt.id,
  );
  assert.equal(failedAgain.assistant.id, started.assistant.id);

  const retry = await repository.beginTurn("user-a", chat.id, input);
  assert.equal(retry.state, "retrying");
  assert.equal(retry.assistant.id, started.assistant.id);
  assert.equal(retry.assistant.status, "pending");
  assert.equal(retry.assistant.errorCode, null);
  assert.equal(retry.attempt.attemptNumber, 2);
  assert.equal(started.attempt.status, "pending");

  const completed = await repository.finishTurn("user-a", chat.id, "retry-me", {
    attemptId: retry.attempt.id,
    content: "I figured out the answer.",
    provider: "openrouter",
    model: "test/model",
    usage: { inputTokens: 12, outputTokens: 7 },
  });
  assert.equal(completed.assistant.status, "complete");
  assert.equal(completed.assistant.content, "I figured out the answer.");
  assert.deepEqual(completed.assistant.usage, { inputTokens: 12, outputTokens: 7 });

  const duplicateFinish = await repository.finishTurn("user-a", chat.id, "retry-me", {
    attemptId: completed.attempt.id,
    content: "A late competing result.",
    provider: "other",
    model: "other/model",
    usage: null,
  });
  assert.equal(duplicateFinish.assistant.content, "I figured out the answer.");
  const lateFailure = await repository.failTurn(
    "user-a",
    chat.id,
    "retry-me",
    "provider_failed",
    completed.attempt.id,
  );
  assert.equal(lateFailure.assistant.status, "complete");
  assert.equal(
    sqlite.prepare("SELECT count(*) AS count FROM ai_chat_messages WHERE chat_id = ?").get(chat.id).count,
    2,
  );

  for (const action of [
    () => repository.finishTurn("user-b", chat.id, "retry-me", {
      attemptId: completed.attempt.id,
      content: "No.", provider: "openrouter", model: "test/model", usage: null,
    }),
    () => repository.failTurn(
      "user-b",
      chat.id,
      "retry-me",
      "provider_failed",
      completed.attempt.id,
    ),
  ]) {
    await assert.rejects(action(), hasCode("not_found"));
  }
});

test("retry recovers its freshly committed attempt after an ambiguous D1 response", async () => {
  const { database, repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const input = {
    clientMessageId: "ambiguous-retry",
    content: "Give me another sentence.",
    practiceContext: [],
  };
  const started = await repository.beginTurn("user-a", chat.id, input);
  await repository.failTurn(
    "user-a",
    chat.id,
    input.clientMessageId,
    "provider_timeout",
    started.attempt.id,
  );
  database.throwAfterNextBatchCommit = true;

  const recovered = await repository.beginTurn("user-a", chat.id, input);

  assert.equal(recovered.state, "retrying");
  assert.equal(recovered.assistant.id, started.assistant.id);
  assert.equal(recovered.assistant.status, "pending");
  assert.equal(recovered.attempt.status, "pending");
  assert.equal(recovered.attempt.attemptNumber, 2);
});

test("expired leases fence late assistant completion and failure callbacks", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "expired-callback",
    content: "Give me a sentence.",
    practiceContext: [],
  });
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(started.attempt.id);

  const completion = await repository.finishTurn(
    "user-a",
    chat.id,
    "expired-callback",
    {
      attemptId: started.attempt.id,
      content: "A late answer.",
      provider: "openrouter",
      model: "late/model",
      usage: null,
    },
  );
  const failure = await repository.failTurn(
    "user-a",
    chat.id,
    "expired-callback",
    "provider_timeout",
    started.attempt.id,
  );

  assert.equal(completion.assistant.status, "pending");
  assert.equal(failure.assistant.status, "pending");
  assert.equal(sqlite.prepare(`
    SELECT status FROM ai_chat_assistant_attempts WHERE id = ?
  `).get(started.attempt.id).status, "pending");
});

test("stale pending turns recover for retry while fresh pending turns stay single-flight", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const input = {
    clientMessageId: "recover-me",
    content: "Give me a sentence.",
    practiceContext: [{ text: "run", meaningMode: "all_saved" }],
  };
  const started = await repository.beginTurn("user-a", chat.id, input);
  assert.equal((await repository.beginTurn("user-a", chat.id, input)).state, "existing");

  sqlite.prepare(`
    UPDATE ai_chat_messages
    SET updated_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(started.assistant.id);
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(started.attempt.id);
  const recovered = await repository.beginTurn("user-a", chat.id, input);
  assert.equal(recovered.state, "retrying");
  assert.equal(recovered.assistant.id, started.assistant.id);
  assert.equal(recovered.assistant.status, "pending");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT status, error_code, terminal_json
    FROM ai_chat_assistant_attempts WHERE id = ?
  `).get(started.attempt.id) }, {
    status: "expired",
    error_code: "generation_interrupted",
    terminal_json: '{"termination":"lease_expired"}',
  });
});

test("stale retry ignores terminal callbacks from the previous generation attempt", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const input = {
    clientMessageId: "fenced-retry",
    content: "Give me a sentence.",
    practiceContext: [{ text: "run", meaningMode: "all_saved" }],
  };
  const started = await repository.beginTurn("user-a", chat.id, input);
  const staleAttemptId = started.attempt.id;
  sqlite.prepare("UPDATE ai_chat_messages SET updated_at = ? WHERE id = ?")
    .run("2026-08-29T10:00:00.000Z", started.assistant.id);
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(staleAttemptId);
  const recovered = await repository.beginTurn("user-a", chat.id, input);

  const lateCompletion = await repository.finishTurn("user-a", chat.id, "fenced-retry", {
    attemptId: staleAttemptId,
    content: "Late answer from the stale attempt.",
    provider: "openrouter",
    model: "stale/model",
    usage: null,
  });
  assert.equal(lateCompletion.assistant.status, "pending");

  const lateFailure = await repository.failTurn(
    "user-a",
    chat.id,
    "fenced-retry",
    "provider_timeout",
    staleAttemptId,
  );
  assert.equal(lateFailure.assistant.status, "pending");

  const completed = await repository.finishTurn("user-a", chat.id, "fenced-retry", {
    attemptId: recovered.attempt.id,
    content: "Answer from the current attempt.",
    provider: "openrouter",
    model: "current/model",
    usage: null,
  });
  assert.equal(completed.assistant.status, "complete");
  assert.equal(completed.assistant.content, "Answer from the current attempt.");
});

test("opening a chat marks an abandoned pending assistant retryable", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "abandoned",
    content: "One example.",
    practiceContext: [],
  });
  sqlite.prepare(`
    UPDATE ai_chat_messages
    SET updated_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(started.assistant.id);
  sqlite.prepare(`
    UPDATE ai_chat_assistant_attempts
    SET lease_expires_at = '2026-08-29T10:00:00.000Z'
    WHERE id = ?
  `).run(started.attempt.id);

  const reopened = await repository.getChat("user-a", chat.id);
  const assistant = reopened.messages.find((message) => message.role === "assistant");
  assert.equal(assistant.status, "failed");
  assert.equal(assistant.errorCode, "generation_interrupted");
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT status, error_code, terminal_json
    FROM ai_chat_assistant_attempts WHERE id = ?
  `).get(started.attempt.id) }, {
    status: "expired",
    error_code: "generation_interrupted",
    terminal_json: '{"termination":"lease_expired"}',
  });
});

test("chat lists carry a plain-text preview of the latest message without a schema change", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a", {
    openingMessage: "## Welcome\n\nPick a **word** to practise.",
  });
  assert.equal((await repository.listChats("user-a"))[0].preview, "Welcome Pick a word to practise.");
  assert.equal((await repository.getChat("user-a", chat.id)).preview, "Welcome Pick a word to practise.");

  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "preview-1",
    content: "Teach me *resilient*.",
    practiceContext: [],
  });
  assert.equal((await repository.listChats("user-a"))[0].preview, "Teach me resilient.");
  await repository.finishTurn("user-a", chat.id, "preview-1", {
    attemptId: started.attempt.id,
    content: "See [Cambridge](https://dictionary.cambridge.org) and `robust`:\n\n```js\nignored()\n```\n- **bounce back**",
    provider: "openrouter",
    model: "test/model",
  });
  assert.equal(
    (await repository.getChatSummary("user-a", chat.id)).preview,
    "See Cambridge and robust: bounce back",
  );
  assert.equal((await repository.listChats("user-b")).length, 0);
});

test("preview flattening is bounded, plain, and safe for empty input", () => {
  const { toChatPreview } = repositoryModule;
  assert.equal(toChatPreview(""), "");
  assert.equal(toChatPreview(null), "");
  assert.equal(toChatPreview("a\n\n  b\t c"), "a b c");
  assert.equal(toChatPreview("snake_case stays _emphasis_"), "snake_case stays emphasis");
  const long = toChatPreview("word ".repeat(80));
  assert.equal([...long].length, 120);
  assert.ok(long.endsWith("…"));
});

test("renaming trims, bounds, keeps the ordering timestamp, and stays owner scoped", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const other = await repository.createChat("user-b");

  const renamed = await repository.renameChat("user-a", chat.id, "  My   resilient\n practice  ");
  assert.equal(renamed.title, "My resilient practice");
  assert.equal(renamed.updatedAt, chat.updatedAt);
  assert.equal((await repository.getChat("user-a", chat.id)).title, "My resilient practice");
  const bounded = await repository.renameChat("user-a", chat.id, "x".repeat(140));
  assert.equal([...bounded.title].length, 100);

  await assert.rejects(repository.renameChat("user-b", chat.id, "Stolen"), hasCode("not_found"));
  await assert.rejects(repository.renameChat("user-a", other.id, "Stolen"), hasCode("not_found"));
  assert.equal((await repository.getChat("user-a", chat.id)).title, bounded.title);
  assert.equal((await repository.getChat("user-b", other.id)).title, other.title);
});

test("deleting a chat removes everything hanging off it and never touches another user's chat", async () => {
  const { repository, sqlite } = createFixture();
  const chat = await repository.createChat("user-a", {
    targets: [{ source: "saved", phraseId: "phrase-shared", meaningMode: "all_saved" }],
    openingMessage: "Hello.",
  });
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "delete-1",
    content: "One turn.",
    practiceContext: [],
  });
  await repository.finishTurn("user-a", chat.id, "delete-1", {
    attemptId: started.attempt.id,
    content: "Done.",
    provider: "openrouter",
    model: "test/model",
  });
  const survivor = await repository.createChat("user-a", { openingMessage: "Keep me." });
  const foreign = await repository.createChat("user-b", { openingMessage: "Not yours." });

  await assert.rejects(repository.deleteChat("user-b", chat.id), hasCode("not_found"));
  await assert.rejects(repository.deleteChat("user-a", foreign.id), hasCode("not_found"));
  assert.ok(await repository.getChat("user-a", chat.id));
  assert.ok(await repository.getChat("user-b", foreign.id));

  await repository.deleteChat("user-a", chat.id);
  assert.equal(await repository.getChat("user-a", chat.id), null);
  await assert.rejects(repository.deleteChat("user-a", chat.id), hasCode("not_found"));

  const chatTables = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `).all().map((row) => row.name).filter((name) => (
    sqlite.prepare(`PRAGMA table_info(${name})`).all().some((column) => column.name === "chat_id")
  ));
  assert.ok(chatTables.length >= 4, "messages, practice items, attempts and tool traces reference chats");
  for (const table of chatTables) {
    assert.equal(
      sqlite.prepare(`SELECT count(*) AS count FROM ${table} WHERE chat_id = ?`).get(chat.id).count,
      0,
      table,
    );
  }
  assert.equal((await repository.getChat("user-a", survivor.id)).messages.length, 1);
  assert.equal((await repository.getChat("user-b", foreign.id)).messages.length, 1);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM phrases WHERE id = 'phrase-shared'").get().count, 1);
  assert.deepEqual((await repository.listChats("user-a")).map((item) => item.id), [survivor.id]);
});

test("a chat cannot be deleted while its reply is being generated", async () => {
  const { repository } = createFixture();
  const chat = await repository.createChat("user-a");
  const started = await repository.beginTurn("user-a", chat.id, {
    clientMessageId: "busy-1",
    content: "Still thinking.",
    practiceContext: [],
  });

  await assert.rejects(repository.deleteChat("user-a", chat.id), hasCode("turn_in_progress"));
  assert.ok(await repository.getChat("user-a", chat.id));
  await repository.cancelTurn("user-a", chat.id, "busy-1");
  await repository.deleteChat("user-a", chat.id);
  assert.equal(await repository.getChat("user-a", chat.id), null);
  assert.ok(started.attempt.id);
});
