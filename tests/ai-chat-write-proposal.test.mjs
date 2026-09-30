import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const rootDirectory = new URL("..", import.meta.url).pathname;
const server = await createServer({
  appType: "custom",
  configFile: false,
  logLevel: "silent",
  plugins: [react()],
  resolve: { alias: { "@": rootDirectory } },
  root: rootDirectory,
  server: { middlewareMode: true },
});
const proposalModule = await server.environments.ssr.runner.import(
  "/app/components/ai-chat-write-proposal.tsx",
).catch(() => ({}));

test.after(async () => server.close());

async function renderProposal(props, inspect) {
  assert.equal(
    typeof proposalModule.AiChatWriteProposal,
    "function",
    "AiChatWriteProposal must be exported",
  );
  const dom = new JSDOM("<div id='root'></div>", {
    pretendToBeVisual: true,
    url: "http://127.0.0.1/chat",
  });
  const previousGlobals = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Node: globalThis.Node,
    window: globalThis.window,
    actEnvironment: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node,
    window: dom.window,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const host = document.querySelector("#root");
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(
      proposalModule.AiChatWriteProposal,
      props,
    )));
    await inspect({ dom, host, root });
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, {
      document: previousGlobals.document,
      HTMLElement: previousGlobals.HTMLElement,
      Node: previousGlobals.Node,
      window: previousGlobals.window,
      IS_REACT_ACT_ENVIRONMENT: previousGlobals.actEnvironment,
    });
  }
}

const items = [
  { id: "uncanny", text: "uncanny", translation: "strange or mysterious" },
  { id: "break-even", text: "break even", translation: "cover the costs" },
];

const changeSetItems = [
  {
    id: "add-serendipity",
    actionType: "add_entry",
    text: "serendipity",
    translation: "удачная случайность",
  },
  {
    id: "add-get-by",
    actionType: "add_entry",
    text: "get by",
    translation: "справляться",
  },
  {
    id: "meaning-bank",
    actionType: "add_meaning",
    text: "bank",
    translation: "берег",
  },
  {
    id: "update-pitch",
    actionType: "update_meaning",
    text: "pitch",
    previousTranslation: "бросок",
    translation: "высота звука",
  },
  {
    id: "move-uncanny",
    actionType: "change_state",
    text: "uncanny",
    fromCategory: "learning",
    toCategory: "learned",
  },
  {
    id: "remove-obsolete",
    actionType: "change_state",
    text: "obsolete",
    fromCategory: "to_learn",
    toCategory: "removed",
  },
];

test("a mixed vocabulary change set is one grouped inline confirmation", async () => {
  const actions = [];

  await renderProposal({
    proposalId: "proposal-change-set",
    operation: "vocabulary_change_set",
    items: changeSetItems,
    collapsedItemCount: 30,
    status: "pending",
    onConfirm: (proposalId) => actions.push(["confirm", proposalId]),
    onCancel: (proposalId) => actions.push(["cancel", proposalId]),
  }, async ({ host }) => {
    const card = host.querySelector("section.ai-chat-write-proposal");
    assert.equal(card?.querySelector("h3")?.textContent, "Review vocabulary changes");
    assert.equal(card?.querySelector(".ai-chat-write-proposal-count")?.textContent, "6 changes");

    const groups = [...card.querySelectorAll(".ai-chat-write-proposal-group")];
    assert.deepEqual(
      groups.map((group) => ({
        action: group.getAttribute("data-action-group"),
        heading: group.querySelector("h4")?.textContent,
        items: [...group.querySelectorAll("li")].map((item) => item.textContent),
      })),
      [
        {
          action: "add_entry",
          heading: "Add2 changes",
          items: [
            "serendipityудачная случайность",
            "get byсправляться",
          ],
        },
        {
          action: "add_meaning",
          heading: "Add meaning1 change",
          items: ["bankберег"],
        },
        {
          action: "update_meaning",
          heading: "Update meaning1 change",
          items: ["pitchбросок → высота звука"],
        },
        {
          action: "change_state",
          heading: "Move / remove2 changes",
          items: [
            "uncannyLearning → Learned",
            "obsoleteTo Learn → Removed from Practice",
          ],
        },
      ],
    );
    assert.equal(
      card.querySelector('[role="status"]')?.textContent,
      "Review 6 vocabulary changes before applying them.",
    );

    const buttons = [...card.querySelectorAll(".ai-chat-write-proposal-actions button")];
    assert.deepEqual(buttons.map((button) => button.textContent), ["Cancel", "Confirm changes"]);
    await act(async () => buttons[1].click());
    await act(async () => buttons[0].click());
  });

  assert.deepEqual(actions, [
    ["confirm", "proposal-change-set"],
    ["cancel", "proposal-change-set"],
  ]);
});

