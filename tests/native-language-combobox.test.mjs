import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { JSDOM } from "jsdom";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

test("native language combobox searches DeepL options and supports keyboard selection", async () => {
  const rootDirectory = new URL("..", import.meta.url).pathname;
  const dom = new JSDOM("<div id='root'></div>", { pretendToBeVisual: true });
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    document: dom.window.document,
    window: dom.window,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { createRoot } = await import("react-dom/client");
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    plugins: [react()],
    resolve: { alias: { "@": rootDirectory } },
    root: rootDirectory,
    server: { middlewareMode: true },
  });
  const { NativeLanguageCombobox } = await server.environments.ssr.runner.import(
    "/app/components/native-language-combobox.tsx",
  );
  const selected = [];
  const root = createRoot(document.querySelector("#root"));
  try {
    await act(async () => root.render(createElement(NativeLanguageCombobox, {
      languages: [
        { code: "ru", name: "Russian" },
        { code: "uk", name: "Ukrainian" },
        { code: "de", name: "German" },
      ],
      value: "ru",
      onSelect: (code) => selected.push(code),
    })));
    const input = document.querySelector("[role='combobox']");
    assert.ok(input);
    assert.equal(input.value, "Russian");
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    assert.equal(input.getAttribute("aria-expanded"), "true");
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set.call(input, "uk");
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
    assert.deepEqual([...document.querySelectorAll("[role='option']")].map((item) => item.textContent.trim()), ["UkrainianUK"]);
    await act(async () => input.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    assert.deepEqual(selected, ["uk"]);
    assert.equal(input.getAttribute("aria-expanded"), "false");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
    await server.close();
  }
});
