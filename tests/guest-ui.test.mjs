import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readWorkspaceSource } from "./helpers/sources.mjs";

test("library page has a local guest mode and an explicit Google entry point", async () => {
  const [page, account] = await Promise.all([
    readWorkspaceSource(),
    readFile(new URL("../app/components/default-account-widget.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /GUEST_LIBRARY_STORAGE_KEY/);
  assert.match(page, /addGuestPhrase/);
  assert.match(page, /setGuestPhraseStatus/);
  assert.match(page, /<GuestSignInLink returnTo=\{returnTo\} \/>/);
  assert.match(account, /Sign in with Google/);
  // Guest progress is never wiped from a hidden control: there is no "Clear guest data" action.
  assert.doesNotMatch(page, /Clear guest data|resetGuest/);
});

test("trainer derives account mode from the optional session and never sends guest mutations to user APIs", async () => {
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");

  assert.match(trainer, /GUEST_LIBRARY_STORAGE_KEY/);
  assert.match(trainer, /isAuthenticated/);
  assert.match(trainer, /toggleGuestSavedExample/);
  assert.match(trainer, /guestLibrary/);
  assert.match(trainer, /Sign in with Google/);
  assert.match(trainer, /localStorage/);
  assert.match(trainer, /video-progress-sync\.js/);
  assert.match(trainer, /youglish-video-restore\.js/);
  assert.match(trainer, /accountVideoProgressSync/);

  assert.doesNotMatch(trainer, /listen-to-learn-authenticated-v1/);
  const sessionProbe = trainer.indexOf('fetch("/api/session"');
  const accountProbe = trainer.lastIndexOf("fetch(`/api/phrases${query}`");
  assert.ok(sessionProbe >= 0 && accountProbe > sessionProbe, "account data must follow verified session discovery");
  assert.match(trainer, /if \(!isAuthenticated\) \{[\s\S]*?toggleGuestSavedExample/);
});

test("React learning surfaces use optional session discovery instead of a local auth hint", async () => {
  const [workspace, videos, account] = await Promise.all([
    readWorkspaceSource(),
    readFile(new URL("../app/videos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/signed-in-site-account.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of [workspace, videos]) {
    assert.match(source, /accountSession/);
    assert.doesNotMatch(source, /listen-to-learn-authenticated-v1/);
    assert.doesNotMatch(source, />Log out</);
    assert.match(source, /SignedInSiteAccount/);
  }
  assert.match(account, />Sign out</);
});

test("every account surface routes sign out through the branded app flow", async () => {
  const sources = await Promise.all([
    readWorkspaceSource(),
    readFile(new URL("../app/videos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
    readFile(new URL("../app/components/signed-in-site-account.tsx", import.meta.url), "utf8"),
  ]);

  for (const source of sources) assert.doesNotMatch(source, /href\s*=\s*["']\/cdn-cgi\/access\/logout/);
  assert.match(sources[4], /SIGN_OUT_HREF/);
  assert.match(sources[3], /loginLink\.href = "\/logout"/);
});

test("every signed-in section shows the account email beside Sign out", async () => {
  const [workspace, videos, settings, trainer, navigationStyles, account] = await Promise.all([
    readWorkspaceSource(),
    readFile(new URL("../app/videos/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/integrations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
    readFile(new URL("../public/site-navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../app/components/signed-in-site-account.tsx", import.meta.url), "utf8")
      .catch(() => ""),
  ]);

  for (const source of [workspace, videos, settings]) {
    assert.match(source, /SignedInSiteAccount/);
  }
  assert.match(account, /site-account-name/);
  assert.match(account, /user\.email/);
  assert.match(account, /Sign out/);

  assert.match(trainer, /id="accountEmail"/);
  assert.match(trainer, /sessionUser\.email/);
  assert.match(trainer, /Sign out/);
  assert.doesNotMatch(
    navigationStyles,
    /\.site-account-name\s*\{\s*display:\s*none;/,
    "mobile navigation must keep the signed-in email visible",
  );
});

test("Settings stays guest after logout until the learner explicitly signs in", async () => {
  const [settings, navigation, trainer, worker] = await Promise.all([
    readFile(new URL("../app/integrations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/site-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/trainer.html", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(settings, /accountSession/);
  assert.match(settings, /signInHref\("\/settings"\)/);
  assert.match(settings, /if \(!session\)/);
  const loadingBranch = settings.indexOf("if (loading)");
  const guestBranch = settings.indexOf("if (!session)");
  assert.ok(
    loadingBranch >= 0 && loadingBranch < guestBranch,
    "Settings must not expose account controls before session discovery finishes",
  );
  assert.match(navigation, /href: "\/settings",\s*label: "Settings"/);
  assert.match(trainer, /href="\/settings"[^>]*>[\s\S]*?site-primary-link-label">Settings</);
  assert.match(worker, /new URL\("\/settings", requestUrl\)/);
  assert.doesNotMatch(worker, /loginUrl\.searchParams\.set\("returnTo", pathname\)/);
});

test("worker sanitizes identity headers before allowing a guest request", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const guestBranch = worker.indexOf("if (!identity)");
  const internalHeaderDeletion = worker.indexOf("headers.delete(AUTHENTICATED_USER_HEADER)");

  assert.ok(guestBranch >= 0);
  assert.ok(internalHeaderDeletion >= 0);
  assert.ok(internalHeaderDeletion < guestBranch);
});

test("worker resolves the optional session before generic public routing", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const sessionBranch = worker.indexOf('pathname === "/api/session"');
  const publicBranch = worker.indexOf("if (isPublicGuestRequest(request))");

  assert.ok(sessionBranch >= 0, "worker must expose the optional session endpoint");
  assert.ok(sessionBranch < publicBranch, "session must be resolved before generic public routing");
  assert.match(worker, /resolveAppSession\(request, sessionStore/);
  assert.match(worker, /optionalSessionResponse\(identity\)/);
});

test("worker exchanges Access only at login and authorizes every account API with the app session", async () => {
  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const login = worker.indexOf('pathname === "/login"');
  const session = worker.indexOf('pathname === "/api/session"');
  const publicRouting = worker.indexOf("if (isPublicGuestRequest(request))");
  const requiredIdentity = worker.indexOf("await resolveAppSession(request, sessionStore", publicRouting);

  assert.match(worker, /pathname === "\/api\/logout" && request\.method === "POST"/);
  assert.ok(login >= 0 && login < session, "explicit login must own the Access exchange");
  assert.match(worker, /verifyAccessIdentity\(request, env\)/);
  assert.doesNotMatch(worker, /allowCookie/);
  assert.ok(requiredIdentity > publicRouting, "account APIs must resolve the app session after public routing");
  assert.match(worker, /issueAppSession\(request, identity, sessionStore/);
  assert.match(worker, /revokeAppSession\(request, sessionStore\)/);
  assert.doesNotMatch(worker, /hasAppSignedOutMarker/);
  assert.doesNotMatch(worker, /cdn-cgi\/access\/logout/);
});

test("all pages consistently use 'Sign in with Google' and SiteNavigation provides it on Home page", async () => {
  const [chat, workspace, navigation, defaultAccount, logout] = await Promise.all([
    readFile(new URL("../app/components/ai-practice-chat.tsx", import.meta.url), "utf8"),
    readWorkspaceSource(),
    readFile(new URL("../app/components/site-navigation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/default-account-widget.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/logout/page.tsx", import.meta.url), "utf8"),
  ]);

  // AI chat uses 'Sign in with Google' in header instead of bare 'Sign in'
  assert.match(chat, /GuestSignInLink/);
  assert.match(chat, /<ButtonLink[\s\S]*?>\s*Sign in with Google\s*<\/ButtonLink>/);
  assert.doesNotMatch(chat, />Sign in<\/(?:a|ButtonLink)>/);

  // Phrase workspace mobile guest card uses 'Sign in with Google'
  assert.doesNotMatch(workspace, /className="site-account-link"[\s\S]*?>\s*Sign in\s*<\/a>/);

  // SiteNavigation delegates default account to DefaultAccountWidget with 'Sign in with Google'
  assert.match(navigation, /DefaultAccountWidget/);
  assert.match(defaultAccount, /Sign in with Google/);

  // Logout page suppresses account widget mid-sign-out
  assert.match(logout, /<SiteNavigation active="library" account=\{null\} \/>/);
});

test("removing a saved video is immediate and undoable instead of asking with a native dialog", async () => {
  const videos = await readFile(new URL("../app/videos/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(videos, /window\.confirm|\bconfirm\(/);
  assert.match(videos, /async function undoRemove\(\)/);
  assert.match(videos, /<Button onClick=\{\(\) => void undoRemove\(\)\}[^>]*>Undo<\/Button>/);
  // The notice clears itself so a stale Undo never lingers.
  assert.match(videos, /window\.setTimeout\(\(\) => \{\s*setNotice\(""\);\s*setUndoRemoval\(null\);/);
});