test("a collapsed change set previews every action group before expanding to 30 changes", async () => {
  const thirtyItems = [
    ...changeSetItems,
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `extra-${index + 1}`,
      actionType: "add_entry",
      text: `extra phrase ${index + 1}`,
      translation: `translation ${index + 1}`,
    })),
  ];

  await renderProposal({
    proposalId: "proposal-thirty-changes",
    operation: "vocabulary_change_set",
    items: thirtyItems,
    status: "pending",
  }, async ({ host }) => {
    const list = host.querySelector(".ai-chat-write-proposal-groups");
    const toggle = host.querySelector(".ai-chat-write-proposal-toggle");
    const groups = [...list.querySelectorAll(".ai-chat-write-proposal-group")];

    assert.equal(groups.length, 4);
    assert.equal(list.querySelectorAll("li").length, 4);
    assert.deepEqual(
      groups.map((group) => group.querySelector("h4")?.textContent),
      ["Add26 changes", "Add meaning1 change", "Update meaning1 change", "Move / remove2 changes"],
    );
    assert.equal(toggle?.textContent, "Show 26 more");
    assert.equal(toggle?.getAttribute("aria-controls"), list?.id);

    await act(async () => toggle.click());
    assert.equal(list.querySelectorAll("li").length, 30);
    assert.equal(toggle?.textContent, "Show fewer");
  });
});

test("a pending write proposal is an accessible inline confirmation", async () => {
  const actions = [];

  await renderProposal({
    proposalId: "proposal-1",
    operation: "add_vocabulary_entries",
    items,
    status: "pending",
    onConfirm: (proposalId) => actions.push(["confirm", proposalId]),
    onCancel: (proposalId) => actions.push(["cancel", proposalId]),
  }, async ({ host }) => {
    const card = host.querySelector("section");
    assert.ok(card);
    assert.equal(card.getAttribute("role"), null);
    assert.equal(card.getAttribute("aria-modal"), null);
    assert.equal(card.getAttribute("aria-busy"), "false");
    assert.equal(card.querySelector("h3")?.textContent, "Add to vocabulary");
    assert.equal(card.querySelector(".ai-chat-write-proposal-count")?.textContent, "2 entries");
    assert.deepEqual(
      [...card.querySelectorAll("li")].map((item) => item.textContent),
      ["uncannystrange or mysterious", "break evencover the costs"],
    );

    const status = card.querySelector('[role="status"]');
    assert.equal(status?.getAttribute("aria-live"), "polite");
    assert.match(status?.textContent || "", /Review 2 entries before adding them/u);

    const buttons = [...card.querySelectorAll("button")];
    assert.deepEqual(buttons.map((button) => button.textContent), ["Cancel", "Confirm"]);
    for (const button of buttons) {
      assert.equal(button.type, "button");
      // Shared kit Button at its default size is the 44px touch target.
      assert.ok(button.classList.contains("ui-button"));
      assert.ok(!button.classList.contains("ui-button--sm"));
      assert.equal(button.disabled, false);
    }

    await act(async () => buttons[1].click());
    await act(async () => buttons[0].click());
  });

  assert.deepEqual(actions, [
    ["confirm", "proposal-1"],
    ["cancel", "proposal-1"],
  ]);
});

