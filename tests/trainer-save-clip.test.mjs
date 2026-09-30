import assert from "node:assert/strict";
import test from "node:test";
import { createTrainer, nextTurn } from "./helpers/trainer-harness.mjs";

async function until(predicate, turns = 40) {
  for (let turn = 0; turn < turns; turn += 1) {
    if (predicate()) return;
    await nextTurn();
  }
  assert.ok(predicate(), "condition was not met in time");
}

const NEW_PHRASE_URL = "https://listen-to-learn.test/trainer?phrase=fresh%20phrase";

test("Save clip is enabled for a phrase that is not in the library yet", async () => {
  const trainer = await createTrainer({ url: NEW_PHRASE_URL });
  try {
    await until(() => trainer.document.getElementById("saveExampleBtn").getAttribute("aria-label") === "Save current clip");
    trainer.events.onVideoChange({ trackNumber: 0, video: "abcdefghijk" });
    const button = trainer.document.getElementById("saveExampleBtn");
    assert.equal(button.disabled, false);
    assert.equal(trainer.document.getElementById("exampleMessage").textContent, "");
    assert.doesNotMatch(trainer.document.body.textContent, /first add the phrase to To Learn/);
    assert.equal(new URL(trainer.location()).searchParams.has("phraseId"), false);
  } finally {
    trainer.close();
  }
});

test("saving a clip adds the phrase to To Learn first, then toggles the clip", async () => {
  const trainer = await createTrainer({ url: NEW_PHRASE_URL });
  try {
    await until(() => trainer.document.getElementById("saveExampleBtn").getAttribute("aria-label") === "Save current clip");
    trainer.events.onVideoChange({ trackNumber: 0, video: "abcdefghijk" });
    const button = trainer.document.getElementById("saveExampleBtn");
    const label = () => button.querySelector(".button-label").textContent;
    const library = () => JSON.parse(trainer.document.defaultView.localStorage.getItem("unmumble-guest-library-v1"));

    button.click();
    await until(() => label() === "Remove clip");

    const saved = library();
    assert.equal(saved.customPhrases.length, 1);
    assert.equal(saved.customPhrases[0].text, "fresh phrase");
    assert.equal(saved.customPhrases[0].status, "to_learn");
    assert.equal(saved.savedExamples.length, 1);
    assert.equal(saved.savedExamples[0].provider, "youglish");
    assert.equal(saved.savedExamples[0].externalId, "abcdefghijk");
    assert.equal(saved.savedExamples[0].phraseId, saved.customPhrases[0].id);
    assert.equal(new URL(trainer.location()).searchParams.get("phraseId"), saved.customPhrases[0].id);
    assert.equal(trainer.document.getElementById("exampleMessage").textContent, "Clip saved; phrase added to To Learn.");
    assert.equal(trainer.document.getElementById("savedExampleCount").textContent, "1");
    assert.equal(button.disabled, false);
    assert.equal(button.hasAttribute("aria-busy"), false);

    button.click();
    await until(() => label() === "Save clip");
    assert.equal(library().savedExamples.length, 0);
    assert.equal(library().customPhrases.length, 1, "removing the clip keeps the phrase in To Learn");
    assert.equal(trainer.document.getElementById("exampleMessage").textContent, "Clip removed from saved examples.");
  } finally {
    trainer.close();
  }
});

test("Save clip stays disabled only while there is no current clip", async () => {
  const trainer = await createTrainer({ url: NEW_PHRASE_URL });
  try {
    await until(() => trainer.document.getElementById("saveExampleBtn").getAttribute("aria-label") === "Save current clip");
    assert.equal(trainer.document.getElementById("saveExampleBtn").disabled, true);
    trainer.events.onVideoChange({ trackNumber: 0, video: "abcdefghijk" });
    assert.equal(trainer.document.getElementById("saveExampleBtn").disabled, false);
    assert.equal(trainer.document.querySelector('[data-example-mode="saved"]').disabled, true, "Saved filter needs saved examples");
  } finally {
    trainer.close();
  }
});

function accountFetch({ addPhrase }) {
  const calls = [];
  const respond = (status, body) => ({ ok: status < 400, status, type: "basic", json: async () => body });
  const fetchImpl = async (url, options = {}) => {
    const path = String(url);
    calls.push(`${options.method || "GET"} ${path}`);
    if (path.startsWith("/api/session")) return respond(200, { user: { id: "user-1", email: "a@example.com" } });
    if (path.startsWith("/api/phrases") && options.method === "POST") return addPhrase();
    if (path.startsWith("/api/phrases")) return respond(200, { user: { id: "user-1" }, phrases: [], examples: [] });
    if (path.startsWith("/api/examples") && options.method === "POST") {
      const payload = JSON.parse(options.body);
      return respond(200, { example: { id: "example-1", provider: payload.provider, external_id: payload.externalId, phraseId: payload.phraseId } });
    }
    if (path.startsWith("/api/examples")) return respond(200, { examples: [] });
    return respond(200, {});
  };
  return { calls, fetchImpl };
}

test("a signed-in learner's clip is saved through the account API after the phrase is added", async () => {
  const account = accountFetch({ addPhrase: () => ({ ok: true, status: 200, json: async () => ({ id: "phrase-9", status: "to_learn", created: true }) }) });
  const trainer = await createTrainer({ url: NEW_PHRASE_URL, fetchImpl: account.fetchImpl });
  try {
    await until(() => trainer.document.getElementById("loginLink").textContent === "Sign out");
    trainer.events.onVideoChange({ trackNumber: 0, video: "abcdefghijk" });
    trainer.document.getElementById("saveExampleBtn").click();
    await until(() => trainer.document.querySelector("#saveExampleBtn .button-label").textContent === "Remove clip");
    const phraseAdded = account.calls.indexOf("POST /api/phrases");
    const exampleSaved = account.calls.indexOf("POST /api/examples");
    assert.ok(phraseAdded >= 0 && exampleSaved > phraseAdded, `phrase first, then clip: ${account.calls.join(", ")}`);
    assert.equal(new URL(trainer.location()).searchParams.get("phraseId"), "phrase-9");
    assert.equal(trainer.document.getElementById("exampleMessage").textContent, "Clip saved; phrase added to To Learn.");
  } finally {
    trainer.close();
  }
});

test("when adding the phrase fails nothing is saved and the button is usable again", async () => {
  const account = accountFetch({ addPhrase: () => ({ ok: false, status: 500, json: async () => ({ error: "boom" }) }) });
  const trainer = await createTrainer({ url: NEW_PHRASE_URL, fetchImpl: account.fetchImpl });
  try {
    await until(() => trainer.document.getElementById("loginLink").textContent === "Sign out");
    trainer.events.onVideoChange({ trackNumber: 0, video: "abcdefghijk" });
    const button = trainer.document.getElementById("saveExampleBtn");
    button.click();
    await until(() => /Could not add the phrase to To Learn: boom/.test(trainer.document.getElementById("exampleMessage").textContent));
    await until(() => !button.disabled);
    assert.equal(button.hasAttribute("aria-busy"), false);
    assert.equal(button.querySelector(".button-label").textContent, "Save clip");
    assert.equal(account.calls.includes("POST /api/examples"), false, "no clip may be saved without its phrase");
    assert.equal(new URL(trainer.location()).searchParams.has("phraseId"), false);
    assert.equal(trainer.document.getElementById("exampleMessage").classList.contains("error"), true);
  } finally {
    trainer.close();
  }
});
