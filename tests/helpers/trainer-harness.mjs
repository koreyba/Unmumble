import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM, VirtualConsole } from "jsdom";

const trainerPath = new URL("../../public/trainer.html", import.meta.url);
const navigationPath = new URL("../../public/caption-navigation.js", import.meta.url);
const videoRestorePath = new URL("../../public/youglish-video-restore.js", import.meta.url);
const liveTracePath = new URL("../fixtures/youglish-live-caption-traces.json", import.meta.url);

export async function nextTurn() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

export async function liveTraceScenario(id) {
  const fixture = JSON.parse(await readFile(liveTracePath, "utf8"));
  const scenario = fixture.scenarios.find(candidate => candidate.id === id);
  assert.ok(scenario, `missing live trace scenario: ${id}`);
  return scenario;
}

function overrideConstants(source, constants) {
  let result = source;
  for (const [name, value] of Object.entries(constants)) {
    const pattern = new RegExp(`const ${name} = [^;]+;`);
    assert.match(result, pattern, `trainer source must declare ${name}`);
    result = result.replace(pattern, `const ${name} = ${value};`);
  }
  return result;
}

/**
 * Loads public/trainer.html in jsdom with a fake YouGlish widget.
 *
 * `constants` overrides `const NAME = value;` declarations in the trainer
 * script, for example timeouts that would otherwise slow down tests.
 */
