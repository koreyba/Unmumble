import { readFile } from "node:fs/promises";

const GLOBALS = new URL("../../app/globals.css", import.meta.url);
const SURFACE_IMPORT = /@import "\.\/styles\/([\w-]+\.css)";\n?/g;

/**
 * app/globals.css composes the shared kits (@import "../public/…") with the
 * per-surface files in app/styles. Tests assert on the combined stylesheet, so
 * this inlines the surface files while leaving the shared imports untouched.
 */
export async function readGlobalStyles() {
  let css = await readFile(GLOBALS, "utf8");
  const files = [...css.matchAll(SURFACE_IMPORT)].map((match) => match[1]);
  const contents = new Map(await Promise.all(files.map(async (file) => [
    file,
    await readFile(new URL(`../../app/styles/${file}`, import.meta.url), "utf8"),
  ])));
  css = css.replace(SURFACE_IMPORT, (_match, file) => contents.get(file));
  return css;
}

export async function readSurfaceStyles(name) {
  return readFile(new URL(`../../app/styles/${name}.css`, import.meta.url), "utf8");
}
