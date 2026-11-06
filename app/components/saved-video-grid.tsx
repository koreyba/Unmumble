"use client";

import type { CSSProperties } from "react";
import { Button, ButtonLink, Card, EmptyState, ListSkeleton, PlayIcon } from "@/app/components/ui";
import type { SavedVideo } from "@/app/components/use-saved-videos";
import type { YouTubeProgressEntry } from "@/lib/youtube-progress";
import { youtubeThumbnailUrl } from "@/lib/youtube-player";

function formatProgress(secondsValue: number) {
  const seconds = Math.max(0, Math.floor(Number(secondsValue) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function SavedVideoGrid({ videos, progress, loading, busy, onSelect, onRemove }: {
  videos: SavedVideo[];
  progress: Record<string, YouTubeProgressEntry>;
  loading: boolean;
  busy: boolean;
  onSelect: (video: SavedVideo) => void;
  onRemove: (video: SavedVideo) => Promise<void>;
}) {
  if (loading) return <ListSkeleton label="Loading videos" rows={2} />;
  if (videos.length === 0) {
    return (
      <EmptyState
        action={<ButtonLink href="/practice" variant="primary">Open Practice</ButtonLink>}
        description="Choose Watch full video on a YouGlish result to add the first one."
        title="No videos watched yet"
      />
    );
  }
  return (
    <div className="video-grid">
      {videos.map((video, index) => {
        const savedProgress = progress[video.videoId]?.seconds || 0;
        return (
          <Card as="article" className="video-card ui-rise" interactive key={video.id} style={{ "--ui-index": Math.min(index, 6) } as CSSProperties}>
            <button
              aria-label={`Continue ${video.originQuery || "YouTube video"}`}
              className="video-thumbnail"
              onClick={() => onSelect(video)}
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
                <Button onClick={() => onSelect(video)} variant="primary">Continue</Button>
                <Button disabled={busy} onClick={() => void onRemove(video)} quietDanger>Remove</Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