export async function createTrainer({
  autoPlayerReady = true,
  constants = {},
  controlledTimeoutMs = null,
  playError = null,
  requireReadyAndPlayingForMove = false,
  replayError = null,
  trace = false,
  url = "",
} = {}) {
  let nowMs = 1_000;
  const [rawTrainerSource, navigationSource, videoRestoreSource] = await Promise.all([
    readFile(trainerPath, "utf8"),
    readFile(navigationPath, "utf8"),
    readFile(videoRestorePath, "utf8"),
  ]);
  const overrides = { ...constants };
  if (controlledTimeoutMs !== null) overrides.CONTROLLED_CAPTION_TIMEOUT_MS = controlledTimeoutMs;
  const trainerSource = overrideConstants(rawTrainerSource, overrides);
  const html = trainerSource
    .replace(
      '<script src="/caption-navigation.js"></script>',
      `<script>${navigationSource}</script>`,
    )
    .replace(
      '<script src="/youglish-video-restore.js"></script>',
      `<script>${videoRestoreSource}</script>`,
    );
  const widgetCalls = {
    close: 0,
    commands: [],
    create: [],
    droppedMove: [],
    fetch: [],
    move: [],
    next: 0,
    pause: 0,
    play: 0,
    replay: 0,
  };
  const repeatNavigations = [];
  let widgetEvents;
  let providerPlaying = false;
  let providerReady = false;

  class FakeWidget {
    constructor(elementId, options) {
      widgetEvents = options.events;
      widgetCalls.create.push(elementId);
    }

    close() {
      widgetCalls.close += 1;
    }

    fetch(...args) {
      widgetCalls.fetch.push(args);
      widgetCalls.commands.push({ command: "fetch", args });
    }

    move(delta) {
      if (requireReadyAndPlayingForMove && (!providerReady || !providerPlaying)) {
        widgetCalls.droppedMove.push(delta);
        return;
      }
      widgetCalls.move.push(delta);
      widgetCalls.commands.push({ command: "move", delta });
    }

    next() {
      widgetCalls.next += 1;
      widgetCalls.commands.push({ command: "next" });
    }

    pause() {
      widgetCalls.pause += 1;
      widgetCalls.commands.push({ command: "pause" });
    }

    play() {
      widgetCalls.play += 1;
      widgetCalls.commands.push({ command: "play" });
      if (playError) throw playError;
    }

    replay() {
      widgetCalls.replay += 1;
      widgetCalls.commands.push({ command: "replay" });
      if (replayError) throw replayError;
    }

    setSpeed(speed) {
      widgetCalls.commands.push({ command: "setSpeed", speed });
    }
  }

  const virtualConsole = new VirtualConsole();
  const scriptErrors = [];
  virtualConsole.on("jsdomError", error => scriptErrors.push(error));
  virtualConsole.on("error", error => scriptErrors.push(error));

  const dom = new JSDOM(html, {
    beforeParse(window) {
      Object.defineProperty(window.performance, "now", {
        configurable: true,
        value: () => nowMs,
      });
      window.YG = { Widget: FakeWidget };
      window.__unmumbleNavigateForRepeat = url => repeatNavigations.push(url);
      window.fetch = async () => ({
        ok: true,
        type: "basic",
        json: async () => ({}),
      });
      window.HTMLMediaElement.prototype.load = function load() {};
      window.HTMLMediaElement.prototype.pause = function pause() {};
      window.HTMLMediaElement.prototype.play = async function play() {};
      window.localStorage.setItem(
        "connected-speech-trainer-v1:anonymous",
        JSON.stringify({ source: "youglish", exampleOrder: "ordered" }),
      );
    },
    pretendToBeVisual: true,
    runScripts: "dangerously",
    url: url || (trace
      ? "http://127.0.0.1/trainer?phrase=test&phraseId=phrase-1&captionTrace=1"
      : "https://listen-to-learn.test/trainer?phrase=test&phraseId=phrase-1"),
    virtualConsole,
  });

  await nextTurn();
  assert.equal(scriptErrors.length, 0, scriptErrors.map(error => error.message).join("\n"));
  assert.equal(typeof dom.window.onYouglishAPIReady, "function");
  dom.window.onYouglishAPIReady();
  assert.ok(widgetEvents, "the fake widget must receive YouGlish event callbacks");
  const emitPlayerReady = () => {
    providerReady = true;
    widgetEvents.onPlayerReady();
  };
  const emitPlayerStateChange = event => {
    providerPlaying = Number(event?.state) === 1;
    widgetEvents.onPlayerStateChange(event);
  };
  if (autoPlayerReady) emitPlayerReady();

  const document = dom.window.document;
  const controls = {
    captionText: document.getElementById("captionText"),
    next: document.getElementById("nextCaptionBtn"),
    previous: document.getElementById("prevCaptionBtn"),
    playPause: document.getElementById("playPauseBtn"),
    replay: document.getElementById("replayBtn"),
    repeat: document.getElementById("repeatCaptionBtn"),
    source: source => document.querySelector(`button[data-source="${source}"]`),
    status: document.getElementById("captionNavigationHint"),
    watchFullVideo: document.getElementById("watchFullVideoBtn"),
  };

  return {
    advanceTime: milliseconds => { nowMs += milliseconds; },
    close: () => dom.window.close(),
    controls,
    document,
    events: {
      ...widgetEvents,
      onPlayerReady: emitPlayerReady,
      onPlayerStateChange: emitPlayerStateChange,
    },
    providerStatus: document.getElementById("status"),
    restoreBanner: document.getElementById("fullVideoRestoreStatus"),
    repeatNavigations,
    location: () => dom.window.location.href,
    scriptErrors,
    storedProgress: videoId => {
      const raw = dom.window.localStorage.getItem("unmumble-youtube-progress-v1:anonymous");
      return raw ? JSON.parse(raw).videos?.[videoId] || null : null;
    },
    storedVideos: () => {
      const raw = dom.window.localStorage.getItem("unmumble-guest-library-v1");
      return raw ? JSON.parse(raw).savedVideos || [] : [];
    },
    trace: () => JSON.parse(controls.previous.parentElement.dataset.trace || "{}"),
    widgetCalls,
  };
}

export function caption(id, time, text, video) {
  return {
    caption: encodeURIComponent(text ?? id),
    current_time: time,
    id,
    ...(video ? { video } : {}),
  };
}

export function captionWithoutId(time, text, video) {
  return {
    caption: encodeURIComponent(text),
    current_time: time,
    ...(video ? { video } : {}),
  };
}

export function assertDeltas(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) < 0.05,
      `expected movement ${value} to be within 0.05 seconds of ${expected[index]}`,
    );
  });
}

export function observeVideo(trainer, videoId, entries) {
  trainer.events.onVideoChange({ trackNumber: 0, video: videoId });
  for (const entry of entries) trainer.events.onCaptionChange(entry);
}
