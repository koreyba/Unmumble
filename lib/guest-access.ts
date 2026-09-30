const publicAssetPaths = new Set([
  "/caption-navigation.js",
  "/feedback-widget.css",
  "/feedback-widget.js",
  "/youglish-video-restore.js",
  "/video-progress-sync.js",
  "/favicon.svg",
  "/file.svg",
  "/globe.svg",
  "/og.png",
  "/og-dark.png",
  "/window.svg",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
]);

const publicLoginReturnPaths = new Set([
  "/",
  "/library",
  "/library/",
  "/practice",
  "/practice/",
  "/chat",
  "/chat/",
  "/trainer",
  "/trainer/",
  "/trainer.html",
  "/videos",
  "/videos/",
  "/integrations",
  "/integrations/",
  "/settings",
  "/settings/",
]);

export function isPublicGuestRequest(request: Request) {
  const pathname = new URL(request.url).pathname;
  if (request.method === "POST" && pathname === "/api/feedback") return true;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (
    pathname === "/"
    || pathname === "/library"
    || pathname === "/library/"
    || pathname === "/trainer"
    || pathname === "/trainer/"
    || pathname === "/trainer.html"
    || pathname === "/practice"
    || pathname === "/practice/"
    || pathname === "/chat"
    || pathname === "/chat/"
    || pathname === "/videos"
    || pathname === "/videos/"
    || pathname === "/settings"
    || pathname === "/settings/"
    || pathname === "/integrations"
    || pathname === "/integrations/"
    || pathname === "/logout"
    || pathname === "/api/session"
    || pathname === "/api/catalog"
    || publicAssetPaths.has(pathname)
  ) return true;
  if (pathname.startsWith("/_next/")) return true;
  return pathname === "/api/tatoeba" || pathname.startsWith("/api/tatoeba/");
}

export function guestLoginRedirect(request: Request) {
  const requestUrl = new URL(request.url);
  const requested = requestUrl.searchParams.get("returnTo") || "/library";
  let target = new URL("/library", requestUrl);
  const requestedPath = requested.split(/[?#]/, 1)[0];
  const hasDotSegment = requestedPath.split("/").some((segment) => segment === "." || segment === "..");

  if (
    requested.length <= 2_000
    && requested.startsWith("/")
    && !requested.startsWith("//")
    && !hasDotSegment
  ) {
    try {
      const candidate = new URL(requested, requestUrl);
      if (candidate.origin === requestUrl.origin && publicLoginReturnPaths.has(candidate.pathname)) {
        target = candidate;
      }
    } catch {
      // Invalid or hostile return targets use the public home page.
    }
  }

  target.searchParams.set("signedIn", "1");
  return target;
}
