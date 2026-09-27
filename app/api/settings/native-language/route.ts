import { getCurrentUser, unauthorizedResponse } from "@/lib/auth";
import { DeepLError, listDeeplTargetLanguages } from "@/lib/deepl";
import { getNativeLanguage, setNativeLanguage } from "@/lib/native-language";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthorizedResponse();
  try {
    const nativeLanguage = await getNativeLanguage(user.subject);
    const languages = await listDeeplTargetLanguages(user.subject);
    return noStore({ nativeLanguage, languages });
  } catch (error) {
    if (error instanceof DeepLError && error.code === "not_configured") {
      return noStore({ nativeLanguage: await getNativeLanguage(user.subject), languages: [] });
    }
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
    const body = await request.text();
    if (body.length > 1000) return noStore({ error: "The request is too large." }, 413);
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
