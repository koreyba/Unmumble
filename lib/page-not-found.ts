import { isPublicGuestRequest } from "./guest-access.ts";

// Keep the explicit public allowlist: unknown URLs must never reach account handlers.
export function isMissingPageRequest(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = new URL(request.url).pathname;
  return pathname !== "/login"
    && pathname !== "/api"
    && !pathname.startsWith("/api/")
    && !isPublicGuestRequest(request);
}

// Self-contained so an error page still works without JS, assets or a database session.
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="color-scheme" content="light dark">
  <title>Page not found — Unmumble</title>
  <link rel="icon" href="/favicon.svg?v=8" type="image/svg+xml">
  <style>
    :root { color-scheme: light dark; --bg: #f5f3ec; --text: #192127; --muted: #58646d; --brand: #985137; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0d1116; --text: #f3f5f2; --muted: #b5bec8; --brand: #dd9876; } }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100svh; display: grid; place-items: center; background: var(--bg); color: var(--text); font-family: "Avenir Next", Avenir, system-ui, sans-serif; }
    main { width: min(100%, 640px); padding: 48px 24px; text-align: center; }
    .brand { font-size: 28px; font-weight: 750; letter-spacing: -1px; }
    .brand span { color: var(--brand); }
    .code { margin: 48px 0 8px; color: var(--brand); font-size: clamp(72px, 18vw, 112px); font-weight: 750; line-height: 1; letter-spacing: -5px; }
    h1 { margin: 16px 0; font-size: clamp(28px, 6vw, 40px); letter-spacing: -1px; }
    p { margin: 0 auto; max-width: 34ch; color: var(--muted); font-size: 18px; line-height: 1.6; }
    a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; margin-top: 28px; padding: 12px 24px; border: 1px solid var(--brand); border-radius: 12px; color: var(--brand); font-weight: 650; text-decoration: none; }
    a:hover { text-decoration: underline; }
    a:focus-visible { outline: 3px solid var(--brand); outline-offset: 4px; }
  </style>
</head>
<body>
  <main>
    <div class="brand"><span>Un</span>mumble</div>
    <div class="code" aria-hidden="true">404</div>
    <h1>Page not found</h1>
    <p>This page doesn't exist. Head back home to keep learning.</p>
    <a href="/">Back to home</a>
  </main>
</body>
</html>`;

export function pageNotFoundResponse(request: Request) {
  return new Response(request.method === "HEAD" ? null : html, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
