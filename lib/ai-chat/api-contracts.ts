import {
  AI_CHAT_LIMITS,
  AI_CHAT_TITLE_MAX_CHARACTERS,
  hasSameOrigin,
  readAiChatTarget,
  readBoundedJsonObject,
  readBoundedText,
  type AiChatErrorCode,
  type AiChatTargetInput,
  type AiChatValidationResult,
} from "./contracts.ts";

type ObjectValue = Record<string, unknown>;

function hasExactKeys(value: ObjectValue, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function invalidRequest<Value>(): AiChatValidationResult<Value> {
  return { ok: false, error: { code: "invalid_request", status: 400 } };
}

function readTargets(value: unknown): AiChatValidationResult<AiChatTargetInput[]> {
  if (!Array.isArray(value)) return invalidRequest();
  if (value.length > AI_CHAT_LIMITS.targetCount) {
    return { ok: false, error: { code: "target_limit", status: 400 } };
  }

  const targets: AiChatTargetInput[] = [];
  for (const candidate of value) {
    const target = readAiChatTarget(candidate);
    if (!target.ok) return target;
    targets.push(target.value);
  }
  return { ok: true, value: targets };
}

export function readCreateChatPayload(
  payload: ObjectValue,
): AiChatValidationResult<{ targets: AiChatTargetInput[] }> {
  if (!hasExactKeys(payload, ["targets"])) return invalidRequest();
  if (payload.targets === undefined) return { ok: true, value: { targets: [] } };
  const targets = readTargets(payload.targets);
  return targets.ok ? { ok: true, value: { targets: targets.value } } : targets;
}

export function readReplaceTargetsPayload(
  payload: ObjectValue,
): AiChatValidationResult<{ targets: AiChatTargetInput[] }> {
  if (!hasExactKeys(payload, ["targets"]) || payload.targets === undefined) {
    return invalidRequest();
  }
  const targets = readTargets(payload.targets);
  return targets.ok ? { ok: true, value: { targets: targets.value } } : targets;
}

export function readRenameChatPayload(
  payload: ObjectValue,
): AiChatValidationResult<{ title: string }> {
  if (!hasExactKeys(payload, ["title"])) return invalidRequest();
  const title = readBoundedText(payload.title, AI_CHAT_TITLE_MAX_CHARACTERS, {
    singleLine: true,
  });
  return title.ok ? { ok: true, value: { title: title.value } } : title;
}

export function readGenerateMessagePayload(
  payload: ObjectValue,
): AiChatValidationResult<{ clientMessageId: string; content: string }> {
  if (!hasExactKeys(payload, ["clientMessageId", "content"])) return invalidRequest();
  const clientMessageId = readBoundedText(payload.clientMessageId, 120, { singleLine: true });
  const content = readBoundedText(payload.content, AI_CHAT_LIMITS.messageCharacters);
  if (!clientMessageId.ok || !content.ok) return invalidRequest();
  return {
    ok: true,
    value: { clientMessageId: clientMessageId.value, content: content.value },
  };
}

export function readCreateMeaningPayload(
  payload: ObjectValue,
): AiChatValidationResult<{ phraseId: string; translation: string; context: string }> {
  if (!hasExactKeys(payload, ["phraseId", "translation", "context"])) {
    return invalidRequest();
  }
  const phraseId = readBoundedText(payload.phraseId, 120, { singleLine: true });
  const translation = readBoundedText(payload.translation, AI_CHAT_LIMITS.meaningCharacters, {
    singleLine: true,
  });
  const context = payload.context === undefined
    || (typeof payload.context === "string" && !payload.context.trim())
    ? { ok: true as const, value: "" }
    : readBoundedText(payload.context, AI_CHAT_LIMITS.contextCharacters, { singleLine: true });
  if (!phraseId.ok || !translation.ok || !context.ok) return invalidRequest();
  return {
    ok: true,
    value: {
      phraseId: phraseId.value,
      translation: translation.value,
      context: context.value,
    },
  };
}

export function readWriteProposalDecisionPayload(
  payload: ObjectValue,
): AiChatValidationResult<{ decision: "confirm" | "cancel" }> {
  if (!hasExactKeys(payload, ["decision"])) return invalidRequest();
  if (payload.decision !== "confirm" && payload.decision !== "cancel") {
    return invalidRequest();
  }
  return { ok: true, value: { decision: payload.decision } };
}

export function readCancelTurnPayload(
  payload: ObjectValue,
): AiChatValidationResult<Record<string, never>> {
  return hasExactKeys(payload, [])
    ? { ok: true, value: {} }
    : invalidRequest();
}

export function aiChatErrorResponse(error: { code: AiChatErrorCode; status: number }) {
  return Response.json(
    { error: { code: error.code } },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readAiMutationPayload<Value>(
  request: Request,
  parse: (payload: ObjectValue) => AiChatValidationResult<Value>,
): Promise<AiChatValidationResult<Value>> {
  if (!hasSameOrigin(request)) {
    return { ok: false, error: { code: "invalid_origin", status: 403 } };
  }
  const body = await readBoundedJsonObject(request);
  return body.ok ? parse(body.value) : body;
}
