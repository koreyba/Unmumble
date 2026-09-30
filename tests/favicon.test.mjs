import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("favicon exposes the enlarged U-wave mark on a white field", async () => {
  const svg = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  const actual = {
    viewBox: svg.match(/viewBox="([^"]+)"/)?.[1],
    parts: [...svg.matchAll(/id="(background|left-outer|left-inner|u-wave|right-inner|right-outer)"/g)].map(
      (match) => match[1],
    ),
    backgroundFill: svg.match(/id="background"[^>]*fill="([^"]+)"/)?.[1],
  };

  assert.deepEqual(actual, {
    viewBox: "0 0 64 64",
    parts: ["background", "left-outer", "left-inner", "u-wave", "right-inner", "right-outer"],
    backgroundFill: "#FFFFFF",
  });
});

test("favicon uses the cyan-to-blue reference gradient", async () => {
  const svg = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  const gradient = svg.match(/<linearGradient id="signal-gradient"[^>]*>([\s\S]*?)<\/linearGradient>/)?.[1] ?? "";

  assert.deepEqual([...gradient.matchAll(/stop-color="(#[0-9A-F]{6})"/g)].map((match) => match[1]), [
    "#00E8C6",
    "#00AEEA",
    "#1558D8",
  ]);
});

test("root layout serves the favicon from the current host", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /<link rel="icon" href="\/favicon\.svg\?v=8" type="image\/svg\+xml" \/>/);
});

test("standalone trainer serves the same favicon as the app pages", async () => {
  const trainer = await readFile(new URL("../public/trainer.html", import.meta.url), "utf8");
  const head = trainer.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";

  assert.equal(head.includes('<link rel="icon" href="/favicon.svg?v=8" type="image/svg+xml" />'), true);
});
