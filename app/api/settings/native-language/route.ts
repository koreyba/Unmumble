import { getCurrentUser, unauthorizedResponse } from "@/lib/auth";
import { DeepLError, listDeeplTargetLanguages } from "@/lib/deepl";
import { getNativeLanguage, setNativeLanguage } from "@/lib/native-language";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

async function readBoundedBody(request: Request) {
  const limit = 1_000;
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (declaredLength > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const bytes = new Uint8Array(limit);
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.byteLength > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    bytes.set(value, length);
    length += value.byteLength;
  }
  return new TextDecoder().decode(bytes.subarray(0, length));
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const nativeLanguage = await getNativeLanguage(user.subject);
    const languages = await listDeeplTargetLanguages(user.subject).catch((error) => {
      if (error instanceof DeepLError) {
        if (error.code !== "not_configured") console.error("Native language list failed:", error);
        return [];
      }
      throw error;
    });
    return noStore({ nativeLanguage, languages });
  } catch (error) {
    console.error("Native language GET failed:", error);
    return noStore({ error: "Could not load available languages." }, 502);
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  try {
    if (request.headers.get("Origin") !== new URL(request.url).origin) {
      return noStore({ error: "Invalid request origin." }, 403);
    }
    const body = await readBoundedBody(request);
    if (body === null) return noStore({ error: "The request is too large." }, 413);
    const payload = JSON.parse(body) as { nativeLanguage?: unknown };
    if (!payload || typeof payload !== "object" || typeof payload.nativeLanguage !== "string") {
      return noStore({ error: "Choose a language." }, 400);
    }
    const requestedLanguage = payload.nativeLanguage.toLowerCase();
    const languages = await listDeeplTargetLanguages(user.subject);
    const selected = languages.find((language) => language.code.toLowerCase() === requestedLanguage);
    if (!selected) return noStore({ error: "Choose a supported DeepL language." }, 400);
    await setNativeLanguage(user.subject, selected.code);
    return noStore({ nativeLanguage: selected.code });
  } catch (error) {
    if (error instanceof SyntaxError) return noStore({ error: "Invalid request." }, 400);
    if (error instanceof DeepLError) {
      return noStore({ error: error.message }, error.code === "not_configured" ? 503 : 502);
    }
    console.error("Native language PUT failed:", error);
    return noStore({ error: "Could not save native language." }, 502);
  }
}
