import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

class Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new Statement(this.database, this.sql, values); }
  async first() { return this.database.prepare(this.sql).get(...this.values) || null; }
  async run() { return this.database.prepare(this.sql).run(...this.values); }
}

function fixture() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync(join(root, "drizzle")).filter((item) => /^\d{4}_.+\.sql$/.test(item)).sort()) {
    database.exec(readFileSync(join(root, "drizzle", name), "utf8"));
  }
  database.exec(`
    INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES
      ('user-a', 'a@example.com', 'A', '2026-09-27', '2026-09-27'),
      ('user-b', 'b@example.com', 'B', '2026-09-27', '2026-09-27');
  `);
  globalThis.__nativeLanguageDatabase = { prepare: (sql) => new Statement(database, sql) };
  globalThis.__nativeLanguageUser = { subject: "user-a", email: "a@example.com", name: "A" };
  globalThis.__nativeLanguageDeeplKey = "shared-test-key:fx";
  return database;
}

async function compile(entry) {
  const result = await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    packages: "external",
    plugins: [{
      name: "native-language-boundaries",
      setup(esbuild) {
        const mocks = new Map([
          ["cloudflare:workers", "export const env = { get DEEPL_DEFAULT_API_KEY() { return globalThis.__nativeLanguageDeeplKey; } };"],
          ["@/db", "export const getD1 = () => globalThis.__nativeLanguageDatabase;"],
          ["@/lib/auth", `
            export const getCurrentUser = async () => globalThis.__nativeLanguageUser;
            export const getAuthenticatedUser = () => globalThis.__nativeLanguageUser;
            export const unauthorizedResponse = () => Response.json({ error: 'Sign in' }, { status: 401 });
          `],
          ["@/lib/integration-secrets", `
            export class IntegrationSecretError extends Error {}
            export const readIntegrationSecret = async () => null;
          `],
        ]);
        esbuild.onResolve({ filter: /^(cloudflare:workers|@\/)/ }, (args) =>
          mocks.has(args.path)
            ? { path: args.path, namespace: "native-language-mock" }
            : { path: join(root, `${args.path.slice(2)}.ts`) });
        esbuild.onLoad({ filter: /.*/, namespace: "native-language-mock" }, (args) => ({
          contents: mocks.get(args.path), loader: "ts",
        }));
      },
    }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

test("native language defaults to Russian, saves only a DeepL target, and scopes the choice to the account", async () => {
  const database = fixture();
  const route = await compile("app/api/settings/native-language/route.ts");
  const originalFetch = globalThis.fetch;
  const previousDefaultKey = process.env.DEEPL_DEFAULT_API_KEY;
  const previousApiKey = process.env.DEEPL_API_KEY;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api-free\.deepl\.com\/v3\/languages\?resource=translate_text/);
    return Response.json([
      { lang: "ru", name: "Russian", usable_as_target: true, status: "stable" },
      { lang: "uk", name: "Ukrainian", usable_as_target: true, status: "stable" },
      { lang: "en", name: "English", usable_as_target: false, status: "stable" },
      { lang: "fr", name: "French", usable_as_target: false, status: "stable" },
    ]);
  };
  try {
    const initial = await route.GET(new Request("http://local.test/api/settings/native-language"));
    assert.equal(initial.status, 200);
    assert.deepEqual(await initial.json(), {
      nativeLanguage: "ru",
      languages: [{ code: "ru", name: "Russian" }, { code: "uk", name: "Ukrainian" }],
    });

    const request = (nativeLanguage) => new Request("http://local.test/api/settings/native-language", {
      method: "PUT",
      headers: { Origin: "http://local.test", "Content-Type": "application/json" },
      body: JSON.stringify({ nativeLanguage }),
    });
    const rejected = await route.PUT(request("fr"));
    assert.equal(rejected.status, 400);
    const invalid = await route.PUT(new Request("http://local.test/api/settings/native-language", {
      method: "PUT",
      headers: { Origin: "http://local.test", "Content-Type": "application/json" },
      body: "null",
    }));
    assert.equal(invalid.status, 400);
    assert.equal(database.prepare("SELECT native_language FROM users WHERE id = 'user-a'").get().native_language, "ru");

    const saved = await route.PUT(request("uk"));
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).nativeLanguage, "uk");
    assert.equal(database.prepare("SELECT native_language FROM users WHERE id = 'user-a'").get().native_language, "uk");
    assert.equal(database.prepare("SELECT native_language FROM users WHERE id = 'user-b'").get().native_language, "ru");

    const mockFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("DeepL unavailable"); };
    const unavailable = await route.GET(new Request("http://local.test/api/settings/native-language"));
    assert.deepEqual(await unavailable.json(), { nativeLanguage: "uk", languages: [] });
    globalThis.fetch = mockFetch;

    globalThis.__nativeLanguageDeeplKey = undefined;
    process.env.DEEPL_DEFAULT_API_KEY = "";
    process.env.DEEPL_API_KEY = "";
    const withoutKey = await route.GET(new Request("http://local.test/api/settings/native-language"));
    assert.deepEqual(await withoutKey.json(), { nativeLanguage: "uk", languages: [] });
    const unsaved = await route.PUT(request("ru"));
    assert.equal(unsaved.status, 503);
    assert.deepEqual(await unsaved.json(), { error: "Translation is not configured yet." });
    assert.equal(database.prepare("SELECT native_language FROM users WHERE id = 'user-a'").get().native_language, "uk");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousDefaultKey === undefined) delete process.env.DEEPL_DEFAULT_API_KEY;
    else process.env.DEEPL_DEFAULT_API_KEY = previousDefaultKey;
    if (previousApiKey === undefined) delete process.env.DEEPL_API_KEY;
    else process.env.DEEPL_API_KEY = previousApiKey;
    database.close();
  }
});

test("DeepL translation uses the saved native language and keeps the key on the server", async () => {
  const database = fixture();
  database.prepare("UPDATE users SET native_language = 'uk' WHERE id = 'user-a'").run();
  const { translateEnglishToNativeLanguage } = await compile("lib/deepl.ts");
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url: String(url), options };
    return Response.json({ translations: [{ text: "привіт" }] });
  };
  try {
    assert.deepEqual(await translateEnglishToNativeLanguage(["hello"], "", { request: new Request("http://local.test") }), ["привіт"]);
    assert.equal(request.url, "https://api-free.deepl.com/v2/translate");
    assert.equal(request.options.headers.Authorization, "DeepL-Auth-Key shared-test-key:fx");
    assert.deepEqual(JSON.parse(request.options.body), { text: ["hello"], source_lang: "EN", target_lang: "uk" });
  } finally {
    globalThis.fetch = originalFetch;
    database.close();
  }
});
