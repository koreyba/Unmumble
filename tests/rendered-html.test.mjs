import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("build includes development preview metadata", async () => {
  const bundle = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );

  assert.match(bundle, /["']codex-preview["']\s*:\s*["']development["']/i);
});

test("unified site navigation exposes every primary section", async () => {
  const navigation = await readFile(
    new URL("../app/components/site-navigation.tsx", import.meta.url),
    "utf8",
  );
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const library = await readFile(new URL("../app/library/page.tsx", import.meta.url), "utf8");
  const practice = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  const workspace = await readFile(
    new URL("../app/components/phrase-workspace.tsx", import.meta.url),
    "utf8",
  );
  const videos = await readFile(new URL("../app/videos/page.tsx", import.meta.url), "utf8");
  const integrations = await readFile(new URL("../app/integrations/page.tsx", import.meta.url), "utf8");
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");

  for (const [href, label] of [
    ["/library", "Library"],
    ["/practice", "Practice"],
    ["/chat", "AI Chat"],
    ["/videos", "Videos"],
    ["/settings", "Settings"],
  ]) {
    assert.match(navigation, new RegExp(`href: "${href.replaceAll("/", "\\/")}"`));
    assert.match(navigation, new RegExp(`label: "${label}"`));
    assert.match(trainer, new RegExp(`href="${href}"[^>]*>${label}<`));
  }

  assert.match(library, /<PhraseWorkspace surface="library"/);
  assert.match(home, /<SiteNavigation active="home"/);
  assert.match(home, /You know the words\./);
  assert.match(home, /Learn to hear them\./);
  assert.match(home, /Progress begins when you connect the sounds with the actual words—and repeat until the phrase becomes recognizable without captions\./);
  assert.doesNotMatch(home, /<PhraseWorkspace/);
  assert.match(practice, /<PhraseWorkspace surface="practice"/);
  assert.match(workspace, /<SiteNavigation\s+active=\{surface\}/);
  assert.match(videos, /<SiteNavigation\s+active="videos"/);
  assert.match(integrations, /<SiteNavigation\s+active="settings"/);
  assert.match(trainer, /href="\/practice" aria-current="page">Practice<\/a>/);
});

test("AI Chat has a public shell with an explicit account boundary", async () => {
  const [page, chat, styles] = await Promise.all([
    readFile(new URL("../app/chat/page.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/components/ai-practice-chat.tsx", import.meta.url), "utf8").catch(() => ""),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<AiPracticeChat\s*\/>/);
  assert.match(chat, /<SiteNavigation active="chat"/);
  assert.match(chat, /accountSession\(\)/);
  assert.match(chat, /setReturnTo\(`\$\{window\.location\.pathname\}\$\{window\.location\.search\}`\)/);
  assert.match(chat, /signInHref\(returnTo\)/);
  assert.match(chat, /Turn words into conversation/);
  assert.match(chat, /select any useful phrase to translate or add to learning/i);
  assert.match(chat, /Sign in with Google to start and keep your practice chats/);
  assert.match(styles, /\.ai-chat-shell \{/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.ai-chat-shell \{/);
});

test("every navigation keeps Beta with the brand and places a GitHub icon in the right controls", async () => {
  const [navigation, trainer, styles] = await Promise.all([
    readFile(new URL("../app/components/site-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
    readFile(new URL("../public/site-navigation.css", import.meta.url), "utf8"),
  ]);

  for (const source of [navigation, trainer]) {
    const brandIndex = source.indexOf("site-brand-context");
    const betaIndex = source.indexOf("site-beta-badge");
    const accountIndex = source.indexOf("site-account");
    const githubIndex = source.indexOf("site-github-link");

    assert.ok(brandIndex < betaIndex && betaIndex < accountIndex);
    assert.ok(accountIndex < githubIndex);
    assert.match(source, /class(?:Name)?="site-beta-badge"[^>]*>Beta</);
    assert.match(source, /class(?:Name)?="site-github-link"/);
    assert.match(source, /aria-label="Open source on GitHub"/);
    assert.match(source, /href="https:\/\/github\.com\/koreyba\/Unmumble"/);
    assert.match(source, /class(?:Name)?="site-github-icon"/);
    assert.doesNotMatch(source, />Open source on GitHub/);
  }

  assert.match(styles, /\.site-github-link \{/);
  assert.match(styles, /\.site-github-icon \{/);
});

test("unified navigation stays on top for desktop and moves to the bottom on mobile", async () => {
  const styles = await readFile(
    new URL("../public/site-navigation.css", import.meta.url),
    "utf8",
  );
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const globalStyles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");

  assert.match(globalStyles, /@import "\.\.\/public\/site-navigation\.css";/);
  assert.doesNotMatch(layout, /href="\/site-navigation\.css"/);
  assert.match(trainer, /href="\/site-navigation\.css"/);
  assert.match(styles, /\.site-navigation \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.site-primary-links \{[\s\S]*?position: fixed;[\s\S]*?bottom: 0;/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.site-navigation \{[\s\S]*?backdrop-filter: none;/);
  assert.match(styles, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.site-primary-link \{[\s\S]*?min-height: 50px;/);
  assert.match(trainer, /top: var\(--site-navigation-offset, 0\)/);
});

test("Library catalogs new phrases while Practice owns the learning queues", async () => {
  const appEntries = await readdir(new URL("../app/", import.meta.url));
  assert.ok(appEntries.includes("practice"), "Practice needs its own route instead of opening the trainer");

  const library = await readFile(new URL("../app/library/page.tsx", import.meta.url), "utf8");
  const practice = await readFile(new URL("../app/practice/page.tsx", import.meta.url), "utf8");
  const workspace = await readFile(
    new URL("../app/components/phrase-workspace.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");

  assert.match(library, /<PhraseWorkspace surface="library"\s*\/>/);
  assert.match(practice, /<PhraseWorkspace surface="practice"\s*\/>/);
  assert.match(workspace, /const practiceTabs[^=]*=\s*\[[\s\S]*?To Learn[\s\S]*?Learning Now[\s\S]*?Learned[\s\S]*?\];/);
  assert.doesNotMatch(workspace.match(/const practiceTabs[^=]*=\s*\[([\s\S]*?)\];/)?.[1] || "", /Pick/);
  assert.match(workspace, /surface === "practice" \? "learning_now" : "pick"/);
  assert.match(workspace, /phrase\.status === "pick"[\s\S]*?phrase\.analysis\?\.kind === activeFormat/);
  assert.match(workspace, /surface === "practice" && \([\s\S]*?aria-label="Learning sections"/);
  assert.match(workspace, /<PracticeAction onClick=\{\(\) => openPhrase\(phrase\)\} \/>/);
  assert.match(workspace, /window\.location\.assign\(`\/trainer\?\$\{query\.toString\(\)\}`\)/);
  assert.match(workspace, /Mark as Learned/);
  assert.match(styles, /\.tabs \{[^}]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.phrase-summary \{[^}]*cursor: default;/);
  assert.match(worker, /PUBLIC_DOCUMENT_PATHS[^;]*"\/practice"/);
  assert.match(worker, /PUBLIC_DOCUMENT_PATHS[^;]*"\/library"/);
  assert.match(worker, /PUBLIC_DOCUMENT_PATHS[^;]*"\/chat"/);
  assert.match(trainer, /if \(!fullVideoMode && !initialViewerParams\.get\("phrase"\)\?\.trim\(\)\) \{[\s\S]*?window\.location\.replace\("\/practice"\);/);
  assert.doesNotMatch(trainer, /viewerParams\.get\("phrase"\)\?\.trim\(\) \|\| BASE_PHRASES\[0\]\.q/);
});

test("trainer exposes word and selected-phrase actions", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="translateSelectionBtn"/);
  assert.match(trainer, /id="listenSelectionBtn"/);
  assert.match(trainer, /id="addSelectionBtn"/);
  assert.match(trainer, /fetch\("\/api\/translate"/);
  assert.match(trainer, /const translationCache = new Map\(\)/);
  assert.match(trainer, /translationAbortController/);
  assert.doesNotMatch(trainer, /state\.translationCache/);
  assert.doesNotMatch(trainer, /Google Cloud Translation API key/);
});

test("trainer can switch between Tatoeba and YouGlish", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );
  const tatoebaRoute = await readFile(
    new URL("../app/api/tatoeba/route.ts", import.meta.url),
    "utf8",
  );
  const audioRoute = await readFile(
    new URL("../app/api/tatoeba/audio/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="sourceSwitch"/);
  assert.match(trainer, /data-source="tatoeba"/);
  assert.match(trainer, /data-source="youglish"/);
  assert.match(trainer, /id="tatoebaAudio"/);
  assert.match(trainer, /fetch\(`\/api\/tatoeba\?q=/);
  assert.match(trainer, /<script src="\/caption-navigation\.js"><\/script>/);
  assert.match(trainer, /signal: controller\.signal/);
  assert.match(tatoebaRoute, /https:\/\/api\.tatoeba\.org\/v1\/sentences/);
  assert.match(tatoebaRoute, /cacheTtl: 300/);
  assert.match(audioRoute, /https:\/\/api\.tatoeba\.org\/v1\/audios\/\$\{id\}\/file/);
});

test("trainer defaults to YouGlish provider instead of Tatoeba", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  // DEFAULT_STATE sets source to youglish
  assert.match(trainer, /const DEFAULT_STATE = \{[\s\S]*?source:\s*"youglish"/);

  // normalizeState fallback sets source to youglish
  assert.match(trainer, /s\.source = \["tatoeba",\s*"youglish"\]\.includes\(s\.source\)\s*\?\s*s\.source\s*:\s*"youglish"/);
});

test("caption navigation is ready before the first YouGlish caption callback", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );
  const helperTag = '<script src="/caption-navigation.js"></script>';
  const inlineController = '<script>\n    "use strict";';
  const helperIndex = trainer.indexOf(helperTag);
  const controllerIndex = trainer.indexOf(inlineController);

  assert.ok(helperIndex >= 0, "the caption helper must be loaded");
  assert.ok(controllerIndex > helperIndex, "the helper must load before the trainer controller");
});

test("YouGlish videos and Tatoeba tracks default to random and can be saved per phrase", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );
  const examplesRoute = await readFile(
    new URL("../app/api/examples/route.ts", import.meta.url),
    "utf8",
  );
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/components/phrase-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(trainer, /id="exampleMode"/);
  assert.match(trainer, /id="saveExampleBtn"/);
  assert.match(trainer, /`\$\{query\} :r`/);
  assert.match(trainer, /`\$\{query\} #\$\{example\.external_id\}`/);
  assert.match(trainer, /event && event\.video/);
  assert.match(trainer, /provider: state\.source/);
  assert.match(trainer, /audioId: Number\(example\.external_id\)/);
  assert.match(trainer, /tatoebaTracks = orderProviderItems/);
  assert.match(trainer, /function orderProviderItems\(items\) \{\s*return shuffled\(items\);\s*\}/);
  assert.match(trainer, /fetchYouglish\(`\$\{query\} :r`, query\);/);
  assert.doesNotMatch(trainer, /data-example-order=/);
  assert.doesNotMatch(examplesRoute, /CREATE TABLE IF NOT EXISTS phrase_examples/);
  assert.match(examplesRoute, /LEFT JOIN phrase_examples/);
  assert.match(examplesRoute, /example: publicExample/);
  assert.match(examplesRoute, /provider === "tatoeba"/);
  assert.match(examplesRoute, /metadata: parseMetadata/);
  assert.match(schema, /export const phraseExamples/);
  assert.match(schema, /metadata: text\("metadata"\)/);
  assert.match(page, /phraseId: phrase\.id/);
  const inlineScript = trainer.match(/<script>([\s\S]+)<\/script>/)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Function(inlineScript));
});

test("video history stores account videos independently from phrase examples", async () => {
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );

  assert.match(schema, /export const savedVideos/);
  assert.match(schema, /youtubeVideoId: text\("youtube_video_id"\)/);
  assert.match(schema, /restoreQuery: text\("restore_query"\)/);
  assert.match(schema, /language: text\("language"\)/);
  assert.match(schema, /accent: text\("accent"\)/);
  assert.match(schema, /uniqueIndex\("idx_saved_videos_user_youtube"\)/);
  assert.match(schema, /index\("idx_saved_videos_user_updated"\)/);
});

test("video history API validates ids and scopes every mutation to the current user", async () => {
  const route = await readFile(
    new URL("../app/api/videos/route.ts", import.meta.url),
    "utf8",
  );
  const migrationNames = await readdir(new URL("../drizzle/", import.meta.url));
  const migrationName = migrationNames.find((name) => name.startsWith("0010_"));
  const migration = migrationName
    ? await readFile(new URL(`../drizzle/${migrationName}`, import.meta.url), "utf8")
    : "";

  assert.match(route, /getCurrentUser\(request\)/);
  assert.match(route, /isYouTubeVideoId\(videoId\)/);
  assert.match(route, /!originQuery \|\| !restoreQuery/);
  assert.match(route, /language === "english"/);
  assert.match(route, /accent === "us" \|\| accent === "uk"/);
  assert.match(route, /ON CONFLICT\(user_id, youtube_video_id\) DO UPDATE/);
  assert.match(route, /WHERE user_id = \?/);
  assert.match(route, /p\.source_type = 'preset' OR p\.owner_id = \?/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /request\.text\(\)/);
  assert.match(route, /Request body is too large/);
  assert.match(route, /Invalid JSON body/);
  assert.match(migration, /ALTER TABLE [`]saved_videos[`] ADD [`]language[`]/);
  assert.match(migration, /ALTER TABLE [`]saved_videos[`] ADD [`]accent[`]/);
});

test("legacy owner migration carries saved videos into the authenticated account", async () => {
  const auth = await readFile(
    new URL("../lib/auth.ts", import.meta.url),
    "utf8",
  );

  assert.match(auth, /INSERT OR IGNORE INTO saved_videos/);
  assert.match(auth, /origin_query, restore_query, restore_anchor_seconds,[\s\S]*?origin_caption/);
  assert.match(auth, /current\.youtube_video_id = legacy\.youtube_video_id/);
  assert.match(auth, /DELETE FROM saved_videos WHERE user_id = \?/);
});

test("Continue watching opens viewed videos in the shared YouGlish trainer", async () => {
  const page = await readFile(
    new URL("../app/videos/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /<h1>Videos<\/h1>/);
  assert.match(page, /Continue watching/);
  assert.match(page, /No videos watched yet/);
  assert.doesNotMatch(page, /Saved videos|Watch later|No videos saved yet/i);
  assert.match(page, /fetch\("\/api\/videos"/);
  assert.match(page, /GUEST_LIBRARY_STORAGE_KEY/);
  assert.match(page, /removeGuestSavedVideo/);
  assert.match(page, /buildFullVideoTrainerUrl/);
  assert.match(page, /readYouTubeResume/);
  assert.match(page, /window\.location\.assign\(fullVideoUrl\)/);
  assert.doesNotMatch(page, /method:\s*"POST"/);
  assert.doesNotMatch(page, /YouTubePlayer/);
  assert.doesNotMatch(page, /youtube\.com\/iframe_api|new window\.YT\.Player/);
});

test("Full Video Mode keeps learning controls and removes result-only controls", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /full-video-mode/);
  assert.match(trainer, /fullVideoMode/);
  assert.match(trainer, /<script src="\/youglish-video-restore\.js"><\/script>/);
  assert.match(trainer, /fullVideoOrigin\.restoreQuery/);
  assert.match(trainer, /resumeCaption/);
  assert.match(trainer, /MAX_OBSERVED_CAPTIONS = 200/);
  assert.match(trainer, /result\.history\.slice\(-MAX_OBSERVED_CAPTIONS\)/);
  assert.match(trainer, /#\$\{fullVideoOrigin\.videoId\}/);
  assert.match(
    trainer,
    /function createYouglishWidget\(\{ autoStart = fullVideoMode \? 0 : 1 \} = \{\}\)/,
  );
  assert.match(trainer, /window\.addEventListener\("popstate"/);
  assert.match(trainer, /id="repeatCaptionBtn"/);
  assert.match(trainer, /id="translateSelectionBtn"/);
  assert.match(trainer, /id="listenSelectionBtn"/);
  assert.match(trainer, /id="addSelectionBtn"/);
  assert.match(trainer, /body\.full-video-mode[^}]*#replayBtn/s);
  assert.match(trainer, /body\.full-video-mode[^}]*\.video-navigation/s);
  assert.match(trainer, /body\.full-video-mode[^}]*#exampleTools/s);
  assert.match(trainer, /el\.accentControl\.hidden = tatoeba \|\| fullVideoMode;/);
  const warmTransition = trainer.match(/function watchCurrentFullVideo\(\) \{([\s\S]*?)\n    \}\n\n    function setExampleMode/)?.[1] || "";
  assert.doesNotMatch(warmTransition, /widget\.pause\(\)/);
  assert.match(warmTransition, /history\.pushState\(\{ fullVideo: true \}/);
  assert.doesNotMatch(warmTransition, /fetchPhrase|fetchYouglish|widget\.fetch|window\.location/);

  const listenTransition = trainer.match(/function listenToText\(text\) \{([\s\S]*?)\n    \}\n\n    async function addTextToLearn/)?.[1] || "";
  assert.match(listenTransition, /persistFullVideoProgress\(\{ flush: true \}\)/);
  assert.match(listenTransition, /history\.pushState\(\{ listenFromFullVideo: true \}/);
  assert.match(trainer, /window\.addEventListener\("popstate"[\s\S]*?fetchPhrase\(fullVideoOrigin\.originalQuery/);
  assert.doesNotMatch(trainer, /const restoreQuery = fullVideoOrigin\.resumeCaption/);
  assert.match(trainer, /event\.state && event\.state\.listenFromFullVideo[\s\S]*?fetchPhrase\(VIEWER_PHRASE, true\)/);
});

test("YouGlish results keep clip filters aligned and record history on Full Video entry", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/components/phrase-workspace.tsx", import.meta.url),
    "utf8",
  );
  const navigation = await readFile(
    new URL("../app/components/site-navigation.tsx", import.meta.url),
    "utf8",
  );

  const controls = trainer.indexOf('id="playerControls"');
  const exampleTools = trainer.indexOf('id="exampleTools"');
  const saveClip = trainer.indexOf('id="saveExampleBtn"');
  const watchFullVideo = trainer.indexOf('id="watchFullVideoBtn"');
  assert.ok(
    exampleTools < saveClip && saveClip < watchFullVideo && watchFullVideo < controls,
    "Full Video must sit beside Save clip before the shared toolbar",
  );
  assert.doesNotMatch(trainer, /expandMediaBtn|media-expanded|Expand player|Collapse player/);
  assert.doesNotMatch(trainer, /class="media-heading"/);
  assert.doesNotMatch(trainer, /watchLaterBtn|Watch later/i);
  assert.match(trainer, /Save clip/);
  assert.match(trainer, /fetch\("\/api\/videos"/);
  assert.match(trainer, /savedVideos/);
  assert.match(trainer, /history\.pushState\([^;]+fullVideo/s);
  assert.match(trainer, /currentYouglishVideoId/);
  assert.match(trainer, /\^\[A-Za-z0-9_-\]\{11\}\$/);
  assert.match(trainer, /const itemLabel = state\.source === "tatoeba" \? "track" : "clip"/);
  assert.match(trainer, /function recordCurrentVideoHistory\(origin, progress\)/);
  assert.match(trainer, /saveGuestVideo\(origin\)/);
  assert.equal(
    [...trainer.matchAll(/recordCurrentVideoHistory\(/g)].length,
    2,
    "history must be written only by the Full Video action",
  );
  const warmTransition = trainer.match(/function watchCurrentFullVideo\(\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(warmTransition, /void recordCurrentVideoHistory\(origin, progress\)/);
  assert.ok(
    warmTransition.indexOf("recordCurrentVideoHistory(origin, progress)") < warmTransition.indexOf("fullVideoMode = true"),
    "history upsert must start before entering Full Video Mode",
  );
  assert.match(page, /<SiteNavigation\s+active=\{surface\}/);
  assert.match(navigation, /href: "\/videos"/);
});

test("DeepL credentials stay in the shared server helper", async () => {
  const helper = await readFile(
    new URL("../lib/deepl.ts", import.meta.url),
    "utf8",
  );

  assert.match(helper, /getAuthenticatedUser/);
  assert.match(helper, /Authorization: `DeepL-Auth-Key \$\{apiKey\}`/);
  assert.match(helper, /target_lang: targetLanguage/);
  assert.match(helper, /AbortController/);
  assert.match(helper, /DEEPL_TIMEOUT_MS/);
  assert.match(helper, /readIntegrationSecret\(userId, "deepl"\)/);
  assert.doesNotMatch(helper, /hasIntegrationSession/);
  assert.match(helper, /request\?: Request/);
});

test("learning phrases persist and render their translation", async () => {
  const route = await readFile(
    new URL("../app/api/phrases/route.ts", import.meta.url),
    "utf8",
  );
  const repository = await readFile(
    new URL("../lib/vocabulary/repository.ts", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/components/phrase-workspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /createVocabularyRepository\(db\)\.addEntry/);
  assert.match(repository, /createVocabularyMutationPlanner/);
  assert.match(repository, /await db\.batch\(plan\.statements\)/);
  assert.match(route, /translateEnglishToNativeLanguage/);
  assert.match(route, /optionalTranslationForPhrase/);
  assert.match(route, /translationPending/);
  assert.match(route, /COALESCE\(progress\.status, 'pick'\) != 'pick'/);
  assert.match(route, /p\.translation = ''/);
  assert.match(route, /phrase_progress/);
  assert.match(page, /className="phrase-translation"/);
});

test("MVP UX persists phrase context and exposes global library sorting", async () => {
  const route = await readFile(
    new URL("../app/api/phrases/route.ts", import.meta.url),
    "utf8",
  );
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );
  const page = await readFile(
    new URL("../app/components/phrase-workspace.tsx", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../drizzle/0005_special_ogun.sql", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(route, /CREATE TABLE IF NOT EXISTS|ALTER TABLE.*context/);
  assert.match(route, /payload\.context/);
  assert.match(route, /payload\.translation/);
  assert.match(route, /COALESCE\(NULLIF\(p\.translation, ''\), fallback_meaning\.translation, ''\) AS translation/);
  assert.match(route, /candidate\.user_id = \? AND candidate\.phrase_id = p\.id/);
  assert.match(schema, /context: text\("context"\)/);
  assert.match(migration, /ALTER TABLE [`]phrases[`] ADD [`]context[`]/);
  assert.match(page, /phrase-sort/);
  assert.match(page, /added_desc/);
  assert.match(page, /localStorage/);
  assert.match(page, /created_at/);
});

test("MVP UX keeps saved filters global and separates caption/video navigation", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="prevCaptionBtn"/);
  assert.match(trainer, /id="nextCaptionBtn"/);
  assert.match(trainer, /<script src="\/caption-navigation\.js"><\/script>/);
  assert.match(trainer, /id="prevVideoBtn"/);
  assert.match(trainer, /id="nextVideoBtn"/);
  assert.doesNotMatch(trainer, /id="exampleOrder"/);
  assert.doesNotMatch(trainer, /data-example-order=/);
  assert.doesNotMatch(trainer, /function setExampleOrder/);
  assert.match(trainer, /captionHistory/);
  assert.match(trainer, /current_time/);
  assert.match(trainer, /onCaptionConsumed/);
  assert.match(trainer, /repeatCaptionBtn/);
  assert.doesNotMatch(trainer, /captionNavigationMethod/);
  assert.doesNotMatch(trainer, /move\(-5\)/);
  assert.match(trainer, /class="learning-workspace"/);
  assert.match(trainer, /class="media-panel"/);
  assert.match(trainer, /id="translationAddBtn"/);
});

test("trainer uses one full-width media layout without redundant expand state", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(trainer, /expandMediaBtn|media-expanded|setMediaExpanded|Expand player|Collapse player/);
  assert.match(trainer, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(trainer, /grid-template-areas: "workspace" "media"/);
  assert.doesNotMatch(trainer, /id="mediaOverlay"/);
});

test("trainer interface labels are consistently English", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /<span>Phrase example<\/span>/);
  assert.match(trainer, /aria-label="Phrase example"/);
  assert.match(trainer, /class="button-label">Previous<\/span>/);
  assert.match(trainer, /class="button-label">Continue in video<\/span>/);
  assert.doesNotMatch(trainer, /[\u0400-\u04FF]/);
});

test("trainer primary controls expose familiar icons with accessible labels", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.ok((trainer.match(/class="button-icon"/g) || []).length >= 8);
  assert.match(trainer, /class="button-label">Previous<\/span>/);
  assert.match(trainer, /aria-label="Pause playback"/);
  assert.match(trainer, /aria-label="Save current example"/);
  assert.match(trainer, /\.player-controls \.button-label \{ display: none; \}/);
});

test("trainer uses one unbroken toolbar and one stateful play pause control", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="playerControls" class="player-controls player-toolbar"/);
  assert.match(trainer, /\.player-controls \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: nowrap;/);
  assert.doesNotMatch(trainer, /\.player-controls \{\s*grid-template-columns:/);
  assert.doesNotMatch(trainer, /class="control-group-label"/);
  assert.match(trainer, /id="playPauseBtn"[^>]*aria-label="Pause playback"[^>]*title="Pause playback"/);
  assert.doesNotMatch(trainer, /id="pauseBtn"/);
  assert.match(trainer, /id="slowPlaybackBtn"[^>]*aria-label="Slow playback"/);
  assert.match(trainer, /function renderPlaybackControl\(\)/);
  assert.match(trainer, /const wantsPlayback = playerState !== 1;[\s\S]*?requestedYouglishPlayback = wantsPlayback;[\s\S]*?callWidget\(wantsPlayback \? "play" : "pause"\)/);
  assert.match(
    trainer,
    /playerState = nextState;\s*if \(nextState === 1\) beginCurrentYouglishRestoreAnchorClock\(\);\s*renderPlaybackControl\(\);/,
  );
  assert.match(trainer, /Recording ready — press Play\./);
  assert.doesNotMatch(trainer, /Recording ready — press Listen\./);
});

test("trainer keeps primary controls compact across desktop and mobile", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /\.control-group \{\s*display: contents;/);
  assert.match(trainer, /\.player-controls button \{[\s\S]*?flex: 1 1 0;/);
  assert.match(trainer, /class="caption-navigation-status"/);
  assert.doesNotMatch(trainer, /id="captionNavigationHint" class="control-group-hint"/);
  assert.match(trainer, /@media \(max-width: 560px\)[\s\S]*?\.player-controls \{ gap: 3px; padding: 4px; \}/);
  assert.doesNotMatch(trainer, /\.player-controls\.caption-controls-hidden/);
  assert.match(trainer, /\.example-tools \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
});

test("trainer controls use one polished visual system", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(
    trainer,
    /\.player-controls \{[\s\S]*?background: var\(--color-surface\);[\s\S]*?box-shadow:/,
  );
  assert.match(
    trainer,
    /\.player-controls button \{[\s\S]*?border: 1px solid var\(--color-control-border\);[\s\S]*?border-radius: 11px;[\s\S]*?background: var\(--color-control-background\);[\s\S]*?color: var\(--color-action-secondary-text\);/,
  );
  assert.match(
    trainer,
    /\.example-tools \{[\s\S]*?padding: 6px;[\s\S]*?border: 1px solid var\(--color-border\);[\s\S]*?border-radius: 16px;[\s\S]*?background: var\(--color-surface\);/,
  );
  assert.match(
    trainer,
    /\.example-settings \.segmented \{[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
  );
  assert.match(
    trainer,
    /\.example-settings \.segmented button\.active \{[\s\S]*?border-color: var\(--color-interactive-border\);[\s\S]*?background: var\(--color-interactive-soft-hover\);/,
  );
  assert.match(
    trainer,
    /\.media-full-video-btn \{[\s\S]*?background: var\(--color-interactive-surface\);[\s\S]*?color: var\(--color-on-interactive\);[\s\S]*?box-shadow:/,
  );
  assert.match(
    trainer,
    /\.segmented button\.active \{[\s\S]*?background: var\(--color-interactive-soft-hover\);[\s\S]*?box-shadow:/,
  );
  assert.match(trainer, /\.control-select \{[\s\S]*?position: relative;/);
  assert.doesNotMatch(trainer, /\.control-select::after/);
  assert.match(trainer, /\.slow-playback-btn\[aria-pressed="true"\] \{[\s\S]*?background:/);
  assert.match(
    trainer,
    /\.example-actions \{[\s\S]*?align-items: center;[\s\S]*?border-left: 1px solid var\(--color-border\);/,
  );
  assert.match(
    trainer,
    /@media \(max-width: 560px\)[\s\S]*?\.control-select select \{[\s\S]*?font-size: 10\.5px;/,
  );
});

test("mobile trainer puts example choices and captions before controls and media", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(
    trainer,
    /@media \(max-width: 760px\)[\s\S]*?\.learning-workspace \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?\.source-row \{[\s\S]*?order: 1;[\s\S]*?\.example-tools \{[\s\S]*?order: 2;[\s\S]*?\.caption-box \{[\s\S]*?order: 4;[\s\S]*?\.player-controls \{[\s\S]*?order: 8;/,
  );
});

test("desktop mirrors the mobile learning flow and places media last", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  const source = trainer.indexOf('id="sourceSwitch"');
  const choices = trainer.indexOf('id="exampleTools"');
  const captions = trainer.indexOf('class="caption-box"');
  const controls = trainer.indexOf('id="playerControls"');
  const saveClip = trainer.indexOf('id="saveExampleBtn"');
  const watchFullVideo = trainer.indexOf('id="watchFullVideoBtn"');
  const media = trainer.indexOf('class="media-panel"');
  const mediaFrame = trainer.indexOf('id="mediaFrameSlot"');

  assert.ok(source < choices && choices < saveClip && saveClip < watchFullVideo);
  assert.ok(watchFullVideo < captions && captions < controls && controls < media);
  assert.ok(media < mediaFrame);
  assert.match(
    trainer,
    /\.sticky-stage \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-areas: "workspace" "media";/,
  );
});

test("trainer renders a prominent non-blocking restoring banner inside the video", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(
    trainer,
    /\.status:not\(\.error\),\s*\.caption-navigation-status \{ display: none; \}/,
  );
  assert.match(trainer, /\.widget-frame \{[\s\S]*?position: relative;/);
  assert.match(
    trainer,
    /\.video-restore-banner \{[^}]*position: absolute;[^}]*pointer-events: none;[^}]*font-size: clamp\(/,
  );
  assert.match(trainer, /\.video-restore-banner\[hidden\] \{ display: none; \}/);
  assert.match(trainer, /<output id="status" class="status" aria-live="polite">/);
  assert.match(
    trainer,
    /id="widgetFrame"[\s\S]*?<output id="fullVideoRestoreStatus" class="video-restore-banner" aria-live="polite" hidden>/,
  );
  assert.doesNotMatch(trainer, /class="media-label">Media<\/div>/);
});

test("mobile trainer places media directly after the shared toolbar", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(
    trainer,
    /@media \(max-width: 760px\)[\s\S]*?\.learning-workspace \{[\s\S]*?padding: 8px;[\s\S]*?\.example-tools \{[\s\S]*?margin-top: 0;[\s\S]*?\.caption-box \{[\s\S]*?margin-top: 6px;[\s\S]*?padding: 10px;[\s\S]*?\.player-controls \{[\s\S]*?margin-top: 6px;[\s\S]*?\.media-panel \{[\s\S]*?margin-top: 4px;[\s\S]*?padding: 6px;/,
  );
  assert.doesNotMatch(trainer, /class="media-heading"/);
});

test("caption controls are visible only for YouGlish", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="captionNavigation" class="control-group caption-navigation"/);
  assert.match(trainer, /id="captionNavigationHint" class="caption-navigation-status"/);
  assert.match(trainer, /const captionsAvailable = state\.source === "youglish";/);
  assert.match(trainer, /el\.captionNavigation\.hidden = !captionsAvailable;/);
  assert.match(trainer, /el\.captionNavigationHint\.hidden = !captionsAvailable;/);
  assert.match(trainer, /el\.repeatCaptionBtn\.hidden = !captionsAvailable;/);
});

test("mobile example controls align to two columns and collapse Tatoeba actions", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /data-example-mode="all" aria-label="All examples" title="All examples"/);
  assert.match(trainer, /data-example-mode="saved" aria-label="Saved examples" title="Saved examples"/);
  assert.doesNotMatch(trainer, /aria-label="Random order"/);
  assert.doesNotMatch(trainer, /aria-label="Ordered"/);
  assert.match(trainer, /id="watchFullVideoBtn"[^>]*aria-label="Continue in video"[^>]*title="Continue in video"/);
  assert.match(trainer, /\.player-controls button \{[\s\S]*?min-height: 44px;/);
  assert.match(trainer, /#sourceSwitch button,\s*\.example-settings \.segmented button \{\s*min-height: 44px;/);
  assert.match(
    trainer,
    /@media \(max-width: 560px\)[\s\S]*?\.example-tools \{[\s\S]*?padding: 0;[\s\S]*?border: 0;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/,
  );
  assert.match(
    trainer,
    /\.example-settings \.segmented \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?width: 100%;/,
  );
  assert.match(
    trainer,
    /\.example-actions \{[\s\S]*?display: grid;[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?gap: 6px;[\s\S]*?padding: 0;[\s\S]*?border: 0;/,
  );
  assert.match(trainer, /\.example-actions \.button-label \{ display: inline; \}/);
  assert.match(trainer, /\.example-settings \.segmented button,\s*\.example-actions button \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?min-height: 44px;[\s\S]*?padding: 8px 6px;/);
  assert.match(
    trainer,
    /\.media-full-video-btn \{[\s\S]*?margin-left: 0;[\s\S]*?border: 1px solid var\(--color-interactive-border\);[\s\S]*?background: var\(--color-interactive-soft\);[\s\S]*?color: var\(--color-interactive\);[\s\S]*?box-shadow: none;/,
  );
  assert.match(trainer, /\.example-actions:has\(\.media-full-video-btn\[hidden\]\) \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(trainer, /const validYouTubeVideo = isYouGlish && \/\^\[A-Za-z0-9_-\]\{11\}\$\//);
  assert.match(
    trainer,
    /const canRestoreFullVideo = validYouTubeVideo\s*&& Boolean\(currentYouglishRestoreQuery\)\s*&& currentYouglishRestoreAnchorTime !== null;/,
  );
  assert.match(trainer, /el\.watchFullVideoBtn\.hidden = fullVideoMode \|\| !canRestoreFullVideo;/);
});

test("saved example button names the remove action", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(
    trainer,
    /setButtonLabel\(el\.saveExampleBtn, saved \? `Remove \$\{itemLabel\}` : `Save \$\{itemLabel\}`\)/,
  );
  assert.doesNotMatch(trainer, /setButtonLabel\(el\.saveExampleBtn, saved \? "Saved"/);
});

test("YouGlish repeat keeps one stable widget instance", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="youglishWidgetHost"[\s\S]*?id="yg-widget-0"/);
  assert.match(trainer, /new YG\.Widget\("yg-widget-0", \{\s*components: 128,/);
  assert.doesNotMatch(trainer, /widget\.close\(\)/);
  assert.doesNotMatch(trainer, /host\.replaceChildren\(mount\)/);
  assert.doesNotMatch(trainer, /recreateYouglishWidget/);
  assert.doesNotMatch(trainer, /repeatResolvePending|fetchRepeatResolution/, "Repeat must not re-fetch the caption through the widget");
  assert.doesNotMatch(trainer, /components: 0/);
  assert.doesNotMatch(trainer, /components: 68/);
});

test("trainer owns a compact YouGlish accent selector and slow toggle", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  const controls = trainer.indexOf('id="playerControls"');
  const accent = trainer.indexOf('id="accentControl"');
  const slow = trainer.indexOf('id="slowPlaybackBtn"');
  assert.ok(controls < accent && accent < slow);
  assert.match(trainer, /id="accentSelect"[^>]*aria-label="Accent"/);
  assert.match(trainer, /<option value="">All<\/option>/);
  assert.match(trainer, /<option value="us">US<\/option>/);
  assert.match(trainer, /<option value="uk">UK<\/option>/);
  assert.match(trainer, /<option value="aus">AUS<\/option>/);
  assert.match(trainer, /\["us", "uk", "aus", ""\]\.includes\(s\.accent\)/);
  assert.match(trainer, /el\.accentControl\.hidden = tatoeba \|\| fullVideoMode;/);
  assert.match(trainer, /el\.accentSelect\.addEventListener\("change"/);
  assert.match(trainer, /id="slowPlaybackBtn"[^>]*aria-label="Slow playback"[^>]*aria-pressed="false"/);
  assert.match(trainer, /el\.slowPlaybackBtn\.addEventListener\("click"/);
  assert.match(trainer, /setSpeed\(Number\(state\.speed\) === 0\.75 \? 1 : 0\.75\)/);
  assert.doesNotMatch(trainer, /id="accentSwitch"/);
  assert.doesNotMatch(trainer, /id="speedSelect"/);
});

test("library and integration surfaces use English UI labels", async () => {
  const surfaces = await Promise.all([
    readFile(new URL("../app/components/phrase-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  for (const surface of surfaces) assert.doesNotMatch(surface, /[\u0400-\u04FF]/);
  assert.match(surfaces[0], /Train connected speech\./);
  assert.match(surfaces[1], /Translate English phrases into your native language\./);
  assert.match(surfaces[2], /<html lang="en" suppressHydrationWarning>/);
});

test("phrase controls use timing-aware caption events and expose repeat state", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="repeatCaptionBtn"/);
  assert.match(trainer, /aria-pressed/);
  assert.match(trainer, /#repeatCaptionBtn\[aria-pressed="true"\]\s*\{[^}]*background:/);
  assert.ok(
    trainer.indexOf('#repeatCaptionBtn[aria-pressed="true"]')
      > trainer.indexOf(".player-controls button:hover:not(:disabled)"),
    "the pressed Repeat style must override the generic hover style",
  );
  assert.match(trainer, /onCaptionConsumed/);
  assert.match(trainer, /onPlayerStateChange/);
  assert.match(trainer, /event\.current_time/);
  assert.match(trainer, /lastKnownTime/);
  assert.match(trainer, /captionNavigationBusy/);
  assert.match(trainer, /captionNavigation\.neighbors/);
  assert.doesNotMatch(trainer, /seekByCaptionSteps/);
  assert.doesNotMatch(trainer, /captionNavigationMethod/);
  assert.doesNotMatch(trainer, /move\(-5\)/);
});

test("Tatoeba hides timed caption controls but keeps whole-track navigation", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );

  assert.match(trainer, /id="captionNavigation"[^>]*hidden/);
  assert.match(trainer, /id="repeatCaptionBtn"[^>]*hidden/);
  assert.match(trainer, /const captionsAvailable = state\.source === "youglish"/);
  assert.match(trainer, /el\.captionNavigation\.hidden = !captionsAvailable/);
  assert.match(trainer, /el\.repeatCaptionBtn\.hidden = !captionsAvailable/);
  assert.match(trainer, /id="prevVideoBtn"/);
  assert.match(trainer, /id="nextVideoBtn"/);
});

test("caption timeline keeps opaque IDs ordered by timing and computes relative seeks", async () => {
  const source = await readFile(
    new URL("../public/caption-navigation.js", import.meta.url),
    "utf8",
  );
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const navigation = sandbox.window.UnmumbleCaptionNavigation;
  assert.ok(navigation);

  const first = navigation.upsert([], {
    videoId: "video-1",
    id: "opaque-b",
    raw: "second",
    text: "second",
    startTime: 12,
  }, 0, 10);
  const second = navigation.upsert(first.history, {
    videoId: "video-1",
    id: "opaque-a",
    raw: "first",
    text: "first",
    startTime: 10,
  }, first.nextSequence, 20);
  const duplicate = navigation.upsert(second.history, {
    videoId: "video-1",
    id: "opaque-b",
    raw: "second updated",
    text: "second updated",
    startTime: 12,
  }, second.nextSequence, 30);

  assert.deepEqual(duplicate.history.map(item => item.id), ["opaque-a", "opaque-b"]);
  assert.equal(duplicate.history.length, 2);
  assert.equal(duplicate.history[duplicate.index].text, "second updated");
  assert.equal(navigation.adjacent(duplicate.history, duplicate.index, -1, "video-1").id, "opaque-a");
  assert.equal(navigation.adjacent(duplicate.history, duplicate.index, 1, "video-1"), null);
  assert.equal(navigation.relativeSeekDelta(12, 13.5), 1.5);
  const moved = navigation.upsert(duplicate.history, {
    videoId: "video-1",
    id: "opaque-a",
    raw: "first moved",
    text: "first moved",
    startTime: 14,
  }, duplicate.nextSequence, 40);
  assert.deepEqual(moved.history.map(item => item.id), ["opaque-b", "opaque-a"]);
  assert.equal(moved.index, 1);
  assert.equal(navigation.adjacent(moved.history, moved.index, -1, "video-1").id, "opaque-b");
  assert.equal(navigation.adjacent(moved.history, moved.index, -1, "video-2"), null);
  assert.equal(navigation.finiteTime("not-a-time"), null);
  assert.equal(navigation.repeatSeekDelta(10, 12, 13), -3);
  assert.equal(navigation.repeatSeekDelta(10, 12, null), -2);
  assert.equal(navigation.repeatSeekDelta(10, null, 10.2), -0.5);
});

test("the first caption without timing is a replay target, not a zero-time seek", async () => {
  const source = await readFile(
    new URL("../public/caption-navigation.js", import.meta.url),
    "utf8",
  );
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const navigation = sandbox.window.UnmumbleCaptionNavigation;

  const first = navigation.upsert([], {
    videoId: "video-1",
    id: "opaque-first",
    raw: "first",
    text: "first",
    startTime: null,
    navigationMode: "replay",
  }, 0, 10);
  const second = navigation.upsert(first.history, {
    videoId: "video-1",
    id: "opaque-second",
    raw: "second",
    text: "second",
    startTime: 12,
    navigationMode: "seek",
  }, first.nextSequence, 20);

  const previous = navigation.adjacent(second.history, second.index, -1, "video-1");
  assert.equal(previous.id, "opaque-first");
  assert.equal(previous.startTime, null);
  assert.equal(navigation.isReplayTarget(previous), true);
  assert.equal(navigation.canNavigateTo(previous), true);
  assert.equal(navigation.canNavigateTo({ startTime: null }), false);
  assert.equal(navigation.finiteTime(null), null);
});

test("phrase navigation uses cached neighbors without waiting for a new caption event", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../public/caption-navigation.js", import.meta.url),
    "utf8",
  );
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  const navigation = sandbox.window.UnmumbleCaptionNavigation;
  const first = navigation.upsert([], {
    videoId: "video-1",
    id: "opaque-a",
    raw: "first",
    text: "first",
    startTime: 10,
  }, 0, 10);
  const second = navigation.upsert(first.history, {
    videoId: "video-1",
    id: "opaque-b",
    raw: "second",
    text: "second",
    startTime: 12,
  }, first.nextSequence, 20);
  const neighbors = navigation.neighbors(second.history, second.index, "video-1");

  assert.equal(neighbors.previous.id, "opaque-a");
  assert.equal(neighbors.next, null);
  assert.match(
    trainer,
    /captionNavigation\.neighbors\([\s\S]*?captionHistory,[\s\S]*?captionHistoryIndex,[\s\S]*?currentYouglishVideoId,[\s\S]*?activeCaptionSegmentId[\s\S]*?\)/,
  );
  assert.match(trainer, /captionTargetAvailable\(previousTarget, current\)/);
  assert.match(trainer, /captionTargetAvailable\(nextTarget, current\)/);
  const knownSeek = trainer.match(/function seekToKnownCaption\([\s\S]*?\n    function navigateCaption/)?.[0];
  assert.ok(knownSeek);
  assert.doesNotMatch(knownSeek, /waitForCaption/);
  assert.match(knownSeek, /renderCaption\(targetEntry\.raw\)/);
  assert.match(knownSeek, /captionNavigation\.isReplayTarget\(target\)/);
  assert.match(knownSeek, /widget\.replay\(\)/);
  assert.match(trainer, /resolvedTime === null \? "replay" : "seek"/);
});

test("saved YouGlish playback waits for onVideoChange before switching caption history", async () => {
  const trainer = await readFile(
    new URL("../public/trainer.html", import.meta.url),
    "utf8",
  );
  const savedPlayback = trainer.match(
    /function playSavedExample\([\s\S]*?\n    function fetchPhrase/,
  )?.[0];

  assert.ok(savedPlayback);
  assert.doesNotMatch(savedPlayback, /currentYouglishVideoId = example\.external_id/);
  assert.match(savedPlayback, /#\$\{example\.external_id\}/);
});

test("integrations keep provider keys server-side and expose only status", async () => {
  const page = await readFile(
    new URL("../app/integrations/page.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("../app/api/integrations/route.ts", import.meta.url),
    "utf8",
  );
  const crypto = await readFile(
    new URL("../lib/integration-secrets.ts", import.meta.url),
    "utf8",
  );
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );

  assert.match(page, /type="password"/);
  assert.match(page, /fetch\("\/api\/integrations"/);
  assert.match(route, /configured/);
  assert.doesNotMatch(route, /return Response\.json\([^\n]*key/);
  assert.match(crypto, /INTEGRATIONS_ENCRYPTION_KEY/);
  assert.match(crypto, /AES-GCM/);
  assert.match(crypto, /crypto\.subtle\.encrypt/);
  assert.match(crypto, /crypto\.subtle\.decrypt/);
  assert.match(schema, /export const integrationSecrets/);
  assert.match(crypto, /user_id/);
  assert.match(crypto, /encryption_version/);
  assert.match(crypto, /v2:/);
  assert.doesNotMatch(crypto, /createIntegrationSession/);
  assert.match(route, /getCurrentUser/);
  assert.match(route, /unauthorizedResponse/);
  assert.match(schema, /export const users/);
  assert.match(schema, /export const phraseProgress/);
  assert.match(schema, /userId: text\("user_id"\)/);
});

test("Worker exchanges Access login identity for a D1 application session and strips client identity", async () => {
  const worker = await readFile(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  const context = await readFile(
    new URL("../lib/user-context.ts", import.meta.url),
    "utf8",
  );
  const access = await readFile(
    new URL("../lib/access-session.ts", import.meta.url),
    "utf8",
  );
  const appSession = await readFile(
    new URL("../lib/app-session.ts", import.meta.url),
    "utf8",
  );
  const sessionStore = await readFile(
    new URL("../lib/d1-app-sessions.ts", import.meta.url),
    "utf8",
  );

  assert.match(access, /jwtVerify/);
  assert.match(access, /Cf-Access-Jwt-Assertion/);
  assert.doesNotMatch(access, /CF_Authorization/);
  assert.match(worker, /verifyAccessJwtIdentity/);
  assert.match(worker, /issueAppSession/);
  assert.match(worker, /resolveAppSession/);
  assert.match(worker, /revokeAppSession/);
  assert.match(worker, /ACCESS_TEAM_DOMAIN/);
  assert.match(worker, /ACCESS_AUD/);
  assert.match(worker, /headers\.delete\(AUTHENTICATED_USER_HEADER\)/);
  assert.match(worker, /encodeUserContext/);
  assert.match(worker, /return unauthorizedResponse\(\)/);
  assert.match(context, /decodeUserContext/);
  assert.match(context, /AUTHENTICATED_USER_HEADER/);
  assert.match(appSession, /crypto\.getRandomValues/);
  assert.match(appSession, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(sessionStore, /JOIN users/);
});
