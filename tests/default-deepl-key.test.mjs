import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const commonTestPlugin = {
  name: "common-test-mocks",
  setup(esbuild) {
    esbuild.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
      path: "cloudflare:workers",
      namespace: "mock-cf",
    }));
    esbuild.onLoad({ filter: /.*/, namespace: "mock-cf" }, () => ({
      contents: `export const env = new Proxy({}, { get(_, prop) { return globalThis.__mockWorkerEnv?.[prop]; } });`,
      loader: "js",
    }));
    esbuild.onResolve({ filter: /^@\/lib\/auth$/ }, () => ({
      path: "@/lib/auth",
      namespace: "mock-auth",
    }));
    esbuild.onLoad({ filter: /.*/, namespace: "mock-auth" }, () => ({
      contents: `
        export function getAuthenticatedUser() { return globalThis.__mockAuthUser || null; }
        export async function getCurrentUser() { return globalThis.__mockAuthUser || null; }
        export function unauthorizedResponse() { return Response.json({ error: "unauthorized" }, { status: 401 }); }
      `,
      loader: "js",
    }));
    esbuild.onResolve({ filter: /^@\/lib\/integration-secrets$/ }, () => ({
      path: "@/lib/integration-secrets",
      namespace: "mock-secrets",
    }));
    esbuild.onLoad({ filter: /.*/, namespace: "mock-secrets" }, () => ({
      contents: `
        export class IntegrationSecretError extends Error {}
        export async function readIntegrationSecret(userId, provider) {
          return globalThis.__mockUserSecrets?.[userId]?.[provider] || null;
        }
        export async function getIntegrationStatus(userId, provider) {
          return Boolean(globalThis.__mockUserSecrets?.[userId]?.[provider]);
        }
        export async function storeIntegrationSecret(userId, provider, value) {
          if (!globalThis.__mockUserSecrets) globalThis.__mockUserSecrets = {};
          if (!globalThis.__mockUserSecrets[userId]) globalThis.__mockUserSecrets[userId] = {};
          globalThis.__mockUserSecrets[userId][provider] = value;
        }
        export async function deleteIntegrationSecret(userId, provider) {
          if (globalThis.__mockUserSecrets?.[userId]) delete globalThis.__mockUserSecrets[userId][provider];
        }
      `,
      loader: "js",
    }));
    esbuild.onResolve({ filter: /^@\/lib\/native-language$/ }, () => ({
      path: "@/lib/native-language",
      namespace: "mock-native-language",
    }));
    esbuild.onLoad({ filter: /.*/, namespace: "mock-native-language" }, () => ({
      contents: `export const DEFAULT_NATIVE_LANGUAGE = "ru"; export async function getNativeLanguage() { return "ru"; }`,
      loader: "js",
    }));
  },
};

