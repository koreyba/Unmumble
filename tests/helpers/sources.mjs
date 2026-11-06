import { readdir, readFile } from "node:fs/promises";

/**
 * The Library/Practice workspace is one stateful container plus presentational
 * pieces in app/components/workspace. Source-level assertions read them together.
 */
export async function readWorkspaceSource() {
  const directory = new URL("../../app/components/workspace/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => /\.tsx?$/.test(name)).sort();
  const parts = await Promise.all([
    readFile(new URL("../../app/components/phrase-workspace.tsx", import.meta.url), "utf8"),
    ...files.map((name) => readFile(new URL(name, directory), "utf8")),
  ]);
  return parts.join("\n");
}

export async function readWorkspaceFile(name) {
  return readFile(new URL(`../../app/components/workspace/${name}`, import.meta.url), "utf8");
}

/** Videos separates the page, data lifecycle, and card presentation. */
export async function readVideosSource() {
  const parts = await Promise.all([
    "app/videos/page.tsx",
    "app/components/use-saved-videos.ts",
    "app/components/saved-video-grid.tsx",
  ].map((path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")));
  return parts.join("\n");
}

/** Shared UI kit stylesheet (public/ui.css), which the Trainer also loads. */
export async function readUiKitStyles() {
  return readFile(new URL("../../public/ui.css", import.meta.url), "utf8");
}
