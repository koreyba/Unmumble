import { expect, test } from "@playwright/test";

const pages = [
  { path: "/library", label: "Library", heading: "Train connected speech." },
  { path: "/practice", label: "Practice", heading: "Train connected speech." },
  { path: "/chat", label: "AI Chat", heading: "Turn words into conversation" },
  { path: "/videos", label: "Videos", heading: "Videos" },
  { path: "/settings", label: "Settings", heading: "Settings" },
];

test.describe("site navigation", () => {
  for (const { path, label, heading } of pages) {
    test(`${path} opens its own page without runtime errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
      });

      await page.goto(path);
      // The chat intro is hidden on phones, so assert the heading is in the document rather than visible.
      await expect(page.locator("h1", { hasText: heading })).toBeAttached();
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
      expect(errors).toEqual([]);
    });
  }

  test("primary navigation moves between sections", async ({ page }) => {
    await page.goto("/library");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    await expect(nav).toBeVisible();

    await nav.getByRole("link", { name: "Practice" }).click();
    await expect(page).toHaveURL(/\/practice$/);
    await nav.getByRole("link", { name: "Videos" }).click();
    await expect(page).toHaveURL(/\/videos$/);
  });

  test("the tab bar is docked to the bottom on phones and stays on top on desktop", async ({ page, isMobile }) => {
    await page.goto("/library");
    const nav = page.getByRole("navigation", { name: "Primary navigation" });
    const box = await nav.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    if (isMobile) {
      expect(box!.y + box!.height).toBeGreaterThan(viewport!.height - 4);
      await expect(nav.locator(".site-primary-link-icon").first()).toBeVisible();
    } else {
      expect(box!.y).toBeLessThan(120);
      await expect(nav.locator(".site-primary-link-icon").first()).toBeHidden();
    }
  });

  test("the theme switch flips the palette and remembers the choice", async ({ page }) => {
    await page.goto("/library");
    const root = page.locator("html");
    const toggle = page.getByRole("button", { name: /Switch to (light|dark) theme/ });
    const before = await root.getAttribute("data-theme");

    await toggle.click();
    const after = await root.getAttribute("data-theme");
    expect(after).not.toBe(before);

    await page.reload();
    await expect(root).toHaveAttribute("data-theme", after!);
  });
});
