export const AI_CHAT_GENERATION_TIMEOUT = Object.freeze({
  firstChunkMs: 20_000,
  chunkMs: 20_000,
  toolMs: 5_000,
});

export const AI_CHAT_LIMITS = Object.freeze({
  bodyBytes: 16_384,
  targetCount: 12,
  targetTextCharacters: 240,
  meaningsPerTarget: 12,
  meaningCharacters: 1_000,
  contextCharacters: 1_000,
  promptMeaningCharacters: 100,
  promptContextCharacters: 160,
  targetPromptCharacters: 48_000,
  messageCharacters: 4_000,
  historyMessages: 40,
  historyCharacters: 32_000,
  outputTokens: 2_400,
});

/** Longest chat title a person may set when renaming (derived titles are shorter). */
export const AI_CHAT_TITLE_MAX_CHARACTERS = 100;

export const AI_CHAT_MEANING_MODES = ["all_saved", "selected", "explore"] as const;

export type AiChatMeaningMode = (typeof AI_CHAT_MEANING_MODES)[number];

export const AI_CHAT_ERROR_CODES = Object.freeze({
  invalidOrigin: "invalid_origin",
  invalidJson: "invalid_json",
  requestTooLarge: "request_too_large",
  invalidRequest: "invalid_request",
  invalidField: "invalid_field",
  fieldTooLong: "field_too_long",
  invalidTarget: "invalid_target",
  targetLimit: "target_limit",
  notFound: "not_found",
  conflict: "conflict",
  turnInProgress: "turn_in_progress",
  notConfigured: "not_configured",
  generationInterrupted: "generation_interrupted",
  toolTimeout: "tool_timeout",
  toolFailed: "tool_failed",
  toolBudgetExceeded: "tool_budget_exceeded",
  providerTimeout: "provider_timeout",
  providerRateLimited: "provider_rate_limited",
  providerFailed: "provider_failed",
  responseIncomplete: "response_incomplete",
  generationCancelled: "generation_cancelled",
  emptyResponse: "empty_response",
  internalError: "internal_error",
} as const);

export type AiChatErrorCode =
  (typeof AI_CHAT_ERROR_CODES)[keyof typeof AI_CHAT_ERROR_CODES];

export type AiChatValidationResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: { code: AiChatErrorCode; status: number } };

export type AiChatTargetInput =
  | {
      source: "saved";
      phraseId: string;
      meaningMode: AiChatMeaningMode;
      selectedMeaningId?: string;
    }
  | {
      source: "ad_hoc";
      text: string;
      meaningMode: Exclude<AiChatMeaningMode, "selected">;
    };

export function isMeaningMode(value: unknown): value is AiChatMeaningMode {
  return typeof value === "string"
    && (AI_CHAT_MEANING_MODES as readonly string[]).includes(value);
}

export function normalizeMeaning(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase()
    : "";
}

export function readBoundedText(
  value: unknown,
  maxCharacters: number,
  options: { singleLine?: boolean } = {},
): AiChatValidationResult<string> {
  if (typeof value !== "string") {
    return { ok: false, error: { code: "invalid_field", status: 400 } };
  }
  const cleaned = options.singleLine
    ? value.trim().replace(/\s+/gu, " ")
    : value.trim().replace(/\r\n?/gu, "\n");
  if (!cleaned) {
    return { ok: false, error: { code: "invalid_field", status: 400 } };
  }
  if ([...cleaned].length > maxCharacters) {
    return { ok: false, error: { code: "field_too_long", status: 400 } };
  }
  return { ok: true, value: cleaned };
}

export function hasSameOrigin(request: Request): boolean {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

export async function readBoundedJsonObject(
  request: Request,
  maxBytes = AI_CHAT_LIMITS.bodyBytes,
): Promise<AiChatValidationResult<Record<string, unknown>>> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return { ok: false, error: { code: "request_too_large", status: 413 } };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, error: { code: "invalid_json", status: 400 } };

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The size verdict is already known; cancellation is best-effort cleanup.
      }
      return { ok: false, error: { code: "request_too_large", status: 413 } };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const parsed = JSON.parse(decoded) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("JSON body must be an object");
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: { code: "invalid_json", status: 400 } };
  }
}

export function readAiChatTarget(value: unknown): AiChatValidationResult<AiChatTargetInput> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: { code: "invalid_target", status: 400 } };
  }
  const input = value as Record<string, unknown>;
  const hasPhraseId = input.phraseId !== undefined;
  const hasText = input.text !== undefined;
  if (hasPhraseId === hasText) {
    return { ok: false, error: { code: "invalid_target", status: 400 } };
  }

  const meaningMode = input.meaningMode === undefined ? "all_saved" : input.meaningMode;
  if (!isMeaningMode(meaningMode)) {
    return { ok: false, error: { code: "invalid_target", status: 400 } };
  }

  if (hasPhraseId) {
    const phraseId = readBoundedText(input.phraseId, 120, { singleLine: true });
    if (!phraseId.ok) {
      return { ok: false, error: { code: "invalid_target", status: 400 } };
    }
    if (meaningMode === "selected") {
      const meaningId = readBoundedText(input.selectedMeaningId, 120, { singleLine: true });
      if (!meaningId.ok) {
        return { ok: false, error: { code: "invalid_target", status: 400 } };
      }
      return {
        ok: true,
        value: {
          source: "saved",
          phraseId: phraseId.value,
          meaningMode,
          selectedMeaningId: meaningId.value,
        },
      };
    }
    if (input.selectedMeaningId !== undefined) {
      return { ok: false, error: { code: "invalid_target", status: 400 } };
    }
    return {
      ok: true,
      value: { source: "saved", phraseId: phraseId.value, meaningMode },
    };
  }

  if (meaningMode === "selected" || input.selectedMeaningId !== undefined) {
    return { ok: false, error: { code: "invalid_target", status: 400 } };
  }
  const text = readBoundedText(input.text, AI_CHAT_LIMITS.targetTextCharacters, { singleLine: true });
  if (!text.ok) {
    return { ok: false, error: { code: "invalid_target", status: 400 } };
  }
  return { ok: true, value: { source: "ad_hoc", text: text.value, meaningMode } };
}
