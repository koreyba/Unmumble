import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { socialPreviewMetadata } from "../lib/social-preview.ts";
import { isPublicGuestRequest } from "../lib/guest-access.ts";

test("sharing uses the light artwork by default and dark only for an explicit dark preview", () => {
  for (const [value, image, url] of [
    [undefined, "/og.png?v=2", "/"],
    ["light", "/og.png?v=2", "/"],
    ["unknown", "/og.png?v=2", "/"],
    [["dark", "light"], "/og.png?v=2", "/"],
    ["dark", "/og-dark.png?v=2", "/?preview=dark"],
  ]) {
    const metadata = socialPreviewMetadata(value);
    assert.equal(metadata.openGraph.url, url);
    assert.equal(metadata.openGraph.title, "Unmumble — Learn to understand spoken English.");
    assert.equal(metadata.twitter.card, "summary_large_image");
    for (const channel of [metadata.openGraph, metadata.twitter]) {
      assert.equal(channel.images[0].url, image);
      assert.equal(channel.images[0].width, 1200);
      assert.equal(channel.images[0].height, 630);
      assert.match(channel.images[0].alt, /Learn to understand spoken English/);
      assert.equal(channel.description, "Listen. Check. Repeat. Hear.");
    }
  }
});

test("both preview files are landscape PNGs accessible to unauthenticated scrapers", async () => {
  for (const filename of ["og.png", "og-dark.png"]) {
    const png = await readFile(new URL(`../public/${filename}`, import.meta.url));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    for (const method of ["GET", "HEAD"]) {
      assert.equal(isPublicGuestRequest(new Request(`https://unmumble.online/${filename}?v=2`, { method })), true);
    }
    assert.equal(isPublicGuestRequest(new Request(`https://unmumble.online/${filename}`, { method: "POST" })), false);
  }
});
