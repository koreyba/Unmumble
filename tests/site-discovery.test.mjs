import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";
import { isPublicGuestRequest } from "../lib/guest-access.ts";
import { isMissingPageRequest, pageNotFoundResponse } from "../lib/page-not-found.ts";

const request = (path, method = "GET") => new Request(`https://unmumble.online${path}`, { method });

test("missing-page routing cannot replace authentication or valid public routes", () => {
  for (const method of ["GET", "HEAD"]) {
    for (const path of ["/missing", "/library/missing", "/missing.svg", "/.env"]) {
      assert.equal(isMissingPageRequest(request(path, method)), true, `${method} ${path}`);
    }
    for (const path of ["/", "/library", "/trainer", "/robots.txt", "/sitemap.xml", "/llms.txt", "/login", "/api", "/api/phrases", "/api/missing"]) {
      assert.equal(isMissingPageRequest(request(path, method)), false, `${method} ${path}`);
    }
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal(isMissingPageRequest(request("/missing", method)), false, method);
  }
});

test("error responses do not reflect user input, set cookies or require JS", async () => {
  const response = pageNotFoundResponse(request("/missing?q=%3Cscript%3E"));
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");
  assert.equal(response.headers.has("set-cookie"), false);
  const document = new JSDOM(await response.text()).window.document;
  assert.equal(document.querySelector("h1").textContent, "Page not found");
  assert.equal(document.querySelector("a").getAttribute("href"), "/");
  assert.equal(document.querySelector("script"), null);
  assert.equal(await pageNotFoundResponse(request("/missing", "HEAD")).text(), "");
});

test("discovery files allow read-only guest access and list canonical public pages", async () => {
  for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
    assert.equal(isPublicGuestRequest(request(path)), true, path);
    assert.equal(isPublicGuestRequest(request(path, "HEAD")), true, path);
    assert.equal(isPublicGuestRequest(request(path, "POST")), false, path);
  }
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
  const document = new JSDOM(sitemap, { contentType: "application/xml" }).window.document;
  assert.equal(document.documentElement.namespaceURI, "http://www.sitemaps.org/schemas/sitemap/0.9");
  assert.deepEqual([...document.querySelectorAll("loc")].map((loc) => loc.textContent), [
    "https://unmumble.online/", "https://unmumble.online/library",
  ]);
  const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Disallow: \/api\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/unmumble\.online\/sitemap\.xml$/m);
});