test("a long proposal expands inline while exposing its disclosure state", async () => {
  const longItems = [
    ...items,
    { id: "serendipity", text: "serendipity", translation: "a happy accident" },
    { id: "hit-the-road", text: "hit the road", translation: "leave" },
    { id: "wrap-up", text: "wrap up", translation: "finish" },
  ];

  await renderProposal({
    proposalId: "proposal-long",
    operation: "add_vocabulary_entries",
    items: longItems,
    status: "pending",
    onConfirm() {},
    onCancel() {},
  }, async ({ host }) => {
    const list = host.querySelector("ol");
    const toggle = host.querySelector(".ai-chat-write-proposal-toggle");
    assert.equal(list?.querySelectorAll("li").length, 3);
    assert.equal(toggle?.textContent, "Show 2 more");
    assert.equal(toggle?.getAttribute("aria-expanded"), "false");
    assert.equal(toggle?.getAttribute("aria-controls"), list?.id);
    assert.ok(toggle?.classList.contains("ui-button"));
    assert.ok(!toggle?.classList.contains("ui-button--sm"));

    await act(async () => toggle.click());
    assert.equal(list?.querySelectorAll("li").length, 5);
    assert.equal(toggle?.textContent, "Show fewer");
    assert.equal(toggle?.getAttribute("aria-expanded"), "true");

    await act(async () => toggle.click());
    assert.equal(list?.querySelectorAll("li").length, 3);
    assert.equal(toggle?.getAttribute("aria-expanded"), "false");
  });
});

test("busy and terminal proposal states announce truthful non-actionable results", async () => {
  const actions = [];
  const cases = [
    {
      status: "busy",
      ariaBusy: "true",
      role: "status",
      message: "Applying change…",
      buttons: ["Cancel", "Applying…"],
    },
    {
      status: "confirmed",
      ariaBusy: "false",
      role: "status",
      message: "1 entry added · 1 already saved.",
      buttons: [],
      result: {
        entries: [
          { text: "uncanny", state: "added" },
          { text: "break even", state: "already_saved" },
        ],
      },
    },
    {
      status: "cancelled",
      ariaBusy: "false",
      role: "status",
      message: "Proposal cancelled. No vocabulary changes were made.",
      buttons: [],
    },
    {
      status: "failed",
      ariaBusy: "false",
      role: "alert",
      message: "The provider rejected this proposal.",
      buttons: [],
    },
  ];

  for (const state of cases) {
    await renderProposal({
      proposalId: `proposal-${state.status}`,
      operation: "add_vocabulary_entries",
      items,
      result: state.result,
      status: state.status,
      errorMessage: state.status === "failed" ? state.message : undefined,
      onConfirm: (proposalId) => actions.push(["confirm", proposalId]),
      onCancel: (proposalId) => actions.push(["cancel", proposalId]),
    }, async ({ host }) => {
      const card = host.querySelector("section");
      const region = card.querySelector(`[role="${state.role}"]`);
      const buttons = [...card.querySelectorAll(".ai-chat-write-proposal-actions button")];
      assert.equal(card.getAttribute("aria-busy"), state.ariaBusy);
      assert.equal(region?.getAttribute("aria-live"), state.role === "alert" ? "assertive" : "polite");
      assert.equal(region?.textContent, state.message);
      assert.deepEqual(buttons.map((button) => button.textContent), state.buttons);

      for (const button of buttons) {
        assert.equal(button.disabled, true);
        await act(async () => button.click());
      }
    });
  }

  assert.deepEqual(actions, []);
});

test("meaning and category proposals use operation-specific copy", async () => {
  const cases = [
    {
      operation: "add_vocabulary_meaning",
      title: "Add meaning",
      pending: "Review this meaning before adding it.",
    },
    {
      operation: "update_vocabulary_meaning",
      title: "Update meaning",
      pending: "Review this meaning change.",
    },
    {
      operation: "set_vocabulary_category",
      title: "Change learning status",
      pending: "Review this learning-status change.",
    },
  ];

  for (const item of cases) {
    await renderProposal({
      proposalId: `proposal-${item.operation}`,
      operation: item.operation,
      items: [{ id: "entry-1", text: "uncanny", translation: "загадочный" }],
      status: "pending",
    }, async ({ host }) => {
      assert.equal(host.querySelector("h3")?.textContent, item.title);
      assert.equal(host.querySelector('[role="status"]')?.textContent, item.pending);
    });
  }
});

