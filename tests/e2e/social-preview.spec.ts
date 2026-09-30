import { expect, test } from "@playwright/test";

test("shared links expose the chosen image in initial HTML for crawlers", async ({ request }) => {
  for (const [path, filename] of [
    ["/", "og.png"],
    ["/?preview=dark", "og-dark.png"],
    ["/?preview=unknown", "og.png"],
    ["/videos", "og.png"],
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    for (const attribute of ['property="og:image"', 'name="twitter:image"']) {
      expect(html).toContain(`<meta ${attribute} content="https://unmumble.online/${filename}?v=2"`);
    }
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
  }
  for (const filename of ["og.png", "og-dark.png"]) {
    const response = await request.get(`/${filename}?v=2`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});

test("trainer and video pages declare the same loadable favicon", async ({ request }) => {
  for (const path of ["/videos", "/trainer?phrase=hello", "/trainer.html?phrase=hello"]) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('rel="icon" href="/favicon.svg?v=8" type="image/svg+xml"');
  }
  const icon = await request.get("/favicon.svg?v=8");
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
});
