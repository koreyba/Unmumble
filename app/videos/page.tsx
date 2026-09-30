"use client";

import { useCallback, useEffect, useState } from "react";
import { GuestSignInLink } from "@/app/components/default-account-widget";
import { SignedInSiteAccount } from "@/app/components/signed-in-site-account";
import { SiteNavigation } from "@/app/components/site-navigation";
import { Button, ButtonLink, Card, EmptyState, ListSkeleton, Notice, PlayIcon } from "@/app/components/ui";
import {
  accountSession,
  legacyYoutubeProgressStorageKeys,
  youtubeProgressStorageKey,
  type AccountSessionUser,
} from "@/lib/client-session";
import {
  readMigratedStorage,
  writeMigratedStorage,
} from "@/lib/browser-storage";
import {
  GUEST_LIBRARY_STORAGE_KEY,
  LEGACY_GUEST_LIBRARY_STORAGE_KEYS,
  normalizeGuestLibrary,
  removeGuestSavedVideo,
  type GuestLibraryState,
  type GuestSavedVideo,
} from "@/lib/guest-library";
import {
  clearYouTubeProgress,
  mergeYouTubeProgress,
  normalizeYouTubeProgress,
  readYouTubeResume,
  type YouTubeProgressEntry,
} from "@/lib/youtube-progress";
import { buildFullVideoTrainerUrl } from "@/lib/youglish-full-video";
import {
  isYouTubeVideoId,
  youtubeThumbnailUrl,
} from "@/lib/youtube-player";

type SavedVideo = GuestSavedVideo & { progress?: YouTubeProgressEntry };
type VideosResponse = { videos?: SavedVideo[]; error?: string };