const removalItems = Array.from({ length: 10 }, (_, index) => ({
  id: `phrase-${index + 1}`,
  text: `practice entry ${index + 1}`,
  fromCategory: index % 2 === 0 ? "To Learn" : "Learning",
  toCategory: "removed",
}));

test("a removal proposal reviews the exact 1-10 entry set inline", async () => {
  const actions = [];

  await renderProposal({
    proposalId: "proposal-remove-ten",
    operation: "change_vocabulary_state",
    items: removalItems,
    status: "pending",
    onConfirm: (proposalId) => actions.push(["confirm", proposalId]),
    onCancel: (proposalId) => actions.push(["cancel", proposalId]),
  }, async ({ host }) => {
    const card = host.querySelector("section");
    assert.ok(card);
    assert.equal(card.getAttribute("aria-modal"), null);
    assert.equal(card.querySelector("h3")?.textContent, "Remove from Practice");
    assert.equal(card.querySelector(".ai-chat-write-proposal-count")?.textContent, "10 entries");
    assert.equal(
      card.querySelector('[role="status"]')?.textContent,
      "Review 10 entries before removing them from Practice.",
    );

    const list = card.querySelector("ol");
    const toggle = card.querySelector(".ai-chat-write-proposal-toggle");
    assert.equal(list?.querySelectorAll("li").length, 3);
    assert.equal(toggle?.textContent, "Show 7 more");
    await act(async () => toggle.click());
    assert.deepEqual(
      [...list.querySelectorAll("li")].map((item) => item.textContent),
      removalItems.map((item) => (
        `${item.text}${item.fromCategory} → Removed from Practice`
      )),
    );

    const buttons = [...card.querySelectorAll(".ai-chat-write-proposal-actions button")];
    assert.deepEqual(buttons.map((button) => button.textContent), ["Cancel", "Confirm"]);
    await act(async () => buttons[1].click());
    await act(async () => buttons[0].click());
  });

  assert.deepEqual(actions, [
    ["confirm", "proposal-remove-ten"],
    ["cancel", "proposal-remove-ten"],
  ]);
});

test("removal proposals expose busy, confirmed, cancelled, failed, and retry states", async () => {
  const cases = [
    {
      status: "busy",
      message: "Applying your decision…",
      role: "status",
      buttons: ["Cancel", "Applying…"],
      disabled: true,
    },
    {
      status: "confirmed",
      message: "10 entries removed from Practice.",
      role: "status",
      buttons: [],
    },
    {
      status: "cancelled",
      message: "Removal cancelled. Nothing was removed from Practice.",
      role: "status",
      buttons: [],
    },
    {
      status: "failed",
      message: "The selected entries changed. Nothing was removed.",
      errorMessage: "The selected entries changed. Nothing was removed.",
      role: "alert",
      buttons: [],
    },
    {
      status: "pending",
      message: "The request did not complete. Review the list, then choose Cancel or Confirm again.",
      errorMessage: "The request was interrupted.",
      role: "status",
      buttons: ["Cancel", "Confirm"],
      disabled: false,
    },
  ];

  for (const state of cases) {
    const actions = [];
    await renderProposal({
      proposalId: `proposal-remove-${state.status}`,
      operation: "change_vocabulary_state",
      items: removalItems,
      status: state.status,
      errorMessage: state.errorMessage,
      onConfirm: (proposalId) => actions.push(["confirm", proposalId]),
      onCancel: (proposalId) => actions.push(["cancel", proposalId]),
    }, async ({ host }) => {
      const card = host.querySelector("section");
      const region = card.querySelector(`[role="${state.role}"]`);
      const buttons = [...card.querySelectorAll(".ai-chat-write-proposal-actions button")];
      assert.equal(region?.textContent, state.message);
      assert.deepEqual(buttons.map((button) => button.textContent), state.buttons);
      for (const button of buttons) {
        assert.equal(button.disabled, state.disabled);
        await act(async () => button.click());
      }
    });

    if (state.status === "pending") {
      assert.deepEqual(actions, [
        ["cancel", "proposal-remove-pending"],
        ["confirm", "proposal-remove-pending"],
      ]);
    } else {
      assert.deepEqual(actions, []);
    }
  }
});
