"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { isYouTubeVideoId } from "@/lib/youtube-player";

export type SavedVideo = GuestSavedVideo & { progress?: YouTubeProgressEntry };
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

export function useSavedVideos() {
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
  const [busy, setBusy] = useState(false);
  const mutationInFlight = useRef(false);
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
    writeProgress(next.videos);
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
    // Keep Undo available while a request is pending or needs a retry.
    if (!notice || busy || (undoRemoval && error)) return;
    const timer = window.setTimeout(() => {
      setNotice("");
      setUndoRemoval(null);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [notice, busy, undoRemoval, error]);

  async function removeVideo(video: SavedVideo) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
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
      mutationInFlight.current = false;
      setBusy(false);
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
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  async function undoRemove() {
    if (!undoRemoval || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    const { video, index, progress: savedProgress } = undoRemoval;
    setError("");

    try {
      let restoredProgress = savedProgress;
      if (mode === "guest") {
        const record = { ...video };
        delete record.progress;
        const restored = guestLibrary.savedVideos.filter((item) => item.videoId !== video.videoId);
        restored.splice(Math.min(index, restored.length), 0, record);
        persistGuest({ ...guestLibrary, savedVideos: restored });
      } else {
        const response = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...video, progress: savedProgress ?? video.progress }),
        });
        const data = await response.json() as { video?: SavedVideo; error?: string };
        const restored = data.video;
        if (!response.ok || !restored) throw new Error(data.error || "Could not restore the video.");
        // POST returns the canonical record, including its new id and progress.
        setVideos((items) => [restored, ...items.filter((item) => item.videoId !== restored.videoId)]);
        restoredProgress = restored.progress ?? savedProgress;
      }
      if (restoredProgress) writeProgress({ ...progress, [video.videoId]: restoredProgress });
      setUndoRemoval(null);
      setNotice("Video restored.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not restore the video.");
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  return {
    mode, viewer, videos, progress, loading, busy, error, notice,
    canUndo: undoRemoval !== null,
    selectVideo, removeVideo, undoRemove,
  };
}
