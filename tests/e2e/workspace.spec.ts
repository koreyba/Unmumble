import { expect, test, type Page } from "@playwright/test";
import { stubCatalog } from "./helpers/catalog";

async function addFirstCatalogPhrase(page: Page) {
  await page.goto("/library");
  await expect(page.locator(".phrase-row").first()).toBeVisible();
  await page.locator(".phrase-row--catalog").first().getByRole("button", { name: "Add to Learn" }).click();
  await expect(page.locator(".phrase-row__added")).toHaveCount(1);
}

test.describe("Library and Practice workspace (guest)", () => {
  test.beforeEach(async ({ page }) => {
    await stubCatalog(page);
  });

  test("a saved phrase is marked in the catalog and Practice opens on the queue that has it", async ({ page }) => {
    await addFirstCatalogPhrase(page);

    await page.goto("/practice");
    await expect(page.locator(".phrase-row")).toHaveCount(1);
    // "Learning Now" is empty, so Practice must not open on a blank state.
    await expect(page.getByRole("tab", { selected: true })).toContainText("To Learn");
  });

  test("a phrase moves through the queues and custom phrases can be added", async ({ page, isMobile }) => {
    await addFirstCatalogPhrase(page);
    await page.goto("/practice");
    const row = page.locator(".phrase-row").first();

    if (isMobile) {
      await row.getByRole("button", { name: "Options" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Move to Learning Now" }).click();
    } else {
      await row.getByRole("button", { name: "Move to Learning Now" }).click();
    }
    await expect(page.locator(".phrase-row")).toHaveCount(0);

    await page.getByRole("tab", { name: /Learning Now/ }).click();
    await expect(page.locator(".phrase-row.is-highlighted")).toHaveCount(1);

    await page.locator("#practice-search-input").fill("gonna wanna");
    await page.getByRole("button", { name: "To Learn", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Phrase added" })).toBeVisible();
    await expect(page.getByRole("tab", { selected: true })).toContainText("To Learn");
    await expect(page.locator(".phrase-row", { hasText: "gonna wanna" })).toBeVisible();
  });

  test("filters narrow the catalog; on small screens they live in a sheet that Escape closes", async ({ page, isMobile }) => {
    await page.goto("/library");
    const rows = page.locator(".phrase-row");
    await expect(rows.first()).toBeVisible();
    const all = await rows.count();

    if (isMobile) {
      const trigger = page.getByRole("button", { name: /Open filters/ });
      await trigger.click();
      const sheet = page.getByRole("dialog", { name: "Filters" });
      await expect(sheet).toBeVisible();
      await sheet.locator(".filter-option__label", { hasText: "Elision" }).click();
      await expect(sheet.locator("#filter-sheet-sort")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
    } else {
      await page.locator(".workspace-sidebar .filter-option__label", { hasText: "Elision" }).click();
    }
    expect(await rows.count()).toBeLessThan(all);
  });

  test("filter counts always match the cards listed, even after adding phrases", async ({ page, isMobile }) => {
    await page.goto("/library");
    const rows = page.locator(".phrase-row");
    await expect(rows.first()).toBeVisible();

    // The counts live in the sidebar on desktop and in the filter sheet on phones.
    const readCounts = async () => {
      const trigger = page.getByRole("button", { name: /Open filters/ });
      if (isMobile) await trigger.click();
      const panel = isMobile ? page.getByRole("dialog", { name: "Filters" }) : page.locator(".workspace-sidebar");
      const format = Number(await panel.locator(".filter-option.is-active .filter-option__count").first().innerText());
      const elision = Number(await panel.locator(".filter-option--mechanism", { hasText: "Elision" }).locator(".filter-option__count").innerText());
      if (isMobile) {
        await page.keyboard.press("Escape");
        await expect(panel).toHaveCount(0);
      }
      return { format, elision };
    };

    const before = await readCounts();
    expect(before.format).toBe(await rows.count());
    await expect(page.locator(".catalog-group", { hasText: "Elision" }).first().locator(".phrase-row")).toHaveCount(before.elision);

    await page.locator(".phrase-row--catalog").first().getByRole("button", { name: "Add to Learn" }).click();
    await expect(page.locator(".phrase-row__added")).toHaveCount(1);
    const after = await readCounts();
    expect(after).toEqual(before);
    expect(after.format).toBe(await rows.count());
  });

  test("mechanism explanations open in a popover and close with Escape", async ({ page }) => {
    await page.goto("/library");
    await page.locator(".catalog-group__header .ui-help__trigger").first().click();
    const popover = page.locator(".ui-help__panel");
    await expect(popover).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
  });

  test("the play button opens the trainer with the phrase", async ({ page }) => {
    await page.goto("/library");
    await page.locator(".phrase-row__play").first().click();
    await expect(page).toHaveURL(/\/trainer\?phrase=/);
  });
});
