"use client";

import { GuestSignInLink } from "@/app/components/default-account-widget";
import { SignedInSiteAccount } from "@/app/components/signed-in-site-account";
import { SiteNavigation } from "@/app/components/site-navigation";
import { SavedVideoGrid } from "@/app/components/saved-video-grid";
import { useSavedVideos } from "@/app/components/use-saved-videos";
import { Button, Notice } from "@/app/components/ui";

export default function VideosPage() {
  const {
    mode, viewer, videos, progress, loading, busy, error, notice,
    canUndo, selectVideo, removeVideo, undoRemove,
  } = useSavedVideos();

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
              action={canUndo ? <Button loading={busy} onClick={() => void undoRemove()} size="sm" variant="ghost">Undo</Button> : undefined}
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

          <SavedVideoGrid
            videos={videos}
            progress={progress}
            loading={loading}
            busy={busy}
            onSelect={selectVideo}
            onRemove={removeVideo}
          />
        </section>
      </main>
    </>
  );
}