async function compileEntry(entryPoint) {
  const result = await build({
    absWorkingDir: root,
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    platform: "node",
    target: "node24",
    write: false,
    plugins: [commonTestPlugin],
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

async function withMockDeeplFetch(responseText, callback) {
  let authHeader = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_, init) => {
    authHeader = init?.headers?.Authorization || "";
    return new Response(JSON.stringify({
      translations: [{ text: responseText }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await callback(() => authHeader);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("getDefaultDeeplApiKey resolves from worker env or process env", async () => {
  const deepl = await compileEntry("lib/deepl.ts");

  globalThis.__mockWorkerEnv = {};
  const prevDefault = process.env.DEEPL_DEFAULT_API_KEY;
  const prevAlias = process.env.DEEPL_API_KEY;
  delete process.env.DEEPL_DEFAULT_API_KEY;
  delete process.env.DEEPL_API_KEY;

  assert.equal(deepl.getDefaultDeeplApiKey(), undefined);

  globalThis.__mockWorkerEnv = { DEEPL_DEFAULT_API_KEY: "default-key-123" };
  assert.equal(deepl.getDefaultDeeplApiKey(), "default-key-123");

  globalThis.__mockWorkerEnv = { DEEPL_API_KEY: "alias-key-456" };
  assert.equal(deepl.getDefaultDeeplApiKey(), "alias-key-456");

  globalThis.__mockWorkerEnv = {};
  process.env.DEEPL_DEFAULT_API_KEY = "proc-key-789";
  assert.equal(deepl.getDefaultDeeplApiKey(), "proc-key-789");

  if (prevDefault) process.env.DEEPL_DEFAULT_API_KEY = prevDefault;
  else delete process.env.DEEPL_DEFAULT_API_KEY;
  if (prevAlias) process.env.DEEPL_API_KEY = prevAlias;
  else delete process.env.DEEPL_API_KEY;
  delete globalThis.__mockWorkerEnv;
});

test("translation uses custom key or falls back to default key", async () => {
  const deepl = await compileEntry("lib/deepl.ts");
  const translateRequest = new Request("https://unmumble.online/api/translate");

  // Case A: User has custom key -> uses custom key
  globalThis.__mockWorkerEnv = { DEEPL_DEFAULT_API_KEY: "default-system-key:fx" };
  globalThis.__mockAuthUser = { subject: "user-test" };
  globalThis.__mockUserSecrets = { "user-test": { deepl: "user-custom-key:fx" } };

  await withMockDeeplFetch("Привет", async (getAuth) => {
    const res = await deepl.translateEnglishToNativeLanguage(["Hello"], "", { request: translateRequest });
    assert.deepEqual(res, ["Привет"]);
    assert.equal(getAuth(), "DeepL-Auth-Key user-custom-key:fx");
  });

  // Case B: User has NO custom key -> falls back to default key
  globalThis.__mockUserSecrets = {};
  await withMockDeeplFetch("Мир", async (getAuth) => {
    const res = await deepl.translateEnglishToNativeLanguage(["World"], "", { request: translateRequest });
    assert.deepEqual(res, ["Мир"]);
    assert.equal(getAuth(), "DeepL-Auth-Key default-system-key:fx");
  });

  // Case C: Neither key exists -> throws not_configured
  globalThis.__mockWorkerEnv = {};
  delete process.env.DEEPL_DEFAULT_API_KEY;
  delete process.env.DEEPL_API_KEY;

  await assert.rejects(
    () => deepl.translateEnglishToNativeLanguage(["Hi"], "", { request: translateRequest }),
    (err) => err.code === "not_configured",
  );

  delete globalThis.__mockWorkerEnv;
  delete globalThis.__mockAuthUser;
  delete globalThis.__mockUserSecrets;
});

test("integrations route reports default vs custom source and handles deletion", async () => {
  const route = await compileEntry("app/api/integrations/route.ts");
  globalThis.__mockWorkerEnv = { DEEPL_DEFAULT_API_KEY: "default-key" };
  globalThis.__mockAuthUser = { subject: "user-1" };

  // 1. GET with only default key
  globalThis.__mockUserSecrets = {};
  const res1 = await (await route.GET(new Request("https://unmumble.online/api/integrations"))).json();
  assert.deepEqual(res1.integrations, [{
    provider: "deepl",
    label: "DeepL",
    configured: true,
    source: "default",
  }]);

  // 2. GET with user custom key configured
  globalThis.__mockUserSecrets = { "user-1": { deepl: "my-custom-key" } };
  const res2 = await (await route.GET(new Request("https://unmumble.online/api/integrations"))).json();
  assert.deepEqual(res2.integrations, [{
    provider: "deepl",
    label: "DeepL",
    configured: true,
    source: "integrations",
  }]);

  // 3. DELETE custom key reverts to source='default'
  const delReq = new Request("https://unmumble.online/api/integrations?provider=deepl", {
    method: "DELETE",
    headers: { Origin: "https://unmumble.online" },
  });
  const delRes = await (await route.DELETE(delReq)).json();
  assert.equal(delRes.ok, true);
  assert.equal(delRes.configured, true);
  assert.equal(delRes.source, "default");
  assert.equal(globalThis.__mockUserSecrets["user-1"]?.deepl, undefined);

  delete globalThis.__mockWorkerEnv;
  delete globalThis.__mockAuthUser;
  delete globalThis.__mockUserSecrets;
});

test("POST /api/translate allows guest request and uses default key", async () => {
  const route = await compileEntry("app/api/translate/route.ts");
  globalThis.__mockWorkerEnv = { DEEPL_DEFAULT_API_KEY: "default-guest-key:fx" };
  delete globalThis.__mockAuthUser;
  delete globalThis.__mockUserSecrets;

  try {
    await withMockDeeplFetch("Гость", async (getAuth) => {
      const res = await route.POST(new Request("https://unmumble.online/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://unmumble.online",
        },
        body: JSON.stringify({ text: "Guest", context: "Guest user" }),
      }));
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.translation, "Гость");
      assert.equal(getAuth(), "DeepL-Auth-Key default-guest-key:fx");
    });
  } finally {
    delete globalThis.__mockWorkerEnv;
  }
});
