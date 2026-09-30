/** Cloudflare Worker entry point for Unmumble. */
import handler from "vinext/server/app-router-entry";
import { createRemoteJWKSet } from "jose";
import { backfillTranslations } from "@/app/api/phrases/route";
import { accessTokenFromRequest, optionalSessionResponse, verifyAccessJwtIdentity } from "@/lib/access-session";
import {
  appSessionCookie,
  clearAppSessionCookies,
  clearLegacySignedOutCookie,
  issueAppSession,
  resolveAppSession,
  revokeAppSession,
} from "@/lib/app-session";
import { ensureUser, migrateLegacyOwnerData } from "@/lib/auth";
import { d1AppSessionStore } from "@/lib/d1-app-sessions";
import { guestLoginRedirect, isPublicGuestRequest } from "@/lib/guest-access";
import { AUTHENTICATED_USER_HEADER, encodeUserContext } from "@/lib/user-context";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const backfillInFlight = new Map<string, Promise<void>>();

const PUBLIC_DOCUMENT_PATHS = new Set([
  "/",
  "/library",
  "/library/",
  "/trainer",
  "/trainer/",
  "/trainer.html",
  "/practice",
  "/practice/",
  "/chat",
  "/chat/",
  "/videos",
  "/videos/",
  "/settings",
  "/settings/",
]);
const PUBLIC_LONG_CACHE_PATHS = new Set([
  "/caption-navigation.js",
  "/feedback-widget.css",
  "/feedback-widget.js",
  "/video-progress-sync.js",
  "/favicon.svg",
  "/file.svg",
  "/globe.svg",
  "/og.png",
  "/og-dark.png",
  "/window.svg",
]);

