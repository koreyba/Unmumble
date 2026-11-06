import { expect, test } from "@playwright/test";

function savedVideo(id: string, videoId: string, query: string) {
  const now = new Date().toISOString();
  return {
    id,
    videoId,
    originPhraseId: "",
    originQuery: query,
    restoreQuery: query,
    restoreAnchorTime: 4,
    originCaption: `Caption for ${query}`,
    language: "english",
    accent: "us",
    createdAt: now,
    updatedAt: now,
  };
}

test.describe("Videos (guest)", () => {
  test.beforeEach(async ({ page }) => {
    const library = {
      version: 2,
      statuses: {},
      customPhrases: [],
      savedExamples: [],
      savedVideos: [
        savedVideo("v1", "dQw4w9WgXcQ", "gonna wanna"),
        savedVideo("v2", "jNQXAC9IVRw", "kind of"),
      ],
    };
    await page.addInitScript((state) => {
      if (!localStorage.getItem("unmumble-guest-library-v1")) {
        localStorage.setItem("unmumble-guest-library-v1", JSON.stringify(state));
      }
    }, library);
  });

  test("Remove takes effect at once and Undo puts the video back where it was", async ({ page }) => {
    let dialogs = 0;
    page.on("dialog", (dialog) => { dialogs += 1; void dialog.dismiss(); });

    await page.goto("/videos");
    const cards = page.locator(".video-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("gonna wanna");

    await cards.first().getByRole("button", { name: "Remove" }).click();
    await expect(cards).toHaveCount(1);
    await expect(page.getByRole("status").filter({ hasText: "Video removed" })).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("gonna wanna");
    expect(dialogs).toBe(0);

    await page.reload();
    await expect(cards).toHaveCount(2);
  });

  test("each guest removal gets a full Undo window, then expires", async ({ page }) => {
    await page.goto("/videos");
    const cards = page.locator(".video-card");
    await expect(cards).toHaveCount(2);
    await page.clock.install();
    await cards.first().getByRole("button", { name: "Remove" }).click();
    await page.clock.fastForward(6_000);
    await cards.first().getByRole("button", { name: "Remove" }).click();
    await page.clock.fastForward(3_000);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await page.clock.fastForward(5_001);
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
    await expect(cards).toHaveCount(0);
    await page.reload();
    await expect(cards).toHaveCount(0);
  });
});

test.describe("Videos (signed in, stubbed API)", () => {
  test("Undo re-saves a removed video for the account with its resume position", async ({ page }) => {
    type ApiVideo = ReturnType<typeof savedVideo> & { progress: { seconds: number; captionId: string; captionText: string; updatedAt: string } | null };
    const now = new Date().toISOString();
    let stored: ApiVideo[] = [
      { ...savedVideo("a1", "dQw4w9WgXcQ", "gonna wanna"), progress: { seconds: 42, captionId: "c1", captionText: "hi", updatedAt: now } },
      { ...savedVideo("a2", "jNQXAC9IVRw", "kind of"), progress: null },
    ];
    const posted: Array<Record<string, unknown>> = [];

    await page.route("**/api/session", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user: { id: "user-1", email: "learner@example.com", name: "Learner" } }),
    }));
    await page.route("**/api/videos**", async (route) => {
      const request = route.request();
      if (request.method() === "DELETE") {
        const id = new URL(request.url()).searchParams.get("id");
        stored = stored.filter((video) => video.id !== id);
        return route.fulfill({ contentType: "application/json", body: "{}" });
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON() as Record<string, unknown>;
        posted.push(body);
        stored = [{ ...(body as unknown as ApiVideo), id: "a-restored" }, ...stored];
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ video: stored[0] }) });
      }
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ videos: stored }) });
    });

    await page.goto("/videos");
    const cards = page.locator(".video-card");
    await expect(cards).toHaveCount(2);

    await cards.first().getByRole("button", { name: "Remove" }).click();
    await expect(cards).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(cards).toHaveCount(2);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ videoId: "dQw4w9WgXcQ", originQuery: "gonna wanna" });
    expect((posted[0].progress as { seconds: number }).seconds).toBe(42);
  });

  test("failed Undo can be retried without restoring local progress before the server accepts it", async ({ page }) => {
    const video = {
      ...savedVideo("a1", "dQw4w9WgXcQ", "gonna wanna"),
      progress: { seconds: 42, captionId: "c1", captionText: "hi", updatedAt: new Date().toISOString() },
    };
    let attempts = 0;
    let reads = 0;
    await page.route("**/api/session", (route) => route.fulfill({ json: {
      user: { id: "user-1", email: "learner@example.com", name: "Learner" },
    } }));
    await page.route("**/api/videos**", (route) => {
      if (route.request().method() === "DELETE") return route.fulfill({ json: { deleted: true } });
      if (route.request().method() === "POST") {
        attempts += 1;
        return attempts === 1
          ? route.fulfill({ status: 503, json: { error: "Please retry restoring the video." } })
          : route.fulfill({ json: { video: { ...video, id: "restored-id" } } });
      }
      reads += 1;
      return route.fulfill({ json: { videos: [video] } });
    });

    await page.goto("/videos");
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.locator(".video-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Please retry");
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    const localProgress = await page.evaluate(() => JSON.parse(
      localStorage.getItem("unmumble-youtube-progress-v1:user-1") || "null",
    ));
    expect(localProgress.videos.dQw4w9WgXcQ).toBeUndefined();

    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".video-card")).toHaveCount(1);
    await expect(page.locator(".video-card")).toContainText("Resume at 0:42");
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(attempts).toBe(2);
    expect(reads).toBe(1);
  });

  test("pending Undo prevents overlapping removals and survives the notice timeout", async ({ page }) => {
    const video = savedVideo("a1", "dQw4w9WgXcQ", "gonna wanna");
    let finishRestore: (() => void) | undefined;
    await page.route("**/api/session", (route) => route.fulfill({ json: {
      user: { id: "user-1", email: "learner@example.com", name: "Learner" },
    } }));
    await page.route("**/api/videos**", async (route) => {
      if (route.request().method() === "DELETE") return route.fulfill({ json: { deleted: true } });
      if (route.request().method() === "POST") {
        await new Promise<void>((resolve) => { finishRestore = resolve; });
        return route.fulfill({ json: { video: { ...video, id: "restored-id" } } });
      }
      return route.fulfill({ json: { videos: [video, savedVideo("a2", "jNQXAC9IVRw", "kind of")] } });
    });

    await page.goto("/videos");
    await expect(page.locator(".video-card")).toHaveCount(2);
    await page.clock.install();
    await page.locator(".video-card").first().getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect.poll(() => Boolean(finishRestore)).toBe(true);
    try {
      await expect(page.getByRole("button", { name: "Remove", exact: true })).toBeDisabled();
      await page.clock.fastForward(9_000);
      await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
    } finally {
      finishRestore?.();
    }
    await expect(page.locator(".video-card")).toHaveCount(2);
    await expect(page.getByText("Video restored.", { exact: true })).toBeVisible();
  });
});
