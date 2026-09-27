import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

class SQLiteD1Statement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SQLiteD1Statement(this.database, this.sql, bindings);
  }

  execute() {
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

  async all() {
    return this.execute();
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.bindings) || null;
  }

  async run() {
    return this.execute();
  }
}

class SQLiteD1Database {
  constructor(database) {
    this.database = database;
    this.failAtBatchIndex = null;
  }

  prepare(sql) {
    return new SQLiteD1Statement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement, index) => {
        if (index === this.failAtBatchIndex) {
          throw new Error("Simulated D1 batch failure.");
        }
        return statement.execute();
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function createFixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of readdirSync(join(root, "drizzle"))
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort()) {
    sqlite.exec(readFileSync(join(root, "drizzle", migration), "utf8"));
  }
  sqlite.exec(`
    INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES
      ('user-a', 'a@example.com', 'A', '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z'),
      ('user-b', 'b@example.com', 'B', '2026-08-29T10:00:00.000Z', '2026-08-29T10:00:00.000Z');
  `);
  const database = new SQLiteD1Database(sqlite);
  globalThis.__phrasesRouteDatabase = database;
  globalThis.__phrasesRouteUser = {
    subject: "user-a",
    email: "a@example.com",
    name: "A",
  };
  globalThis.__phrasesRouteTranslationCalls = 0;
  globalThis.__phrasesRouteTranslations = [];
  return { database, sqlite };
}

function seedPhrase(sqlite, {
  id,
  text,
  translation = "",
  context = "",
  sourceType = "preset",
  ownerId = null,
}) {
  sqlite.prepare(`
    INSERT INTO phrases (
      id, text, pattern, ipa, translation, context, source_type, catalog_order,
      owner_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, '', ?, ?, ?, NULL, ?, 'pick', ?, ?)
  `).run(
    id,
    text,
    text,
    translation,
    context,
    sourceType,
    ownerId,
    "2026-08-29T10:00:00.000Z",
    "2026-08-29T10:00:00.000Z",
  );
}

function seedProgress(sqlite, userId, phraseId, status) {
  sqlite.prepare(`
    INSERT INTO phrase_progress (user_id, phrase_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    phraseId,
    status,
    "2026-08-29T10:00:00.000Z",
    "2026-08-29T10:00:00.000Z",
  );
}

function seedMeaning(sqlite, {
  id,
  userId,
  phraseId,
  translation,
  context = "",
  createdAt = "2026-08-29T10:00:00.000Z",
}) {
  sqlite.prepare(`
    INSERT INTO phrase_meanings (
      id, user_id, phrase_id, translation, normalized_translation, context,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    userId,
    phraseId,
    translation,
    translation.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(),
    context,
    createdAt,
    createdAt,
  );
}

async function compileRoute() {
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: ["app/api/phrases/route.ts"],
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    plugins: [{
      name: "phrases-route-test-boundaries",
      setup(esbuild) {
        const mocks = new Map([
          ["@/db", `
            export function getD1() {
              return globalThis.__phrasesRouteDatabase;
            }
          `],
          ["@/lib/auth", `
            export const LEGACY_OWNER_EMAIL = "legacy@example.com";
            export async function getCurrentUser() {
              return globalThis.__phrasesRouteUser;
            }
            export function unauthorizedResponse() {
              return Response.json({ error: "unauthorized" }, { status: 401 });
            }
          `],
          ["@/lib/deepl", `
            export class DeepLError extends Error {
              constructor(code, message) {
                super(message);
                this.code = code;
              }
            }
            export async function translateEnglishToNativeLanguage(texts) {
              globalThis.__phrasesRouteTranslationCalls += 1;
              const translations = globalThis.__phrasesRouteTranslations;
              return texts.map((text, index) => translations[index] || ("translated:" + text));
            }
          `],
        ]);
        esbuild.onResolve({ filter: /^@\/(db|lib\/auth|lib\/deepl)$/ }, (args) => ({
          path: args.path,
          namespace: "phrases-route-test",
        }));
        esbuild.onLoad({ filter: /.*/, namespace: "phrases-route-test" }, (args) => ({
          contents: mocks.get(args.path),
          loader: "ts",
        }));
      },
    }],
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const route = await compileRoute();

test("GET uses the current user's first personal meaning only when legacy translation is empty", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, { id: "preset-run", text: "run" });
  seedPhrase(sqlite, {
    id: "private-b",
    text: "private phrase",
    sourceType: "custom",
    ownerId: "user-b",
  });
  seedProgress(sqlite, "user-a", "preset-run", "learning_now");
  seedProgress(sqlite, "user-b", "preset-run", "to_learn");
  seedProgress(sqlite, "user-b", "private-b", "to_learn");
  seedMeaning(sqlite, {
    id: "meaning-a",
    userId: "user-a",
    phraseId: "preset-run",
    translation: "управлять",
    context: "run a company",
  });
  seedMeaning(sqlite, {
    id: "meaning-b",
    userId: "user-b",
    phraseId: "preset-run",
    translation: "бегать",
    context: "run every morning",
  });

  const response = await route.GET(new Request("http://local.test/api/phrases"));
  assert.equal(response.status, 200);
  const payload = await response.json();
  const phrase = payload.phrases.find((item) => item.id === "preset-run");
  assert.deepEqual({
    translation: phrase.translation,
    context: phrase.context,
    status: phrase.status,
  }, {
    translation: "управлять",
    context: "run a company",
    status: "learning_now",
  });
  assert.equal(payload.phrases.some((item) => item.id === "private-b"), false);
});