function readGuestLibrary() {
  try {
    const raw = readMigratedStorage(
      window.localStorage,
      GUEST_LIBRARY_STORAGE_KEY,
      LEGACY_GUEST_LIBRARY_STORAGE_KEYS,
    );
    return normalizeGuestLibrary(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeGuestLibrary(null);
  }
}

function readProgressState(storageKey: string, legacyKeys: readonly string[]) {
  try {
    const raw = readMigratedStorage(
      window.localStorage,
      storageKey,
      legacyKeys,
    );
    return normalizeYouTubeProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeYouTubeProgress(null);
  }
}

function openLegacyDirectLink(progress: Record<string, YouTubeProgressEntry>) {
  const searchParams = new URLSearchParams(window.location.search);
  const requestedVideo = searchParams.get("video") || "";
  const requestedRestoreAnchor = searchParams.get("restoreAnchorTime");
  const restoreAnchorTime = requestedRestoreAnchor === null || !requestedRestoreAnchor.trim()
    ? null
    : Number(requestedRestoreAnchor);
  const directOrigin = {
    videoId: requestedVideo,
    originPhraseId: (searchParams.get("phraseId") || "").slice(0, 120),
    originQuery: (searchParams.get("query") || "").slice(0, 240),
    restoreQuery: (searchParams.get("restoreQuery") || "").slice(0, 240),
    restoreAnchorTime: restoreAnchorTime ?? Number.NaN,
    originCaption: (searchParams.get("caption") || "").slice(0, 1_000),
    language: "english",
    accent: (searchParams.get("accent") || "").slice(0, 20),
  };
  if (!isYouTubeVideoId(requestedVideo)
      || !directOrigin.originQuery
      || !directOrigin.restoreQuery
      || restoreAnchorTime === null
      || !Number.isFinite(restoreAnchorTime)) return;
  const resume = readYouTubeResume({ version: 1, videos: progress }, requestedVideo);
  const fullVideoUrl = buildFullVideoTrainerUrl(directOrigin, resume);
  if (fullVideoUrl) window.location.replace(fullVideoUrl);
}

function formatProgress(secondsValue: number) {
  const seconds = Math.max(0, Math.floor(Number(secondsValue) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function VideosPage() {
  const [mode, setMode] = useState<"guest" | "account">("guest");
  const [viewer, setViewer] = useState<AccountSessionUser | null>(null);
  const [guestLibrary, setGuestLibrary] = useState<GuestLibraryState>(() => normalizeGuestLibrary(null));
  const [videos, setVideos] = useState<SavedVideo[]>([]);
  const [progress, setProgress] = useState<Record<string, YouTubeProgressEntry>>({});
  const [progressStorageKey, setProgressStorageKey] = useState(() => youtubeProgressStorageKey(null));
  const [progressLegacyStorageKeys, setProgressLegacyStorageKeys] = useState<readonly string[]>(
    () => legacyYoutubeProgressStorageKeys(null),
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const [undoRemoval, setUndoRemoval] = useState<{ video: SavedVideo; index: number; progress?: YouTubeProgressEntry } | null>(null);
  const [error, setError] = useState("");

  const loadGuest = useCallback(() => {
    const next = readGuestLibrary();
    const storageKey = youtubeProgressStorageKey(null);
    const legacyKeys = legacyYoutubeProgressStorageKeys(null);
    const guestProgress = readProgressState(storageKey, legacyKeys);
    setMode("guest");
    setViewer(null);
    setProgressStorageKey(storageKey);
    setProgressLegacyStorageKeys(legacyKeys);
    setGuestLibrary(next);
    setVideos(next.savedVideos);
    setProgress(guestProgress.videos);
    setLoading(false);
    openLegacyDirectLink(guestProgress.videos);
  }, []);

  const loadAccount = useCallback(async (sessionUser: AccountSessionUser) => {
    const storageKey = youtubeProgressStorageKey(sessionUser.id);
    const legacyKeys = legacyYoutubeProgressStorageKeys(sessionUser.id);
    setMode("account");
    setViewer(sessionUser);
    setProgressStorageKey(storageKey);
    setProgressLegacyStorageKeys(legacyKeys);
    try {
      const response = await fetch("/api/videos", { cache: "no-store" });
      const data = await response.json() as VideosResponse;
      if (!response.ok || !Array.isArray(data.videos)) {
        throw new Error(data.error || "account session unavailable");
      }
      setVideos(data.videos);
      const serverProgress = normalizeYouTubeProgress({
        videos: Object.fromEntries(data.videos
          .filter((video) => video.progress?.updatedAt)
          .map((video) => [video.videoId, video.progress])),
      });
      const mergedProgress = mergeYouTubeProgress(serverProgress, readProgressState(storageKey, legacyKeys));
      setProgress(mergedProgress.videos);
      setLoading(false);
      openLegacyDirectLink(mergedProgress.videos);
    } catch (reason) {
      setMode("account");
      setError(reason instanceof Error ? reason.message : "Could not load account videos.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initializationTimer = window.setTimeout(() => {
      void accountSession().then((sessionUser) => {
        if (sessionUser) void loadAccount(sessionUser);
        else loadGuest();
      });
    }, 0);
    return () => {
      window.clearTimeout(initializationTimer);
    };
  }, [loadAccount, loadGuest]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        [GUEST_LIBRARY_STORAGE_KEY, ...LEGACY_GUEST_LIBRARY_STORAGE_KEYS].includes(event.key || "")
        && mode === "guest"
      ) loadGuest();
      if (
        [progressStorageKey, ...progressLegacyStorageKeys].includes(event.key || "")
      ) setProgress(readProgressState(progressStorageKey, progressLegacyStorageKeys).videos);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadGuest, mode, progressLegacyStorageKeys, progressStorageKey]);

  function clearCurrentProgress(videoId: string) {
    const next = clearYouTubeProgress({ version: 1, videos: progress }, videoId);
    setProgress(next.videos);
    try {
      writeMigratedStorage(
        window.localStorage,
        progressStorageKey,
        progressLegacyStorageKeys,
        JSON.stringify(next),
      );
    } catch { /* optional mirror */ }
  }

  function persistGuest(next: GuestLibraryState) {
    const normalized = normalizeGuestLibrary(next);
    setGuestLibrary(normalized);
    setVideos(normalized.savedVideos);
    try {
      writeMigratedStorage(
        window.localStorage,
        GUEST_LIBRARY_STORAGE_KEY,
        LEGACY_GUEST_LIBRARY_STORAGE_KEYS,
        JSON.stringify(normalized),
      );
    } catch {
      setError("Could not update the guest video library in this browser.");
    }
  }

  function selectVideo(video: SavedVideo) {
    const resume = readYouTubeResume({ version: 1, videos: progress }, video.videoId);
    const fullVideoUrl = buildFullVideoTrainerUrl(video, resume);
    if (fullVideoUrl) window.location.assign(fullVideoUrl);
  }

  function writeProgress(next: Record<string, YouTubeProgressEntry>) {
    setProgress(next);
    try {
      writeMigratedStorage(
        window.localStorage,
        progressStorageKey,
        progressLegacyStorageKeys,
        JSON.stringify({ version: 1, videos: next }),
      );
    } catch { /* optional mirror */ }
  }

  // Removal is immediate and reversible: a short-lived notice offers Undo instead of a browser dialog.
  function offerUndo(removal: { video: SavedVideo; index: number; progress?: YouTubeProgressEntry }) {
    setUndoRemoval(removal);
    setNotice("Video removed from Continue watching. Its phrase clips were not changed.");
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setNotice("");
      setUndoRemoval(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function removeVideo(video: SavedVideo) {
    setBusyId(video.id);
    setError("");
    setNotice("");
    setUndoRemoval(null);
    const removal = {
      video,
      index: Math.max(0, videos.findIndex((item) => item.id === video.id)),
      progress: progress[video.videoId],
    };
    if (mode === "guest") {
      persistGuest(removeGuestSavedVideo(guestLibrary, video.id));
      clearCurrentProgress(video.videoId);
      offerUndo(removal);
      setBusyId("");
      return;
    }

    try {
      const response = await fetch(`/api/videos?id=${encodeURIComponent(video.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove the video.");
      setVideos((items) => items.filter((item) => item.id !== video.id));
      clearCurrentProgress(video.videoId);
      offerUndo(removal);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the video.");
    } finally {
      setBusyId("");
    }
  }

  async function undoRemove() {
    if (!undoRemoval) return;
    const { video, index, progress: savedProgress } = undoRemoval;
    setUndoRemoval(null);
    setNotice("");
    setError("");
    if (savedProgress) writeProgress({ ...progress, [video.videoId]: savedProgress });

    if (mode === "guest") {
      const record: GuestSavedVideo = { ...video };
      delete (record as SavedVideo).progress;
      const restored = [...guestLibrary.savedVideos];
      restored.splice(Math.min(index, restored.length), 0, record);
      persistGuest({ ...guestLibrary, savedVideos: restored });
      setNotice("Video restored.");
      return;
    }

    try {
      const response = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...video, progress: savedProgress ?? video.progress }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not restore the video.");
      if (viewer) await loadAccount(viewer);
      setNotice("Video restored.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restore the video.");
    }
  }

  return (
    <>
      <SiteNavigation
        active="videos"
        account={mode === "guest" || !viewer ? (
          <GuestSignInLink returnTo="/videos" />
        ) : (
          <SignedInSiteAccount user={viewer} />
        )}
      />
      <main className="page-shell videos-shell">
        <header className="page-header">
          <p className="eyebrow">Long-form listening</p>
          <h1>Videos</h1>
          <p>Continue a YouGlish video with the trainer&apos;s captions and learning controls. Signed-in resume syncs with your account.</p>
        </header>

        <div className="page-notices">
          {mode === "guest" && <Notice>Guest mode: viewing history and resume position stay only in this browser.</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          {notice && (
            <Notice
              action={undoRemoval ? <Button onClick={() => void undoRemove()} size="sm" variant="ghost">Undo</Button> : undefined}
              tone="success"
            >
              {notice}
            </Notice>
          )}
        </div>

        <section aria-labelledby="continue-watching-heading" className="saved-videos-section">
          <div className="section-heading">
            <h2 id="continue-watching-heading">Continue watching</h2>
            <p>{videos.length} watched {videos.length === 1 ? "video" : "videos"}</p>
          </div>

          {loading ? <ListSkeleton label="Loading videos" rows={2} /> : videos.length === 0 ? (
            <EmptyState
              action={<ButtonLink href="/practice" variant="primary">Open Practice</ButtonLink>}
              description="Choose Watch full video on a YouGlish result to add the first one."
              title="No videos watched yet"
            />
          ) : (
            <div className="video-grid">
              {videos.map((video, index) => {
                const savedProgress = progress[video.videoId]?.seconds || 0;
                return (
                  <Card as="article" className="video-card ui-rise" interactive key={video.id} style={{ "--ui-index": Math.min(index, 6) } as React.CSSProperties}>
                    <button
                      aria-label={`Continue ${video.originQuery || "YouTube video"}`}
                      className="video-thumbnail"
                      onClick={() => selectVideo(video)}
                      style={{ backgroundImage: `url(${youtubeThumbnailUrl(video.videoId)})` }}
                      type="button"
                    >
                      <span aria-hidden="true" className="video-thumbnail__play"><PlayIcon size={22} /></span>
                    </button>
                    <div className="video-card-body">
                      <h3>{video.originQuery || "YouTube video"}</h3>
                      {video.originCaption && <p>{video.originCaption}</p>}
                      <div className="video-card-meta">
                        <span>{savedProgress > 0 ? `Resume at ${formatProgress(savedProgress)}` : "Not started"}</span>
                        <span>Last opened {new Date(video.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="video-card-actions">
                        <Button onClick={() => selectVideo(video)} variant="primary">Continue</Button>
                        <Button disabled={busyId === video.id} onClick={() => void removeVideo(video)} quietDanger>Remove</Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
