import { expect, test } from "@playwright/test";

test("Settings searches DeepL languages and saves the native language", async ({ page }) => {
  let nativeLanguage = "ru";
  let languagesAvailable = true;
  await page.route("**/api/session", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-1", email: "learner@example.com", name: "Learner" } }),
  }));
  await page.route("**/api/integrations", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ integrations: [{ provider: "deepl", label: "DeepL", configured: true, source: "default" }] }),
  }));
  await page.route("**/api/settings/native-language", (route) => {
    if (route.request().method() === "PUT") {
      nativeLanguage = route.request().postDataJSON().nativeLanguage;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ nativeLanguage }) });
    }
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ nativeLanguage, languages: languagesAvailable ? [
        { code: "de", name: "German" },
        { code: "ru", name: "Russian" },
        { code: "uk", name: "Ukrainian" },
      ] : [] }),
    });
  });

  await page.goto("/settings");
  const search = page.getByRole("combobox", { name: "Native Language" });
  await expect(search).toHaveValue("Russian");
  await search.click();
  await search.fill("uk");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("option", { name: "Ukrainian UK" }).click();
  await expect(search).toHaveValue("Ukrainian");
  await expect(page.getByText("Native language saved. New translations will use it.")).toBeVisible();
  expect(nativeLanguage).toBe("uk");
  await search.click();
  await search.fill("de");
  await search.press("Shift+Tab");
  await expect(page.getByRole("listbox", { name: "DeepL target languages" })).toHaveCount(0);
  await expect(search).toHaveValue("Ukrainian");
  languagesAvailable = false;
  await page.reload();
  await expect(search).toHaveValue("uk");
  await expect(search).toBeDisabled();
  await expect(page.getByText("DeepL languages are temporarily unavailable.")).toBeVisible();
});

test("Removing the only DeepL key clears the available languages", async ({ page }) => {
  let keyConfigured = true;
  await page.route("**/api/session", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ user: { id: "user-1", email: "learner@example.com", name: "Learner" } }),
  }));
  await page.route("**/api/integrations**", (route) => {
    if (route.request().method() === "DELETE") keyConfigured = false;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ integrations: [{ provider: "deepl", label: "DeepL", configured: keyConfigured, source: keyConfigured ? "integrations" : null }] }),
    });
  });
  await page.route("**/api/settings/native-language", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ nativeLanguage: "ru", languages: keyConfigured ? [{ code: "ru", name: "Russian" }] : [] }),
  }));

  await page.goto("/settings");
  const search = page.getByRole("combobox", { name: "Native Language" });
  await expect(search).toBeEnabled();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(search).toBeDisabled();
  await expect(page.getByText("Connect DeepL to choose a language.")).toBeVisible();
});