test("POST reuses a personal fallback, preserves status, and does not create retry duplicates", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, { id: "preset-run", text: "run" });
  seedProgress(sqlite, "user-a", "preset-run", "learnt");
  seedMeaning(sqlite, {
    id: "meaning-a",
    userId: "user-a",
    phraseId: "preset-run",
    translation: "управлять",
    context: "run a company",
  });
  globalThis.__phrasesRouteTranslations = ["запустить"];

  const response = await route.POST(new Request("http://local.test/api/phrases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "RUN" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json().then(({ id, status, translation, context, created }) => ({
    id,
    status,
    translation,
    context,
    created,
  })), {
    id: "preset-run",
    status: "learnt",
    translation: "управлять",
    context: "run a company",
    created: false,
  });
  assert.equal(globalThis.__phrasesRouteTranslationCalls, 0);
  assert.equal(sqlite.prepare(`
    SELECT count(*) AS count FROM phrase_meanings
    WHERE user_id = 'user-a' AND phrase_id = 'preset-run'
  `).get().count, 1);
});

test("POST stores an explicit preset translation personally without changing shared legacy fields", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, {
    id: "preset-run",
    text: "run",
    translation: "бежать",
    context: "run daily",
  });
  seedProgress(sqlite, "user-a", "preset-run", "learning_now");

  for (const translation of ["управлять", "УПРАВЛЯТЬ"]) {
    const response = await route.POST(new Request("http://local.test/api/phrases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "run", translation, context: "run a company" }),
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "learning_now");
  }

  assert.deepEqual({ ...sqlite.prepare(`
    SELECT translation, context, updated_at FROM phrases WHERE id = 'preset-run'
  `).get() }, {
    translation: "бежать",
    context: "run daily",
    updated_at: "2026-08-29T10:00:00.000Z",
  });
  assert.deepEqual(sqlite.prepare(`
    SELECT user_id, translation, normalized_translation, context
    FROM phrase_meanings WHERE phrase_id = 'preset-run'
  `).all().map((row) => ({ ...row })), [{
    user_id: "user-a",
    translation: "УПРАВЛЯТЬ",
    normalized_translation: "управлять",
    context: "run a company",
  }]);
});

test("GET backfill stores a personal preset meaning and remains idempotent", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, {
    id: "preset-break-even",
    text: "break even",
    context: "shared catalog context",
  });
  seedProgress(sqlite, "user-a", "preset-break-even", "to_learn");
  globalThis.__phrasesRouteTranslations = ["окупаться"];

  const firstGet = await route.GET(new Request("http://local.test/api/phrases"));
  assert.equal(firstGet.headers.get("X-Unmumble-Backfill"), "1");
  await route.backfillTranslations("user-a", new Request("http://local.test/api/phrases"));
  await route.backfillTranslations("user-a", new Request("http://local.test/api/phrases"));

  assert.deepEqual({ ...sqlite.prepare(`
    SELECT translation, context, updated_at
    FROM phrases WHERE id = 'preset-break-even'
  `).get() }, {
    translation: "",
    context: "shared catalog context",
    updated_at: "2026-08-29T10:00:00.000Z",
  });
  assert.deepEqual(sqlite.prepare(`
    SELECT user_id, translation, normalized_translation
    FROM phrase_meanings WHERE phrase_id = 'preset-break-even'
  `).all().map((row) => ({ ...row })), [{
    user_id: "user-a",
    translation: "окупаться",
    normalized_translation: "окупаться",
  }]);

  const secondGet = await route.GET(new Request("http://local.test/api/phrases"));
  const phrase = (await secondGet.json()).phrases.find((item) => item.id === "preset-break-even");
  assert.equal(secondGet.headers.get("X-Unmumble-Backfill"), null);
  assert.equal(phrase.translation, "окупаться");
});