function accessConfiguration(env: Env) {
  const teamDomain = (env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const audiences = (env.ACCESS_AUD || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!teamDomain || !audiences.length) return null;
  return {
    teamDomain,
    audiences,
    issuer: "https://" + teamDomain,
  };
}

function jwksFor(teamDomain: string) {
  const existing = jwksCache.get(teamDomain);
  if (existing) return existing;
  const jwks = createRemoteJWKSet(new URL("https://" + teamDomain + "/cdn-cgi/access/certs"));
  jwksCache.set(teamDomain, jwks);
  return jwks;
}

async function verifyAccessIdentity(request: Request, env: Env) {
  const token = accessTokenFromRequest(request);
  const config = accessConfiguration(env);
  if (!token || !config) return null;

  try {
    return await verifyAccessJwtIdentity(token, {
      issuer: config.issuer,
      audiences: config.audiences,
      getKey: jwksFor(config.teamDomain),
    });
  } catch (error) {
    console.warn("Access login identity verification failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

function unauthorizedResponse() {
  return Response.json(
    { error: "Sign in with Google to use account features." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

function sessionUnavailableResponse() {
  return Response.json(
    { error: "Could not check the account session." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

function sanitizedHeaders(request: Request) {
  const headers = new Headers(request.headers);
  headers.delete("Cf-Access-Jwt-Assertion");
  headers.delete("Cf-Access-Authenticated-User-Email");
  headers.delete(AUTHENTICATED_USER_HEADER);
  return headers;
}

function publicCacheControl(pathname: string) {
  if (pathname.startsWith("/_next/")) return "public, max-age=31536000, immutable";
  if (PUBLIC_LONG_CACHE_PATHS.has(pathname)) return "public, max-age=86400, stale-while-revalidate=604800";
  if (PUBLIC_DOCUMENT_PATHS.has(pathname)) return "public, max-age=300, stale-while-revalidate=86400";
  return "";
}

function withPublicCache(response: Response, pathname: string) {
  const cacheControl = publicCacheControl(pathname);
  const existingCacheControl = response.headers.get("Cache-Control") || "";
  if (
    !cacheControl
    || !response.ok
    || response.headers.has("Set-Cookie")
    || /(?:^|[, ])(?:private|no-store)(?:[, ]|$)/i.test(existingCacheControl)
    || existingCacheControl === cacheControl
  ) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", cacheControl);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function responseWithCookies(body: object, cookies: string[]) {
  const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json" });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify(body), { headers });
}

function scheduleBackfill(userId: string, request: Request, ctx: ExecutionContext) {
  if (backfillInFlight.has(userId)) return;
  const task = backfillTranslations(userId, request).finally(() => {
    if (backfillInFlight.get(userId) === task) backfillInFlight.delete(userId);
  });
  backfillInFlight.set(userId, task);
  ctx.waitUntil(task);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;
    const headers = sanitizedHeaders(request);
    const sessionStore = d1AppSessionStore(env.DB);

    if (
      (request.method === "GET" || request.method === "HEAD")
      && (pathname === "/integrations" || pathname === "/integrations/")
    ) {
      return Response.redirect(new URL("/settings", requestUrl), 303);
    }

    if (pathname === "/api/logout" && request.method === "POST") {
      try {
        await revokeAppSession(request, sessionStore);
        return responseWithCookies({ signedOut: true }, clearAppSessionCookies());
      } catch (error) {
        console.warn("Application session revocation failed:", error instanceof Error ? error.message : "unknown error");
        return sessionUnavailableResponse();
      }
    }

    if (pathname === "/login") {
      const identity = await verifyAccessIdentity(request, env);
      if (!identity) return unauthorizedResponse();
      try {
        await ensureUser(identity);
        await migrateLegacyOwnerData(identity);
        const issued = await issueAppSession(request, identity, sessionStore);
        const responseHeaders = new Headers({
          "Cache-Control": "no-store",
          Location: guestLoginRedirect(request).toString(),
        });
        responseHeaders.append("Set-Cookie", appSessionCookie(issued.token));
        responseHeaders.append("Set-Cookie", clearLegacySignedOutCookie());
        return new Response(null, { status: 303, headers: responseHeaders });
      } catch (error) {
        console.warn("Application session creation failed:", error instanceof Error ? error.message : "unknown error");
        return sessionUnavailableResponse();
      }
    }

    if (pathname === "/api/session" && (request.method === "GET" || request.method === "HEAD")) {
      try {
        const identity = await resolveAppSession(request, sessionStore);
        if (identity) await migrateLegacyOwnerData(identity);
        const response = optionalSessionResponse(identity);
        if (request.method === "HEAD") {
          return new Response(null, { status: response.status, headers: response.headers });
        }
        return response;
      } catch (error) {
        console.warn("Application session lookup failed:", error instanceof Error ? error.message : "unknown error");
        return sessionUnavailableResponse();
      }
    }

    if (isPublicGuestRequest(request)) {
      const response = await handler.fetch(new Request(request, { headers }), env, ctx);
      return withPublicCache(response, pathname);
    }

    let identity;
    try {
      identity = await resolveAppSession(request, sessionStore);
    } catch (error) {
      console.warn("Application session lookup failed:", error instanceof Error ? error.message : "unknown error");
      return sessionUnavailableResponse();
    }
    if (!identity) {
      if (pathname === "/api/translate" && request.method === "POST") {
        return handler.fetch(new Request(request, { headers }), env, ctx);
      }
      return unauthorizedResponse();
    }

    headers.set(AUTHENTICATED_USER_HEADER, encodeUserContext(identity));
    const forwardedRequest = new Request(request, { headers });
    const response = await handler.fetch(forwardedRequest, env, ctx);
    const searchParams = requestUrl.searchParams;
    if (
      response.ok
      && request.method === "GET"
      && pathname === "/api/phrases"
      && !searchParams.has("id")
      && response.headers.get("X-Unmumble-Backfill") === "1"
    ) {
      scheduleBackfill(identity.subject, forwardedRequest, ctx);
    }
    return response;
  },
} satisfies ExportedHandler<Env>;

export default worker;
