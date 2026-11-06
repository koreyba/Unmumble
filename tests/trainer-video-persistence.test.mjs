import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readVideosSource } from "./helpers/sources.mjs";

test("signed-in trainer mirrors progress locally and throttles D1 writes", async () => {
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");

  assert.match(trainer, /YOUTUBE_PROGRESS_STORAGE_KEY = "unmumble-youtube-progress-v1:" \+ encodeURIComponent\(sessionUser\.id\)/);
  assert.match(trainer, /LEGACY_YOUTUBE_PROGRESS_STORAGE_KEYS = \[\s*"listen-to-learn-youtube-progress-v1:" \+ encodeURIComponent\(sessionUser\.id\),\s*"listen-to-learn-youtube-progress-v1"\s*\]/);
  assert.match(trainer, /accountVideoProgressSync = window\.ListenToLearnVideoProgressSync\.create/);
  assert.match(trainer, /intervalMs: 15_000/);
  assert.match(trainer, /const payload = snapshot\.progress[\s\S]*?\{ \.\.\.snapshot\.origin, progress: snapshot\.progress \}/);
  assert.match(trainer, /body: JSON\.stringify\(payload\)/);
  assert.match(trainer, /keepalive: options\.keepalive/);
  assert.match(trainer, /accountVideoProgressSync\.update/);
});

test("trainer sends initial resume metadata and flushes changed progress on pause and page exit", async () => {
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");

  assert.match(trainer, /recordCurrentVideoHistory\(origin, progress\)/);
  assert.match(trainer, /restoreQuery: fullVideoOrigin\.restoreQuery/);
  assert.match(trainer, /const matchedRestoreQuery = youglishVideoRestore[\s\S]*?extractRestoreQuery\(nextCaptionRaw\)/);
  assert.match(trainer, /restoreQuery: currentYouglishRestoreQuery/);
  assert.match(trainer, /persistFullVideoProgress\(\{ flush: true \}\)/);
  assert.match(trainer, /pagehide[\s\S]*?persistFullVideoProgress\(\{ flush: true, keepalive: true \}\)/);
  assert.match(trainer, /accountVideoProgressSync\.flush\(\{ keepalive: Boolean\(options\.keepalive\) \}\)/);
  assert.match(trainer, /JSON\.stringify\(progress \? \{ \.\.\.origin, progress \} : origin\)/);
});

test("Videos uses D1 progress for accounts and anonymous local progress for guests", async () => {
  const page = await readVideosSource();

  assert.match(page, /youtubeProgressStorageKey\(sessionUser\.id\)/);
  assert.match(page, /video\.progress/);
  assert.match(page, /mergeYouTubeProgress/);
  assert.match(page, /youtubeProgressStorageKey\(null\)/);
});