test("POST ignores another owner's custom phrase and creates one owner-scoped entry", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, {
    id: "private-b",
    text: "break even",
    translation: "чужой перевод",
    sourceType: "custom",
    ownerId: "user-b",
  });
  seedProgress(sqlite, "user-b", "private-b", "learnt");

  const first = await route.POST(new Request("http://local.test/api/phrases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "break even", translation: "окупаться" }),
  }));
  assert.equal(first.status, 201);
  const firstPayload = await first.json();
  assert.notEqual(firstPayload.id, "private-b");
  assert.equal(firstPayload.status, "to_learn");

  const retry = await route.POST(new Request("http://local.test/api/phrases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "BREAK EVEN", translation: "ОКУПАТЬСЯ" }),
  }));
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, firstPayload.id);
  assert.deepEqual(sqlite.prepare(`
    SELECT owner_id, count(*) AS count
    FROM phrases WHERE text = 'break even' COLLATE NOCASE
    GROUP BY owner_id ORDER BY owner_id
  `).all().map((row) => ({ ...row })), [
    { owner_id: "user-a", count: 1 },
    { owner_id: "user-b", count: 1 },
  ]);
});

test("PATCH stores blank-preset translations per user without changing shared fields", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, {
    id: "preset-run",
    text: "run",
    context: "shared catalog context",
  });
  seedProgress(sqlite, "user-a", "preset-run", "learning_now");
  seedProgress(sqlite, "user-b", "preset-run", "to_learn");

  globalThis.__phrasesRouteTranslations = ["управлять"];
  const responseA = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "preset-run", status: "learnt" }),
  }));
  assert.equal(responseA.status, 200);
  assert.deepEqual(await responseA.json().then(({ status, translation }) => ({ status, translation })), {
    status: "learnt",
    translation: "управлять",
  });

  globalThis.__phrasesRouteUser = {
    subject: "user-b",
    email: "b@example.com",
    name: "B",
  };
  globalThis.__phrasesRouteTranslations = ["бегать"];
  const responseB = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "preset-run", status: "learning_now" }),
  }));
  assert.equal(responseB.status, 200);
  assert.deepEqual(await responseB.json().then(({ status, translation }) => ({ status, translation })), {
    status: "learning_now",
    translation: "бегать",
  });

  globalThis.__phrasesRouteUser = {
    subject: "user-a",
    email: "a@example.com",
    name: "A",
  };
  globalThis.__phrasesRouteTranslations = ["не использовать"];
  const retryA = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "preset-run", status: "learnt" }),
  }));
  assert.equal(retryA.status, 200);
  assert.equal((await retryA.json()).translation, "управлять");
  assert.equal(globalThis.__phrasesRouteTranslationCalls, 2);

  assert.deepEqual({ ...sqlite.prepare(`
    SELECT translation, context, updated_at FROM phrases WHERE id = 'preset-run'
  `).get() }, {
    translation: "",
    context: "shared catalog context",
    updated_at: "2026-08-29T10:00:00.000Z",
  });
  assert.deepEqual(sqlite.prepare(`
    SELECT user_id, translation, normalized_translation
    FROM phrase_meanings WHERE phrase_id = 'preset-run'
    ORDER BY user_id
  `).all().map((row) => ({ ...row })), [
    {
      user_id: "user-a",
      translation: "управлять",
      normalized_translation: "управлять",
    },
    {
      user_id: "user-b",
      translation: "бегать",
      normalized_translation: "бегать",
    },
  ]);
  assert.deepEqual(sqlite.prepare(`
    SELECT user_id, status FROM phrase_progress
    WHERE phrase_id = 'preset-run' ORDER BY user_id
  `).all().map((row) => ({ ...row })), [
    { user_id: "user-a", status: "learnt" },
    { user_id: "user-b", status: "learning_now" },
  ]);
});

