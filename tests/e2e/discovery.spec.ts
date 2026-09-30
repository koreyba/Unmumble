import { expect, test } from "@playwright/test";

test("crawler documents are readable without an account", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(robots.headers()["content-type"]).toContain("text/plain");
  expect(await robots.text()).toContain("Sitemap: https://unmumble.online/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()["content-type"]).toContain("xml");
  expect(await sitemap.text()).toContain("<loc>https://unmumble.online/library</loc>");

  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toMatch(/^# Unmumble\n/);

  for (const path of ["/robots.txt", "/sitemap.xml", "/llms.txt"]) {
    const head = await request.head(path);
    expect(head.status()).toBe(200);
    expect(await head.body()).toHaveLength(0);
  }
});

test("missing pages return a real 404 with a usable home link", async ({ page, request }) => {
  for (const path of ["/seo-audit-missing-page", "/library/missing-page", "/missing-image.png"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(response.headers()["x-robots-tag"]).toBe("noindex");
    const head = await request.head(path);
    expect(head.status()).toBe(404);
    expect(await head.body()).toHaveLength(0);
  }
  const response = await page.goto("/seo-audit-missing-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:4173/");
});

test("404 routing preserves authentication for account APIs and login", async ({ request }) => {
  for (const path of ["/api/phrases", "/api/me", "/api/settings/native-language", "/api/missing", "/login"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect((await request.post("/api/phrases", { data: {} })).status()).toBe(401);
});
