import { env } from "cloudflare:workers";
import {
  IntegrationSecretError,
  readIntegrationSecret,
} from "@/lib/integration-secrets";
import { getAuthenticatedUser } from "@/lib/auth";
import { DEFAULT_NATIVE_LANGUAGE, getNativeLanguage } from "@/lib/native-language";

type TranslationResponse = {
  translations?: Array<{ text?: string }>;
  message?: string;
};

export class DeepLError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "upstream" | "empty",
  ) {
    super(message);
  }
}

const DEEPL_TIMEOUT_MS = 8_000;

type DeeplCloudflareEnvironment = {
  DEEPL_DEFAULT_API_KEY?: string;
  DEEPL_API_KEY?: string;
};

export function getDefaultDeeplApiKey(): string | undefined {
  let workerKey: string | undefined;
  try {
    const serverEnv = env as unknown as DeeplCloudflareEnvironment;
    workerKey = serverEnv?.DEEPL_DEFAULT_API_KEY?.trim() || serverEnv?.DEEPL_API_KEY?.trim();
  } catch {
    // env binding not present in non-worker environments
  }
  if (workerKey) return workerKey;
  if (typeof process !== "undefined" && process?.env) {
    return process.env.DEEPL_DEFAULT_API_KEY?.trim() || process.env.DEEPL_API_KEY?.trim() || undefined;
  }
  return undefined;
}

export function cleanTranslationText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

async function deeplApiKey(userId?: string) {
  let apiKey: string | undefined;
  if (userId) {
    try {
      apiKey = (await readIntegrationSecret(userId, "deepl")) || undefined;
    } catch (error) {
      if (!(error instanceof IntegrationSecretError)) throw error;
    }
  }
  apiKey ||= getDefaultDeeplApiKey();
  if (!apiKey) throw new DeepLError("Translation is not configured yet.", "not_configured");
  return apiKey;
}

function deeplEndpoint(apiKey: string, path: string) {
  return `${apiKey.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com"}${path}`;
}

type DeepLLanguage = {
  lang?: unknown;
  name?: unknown;
  usable_as_target?: unknown;
  status?: unknown;
};

export async function listDeeplTargetLanguages(userId: string) {
  const apiKey = await deeplApiKey(userId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(deeplEndpoint(apiKey, "/v3/languages?resource=translate_text"), {
      headers: { Authorization: `DeepL-Auth-Key ${apiKey}` },
      signal: controller.signal,
    });
  } catch {
    throw new DeepLError("Could not load DeepL languages.", "upstream");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new DeepLError("Could not load DeepL languages.", "upstream");
  const data: unknown = await response.json().catch(() => null);
  if (!Array.isArray(data)) throw new DeepLError("Could not load DeepL languages.", "upstream");
  return data.filter((item: DeepLLanguage) =>
    item?.usable_as_target === true && item.status === "stable"
    && typeof item.lang === "string" && typeof item.name === "string"
    && !/^en(?:-|$)/i.test(item.lang)
  ).map((item: DeepLLanguage) => ({ code: item.lang as string, name: item.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export async function translateEnglishToNativeLanguage(
  texts: string[],
  context = "",
  options: { request?: Request } = {},
): Promise<string[]> {
  const cleaned = texts.map(cleanTranslationText).filter(Boolean);
  if (!cleaned.length) return [];

  const user = options.request ? getAuthenticatedUser(options.request) : null;
  const apiKey = await deeplApiKey(user?.subject);
  const targetLanguage = user ? await getNativeLanguage(user.subject) : DEFAULT_NATIVE_LANGUAGE;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEPL_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(deeplEndpoint(apiKey, "/v2/translate"), {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleaned,
        source_lang: "EN",
        target_lang: targetLanguage,
        ...(cleanTranslationText(context) ? { context: cleanTranslationText(context) } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "DeepL did not respond in time."
      : "DeepL is temporarily unavailable.";
    throw new DeepLError(message, "upstream");
  } finally {
    clearTimeout(timeout);
  }

  const data = (await response.json().catch(() => null)) as TranslationResponse | null;
  if (!response.ok) {
    const message = data?.message || `DeepL returned HTTP ${response.status}`;
    throw new DeepLError(message, "upstream");
  }

  const translations = (data?.translations || []).map((item) => cleanTranslationText(item.text));
  if (translations.length !== cleaned.length || translations.some((item) => !item)) {
    throw new DeepLError("DeepL returned an empty translation.", "empty");
  }
  return translations;
}