test("PATCH reuses an existing personal preset meaning without losing its context", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, {
    id: "preset-break-even",
    text: "break even",
    context: "shared catalog context",
  });
  seedProgress(sqlite, "user-a", "preset-break-even", "learning_now");
  seedMeaning(sqlite, {
    id: "meaning-a",
    userId: "user-a",
    phraseId: "preset-break-even",
    translation: "окупаться",
    context: "cover the costs",
  });
  globalThis.__phrasesRouteTranslations = ["не использовать"];

  const response = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "preset-break-even", status: "to_learn" }),
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json().then(({ status, translation }) => ({ status, translation })), {
    status: "to_learn",
    translation: "окупаться",
  });
  assert.equal(globalThis.__phrasesRouteTranslationCalls, 0);
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT translation, context FROM phrases WHERE id = 'preset-break-even'
  `).get() }, {
    translation: "",
    context: "shared catalog context",
  });
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT translation, context FROM phrase_meanings WHERE id = 'meaning-a'
  `).get() }, {
    translation: "окупаться",
    context: "cover the costs",
  });
});

test("PATCH commits preset meaning and status atomically", async () => {
  const { database, sqlite } = createFixture();
  seedPhrase(sqlite, { id: "preset-run", text: "run" });
  seedProgress(sqlite, "user-a", "preset-run", "to_learn");
  globalThis.__phrasesRouteTranslations = ["управлять"];
  database.failAtBatchIndex = 1;

  const response = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "preset-run", status: "learnt" }),
  }));

  assert.equal(response.status, 500);
  assert.equal(sqlite.prepare(`
    SELECT count(*) AS count FROM phrase_meanings
    WHERE user_id = 'user-a' AND phrase_id = 'preset-run'
  `).get().count, 0);
  assert.equal(sqlite.prepare(`
    SELECT status FROM phrase_progress
    WHERE user_id = 'user-a' AND phrase_id = 'preset-run'
  `).get().status, "to_learn");
});

test("PATCH stores an owned custom translation personally and rejects a foreign custom phrase", async () => {
  const { sqlite } = createFixture();
  seedPhrase(sqlite, {
    id: "custom-a",
    text: "break even",
    context: "owned context",
    sourceType: "custom",
    ownerId: "user-a",
  });
  seedPhrase(sqlite, {
    id: "custom-b",
    text: "run a company",
    context: "foreign context",
    sourceType: "custom",
    ownerId: "user-b",
  });
  seedProgress(sqlite, "user-a", "custom-a", "learnt");
  seedProgress(sqlite, "user-b", "custom-b", "learning_now");
  globalThis.__phrasesRouteTranslations = ["окупаться"];

  const first = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "custom-a", status: "learning_now" }),
  }));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).translation, "окупаться");
  globalThis.__phrasesRouteTranslations = ["не использовать"];
  const retry = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "custom-a", status: "to_learn" }),
  }));
  assert.equal(retry.status, 200);
  assert.equal(globalThis.__phrasesRouteTranslationCalls, 1);

  const foreign = await route.PATCH(new Request("http://local.test/api/phrases", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "custom-b", status: "learnt" }),
  }));
  assert.equal(foreign.status, 404);
  assert.deepEqual(sqlite.prepare(`
    SELECT id, translation, context
    FROM phrases WHERE id IN ('custom-a', 'custom-b') ORDER BY id
  `).all().map((row) => ({ ...row })), [
    {
      id: "custom-a",
      translation: "",
      context: "owned context",
    },
    {
      id: "custom-b",
      translation: "",
      context: "foreign context",
    },
  ]);
  assert.deepEqual({ ...sqlite.prepare(`
    SELECT user_id, phrase_id, translation, context FROM phrase_meanings
    WHERE phrase_id IN ('custom-a', 'custom-b')
  `).get() }, {
    user_id: "user-a",
    phrase_id: "custom-a",
    translation: "окупаться",
    context: "",
  });
  assert.deepEqual(sqlite.prepare(`
    SELECT user_id, phrase_id, status FROM phrase_progress
    WHERE phrase_id IN ('custom-a', 'custom-b') ORDER BY phrase_id
  `).all().map((row) => ({ ...row })), [
    { user_id: "user-a", phrase_id: "custom-a", status: "to_learn" },
    { user_id: "user-b", phrase_id: "custom-b", status: "learning_now" },
  ]);
});

test.after(() => {
  delete globalThis.__phrasesRouteDatabase;
  delete globalThis.__phrasesRouteUser;
  delete globalThis.__phrasesRouteTranslationCalls;
  delete globalThis.__phrasesRouteTranslations;
});
