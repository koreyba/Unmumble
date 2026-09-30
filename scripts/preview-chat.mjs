#!/usr/bin/env node
/**
 * Click through the signed-in AI Chat locally.
 *
 * Google sign-in is impossible on localhost, so this opens a real (headed)
 * Chromium on the running dev server and answers every chat API call from a
 * small in-memory backend: session, chat list, create, open, rename, delete,
 * streamed replies, Stop, Retry, write proposals, translate and Add to learning.
 * Nothing is sent to the real API, the D1 database or a model provider.
 *
 *   npm run dev                       # in one terminal
 *   npm run preview:chat              # in another
 *   npm run preview:chat -- --mobile --dark
 *   PREVIEW_URL=http://localhost:4173 npm run preview:chat
 *
 * Options: --mobile (390x844 touch phone), --dark | --light, a URL as the first
 * argument, --headless (smoke check used for verification: loads the chat,
 * prints the result, exits 0 or 1).
 *
 * Things to try in the message box: "fail" makes the first attempt fail (then
 * Retry succeeds), "propose" adds a vocabulary proposal to the reply, and any
 * long text streams slowly enough to press Stop.
 */
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const DEFAULT_URL = "http://localhost:5180";
const STREAM_DELAY_MS = 1400;
const STREAM_TICK_MS = 55;

// ───────────────────────────── in-memory backend ─────────────────────────────

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function message(state, chat, role, content, extra = {}) {
  const entry = {
    id: `${role === "user" ? "user" : "assistant"}-message-${++state.counter}`,
    role,
    sequence: chat.messages.length + 1,
    content,
    status: "complete",
    clientMessageId: extra.clientMessageId || `client-${state.counter}`,
    errorCode: null,
    terminal: null,
    createdAt: extra.at || new Date().toISOString(),
    updatedAt: extra.at || new Date().toISOString(),
    ...extra,
  };
  chat.messages.push(entry);
  return entry;
}

/** Same flattening the server applies to the list preview, kept short here. */
function toPreview(source) {
  const plain = String(source || "")
    .replace(/```[\s\S]*?(?:```|$)/gu, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/`([^`]*)`/gu, "$1")
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gmu, "")
    .replace(/[*~]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const characters = [...plain];
  return characters.length > 120 ? `${characters.slice(0, 119).join("").trimEnd()}…` : plain;
}

const REPLY = [
  "Good question. **Resilient** describes someone who recovers quickly after a setback.",
  "",
  "- She is a *resilient* leader who bounced back after the layoffs.",
  "- Small businesses have to be resilient to survive a slow winter.",
  "",
  "Try writing your own sentence and I will check it.",
].join("\n");

function summary(chat) {
  const last = [...chat.messages].reverse().find((item) => item.content);
  return {
    id: chat.id,
    title: chat.title,
    explanationLanguage: "ru",
    targetCount: 0,
    messageCount: chat.messages.length,
    preview: toPreview(last?.content),
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

function detail(chat) {
  return {
    ...summary(chat),
    targets: [],
    messages: chat.messages,
    writeProposals: chat.writeProposals,
  };
}

function seed() {
  const state = { counter: 0, chats: [], jobs: new Map() };

  const reliability = {
    id: "chat-reliability", title: "Reliability practice", createdAt: minutesAgo(50), updatedAt: minutesAgo(4),
    messages: [], writeProposals: [],
  };
  message(state, reliability, "assistant", "Hi! Pick a word or ask me for an example, a context or a quick exercise.", { clientMessageId: "opening:chat-reliability", at: minutesAgo(50) });
  message(state, reliability, "user", "Teach me the word resilient with a few examples please.", { clientMessageId: "seed-1", at: minutesAgo(9) });
  message(state, reliability, "assistant", REPLY, { clientMessageId: "seed-1", at: minutesAgo(9) });
  message(state, reliability, "user", "My sister is resilient and never gives up even when everything goes wrong at work.", { clientMessageId: "seed-2", at: minutesAgo(5) });
  const proposalHost = message(state, reliability, "assistant", "Nice sentence! Want me to add **resilient** and a few related words to your vocabulary?", { clientMessageId: "seed-2", at: minutesAgo(4) });
  reliability.writeProposals.push(proposal(state, proposalHost.id, ["resilient|устойчивый, жизнестойкий", "bounce back|быстро восстанавливаться", "setback|неудача, препятствие", "robust|прочный"]));

  const long = {
    id: "chat-long", title: "A very long conversation about phrasal verbs and office small talk", createdAt: minutesAgo(3000), updatedAt: minutesAgo(180),
    messages: [], writeProposals: [],
  };
  for (let index = 1; index <= 14; index += 1) {
    message(state, long, "user", `Question ${index}: how do I use "figure out" naturally in a sentence?`, { clientMessageId: `long-${index}`, at: minutesAgo(3000 - index * 10) });
    message(state, long, "assistant", `Answer ${index}: "I couldn't figure out why the build kept failing" is a natural, everyday use. It means to understand or solve something after thinking about it.`, { clientMessageId: `long-${index}`, at: minutesAgo(3000 - index * 10) });
  }

  const empty = {
    id: "chat-empty", title: "New vocabulary practice", createdAt: minutesAgo(1500), updatedAt: minutesAgo(1500),
    messages: [], writeProposals: [],
  };

  state.chats.push(reliability, long, empty);
  return state;
}

function proposal(state, assistantMessageId, entries) {
  return {
    id: `proposal-${++state.counter}`,
    assistantMessageId,
    operation: "add_vocabulary_entries",
    items: entries.map((entry, index) => {
      const [text, translation] = entry.split("|");
      return { id: `item-${state.counter}-${index}`, text, translation };
    }),
    status: "pending",
    result: null,
    errorCode: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
}

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: "application/json",
  headers: { "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const apiError = (route, code, status) => json(route, { error: { code } }, status);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Streams the assistant reply from a tiny local server, so Stop has something to stop. */
function startStreamServer(state) {
  const server = createServer((request, response) => {
    const job = state.jobs.get(new URL(request.url, "http://local").pathname.slice(1));
    if (!job) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "x-vercel-ai-ui-message-stream": "v1",
    });
    const send = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
    let closed = false;
    request.on("close", () => { closed = true; });
    void (async () => {
      await sleep(STREAM_DELAY_MS);
      if (closed || job.cancelled) return;
      if (job.failFirst) {
        // The connection dies before anything is saved; the client recovers from canonical state.
        job.assistant.status = "failed";
        job.assistant.errorCode = "provider_timeout";
        job.assistant.terminal = { termination: "provider_error" };
        job.assistant.updatedAt = new Date().toISOString();
        response.destroy();
        return;
      }
      send({ type: "start", messageId: job.assistant.id });
      send({ type: "text-start", id: "text-1" });
      const words = job.reply.split(/(?<=\s)/u);
      for (const word of words) {
        if (closed || job.cancelled) return;
        send({ type: "text-delta", id: "text-1", delta: word });
        await sleep(STREAM_TICK_MS);
      }
      send({ type: "text-end", id: "text-1" });
      send({ type: "finish", finishReason: "stop" });
      response.write("data: [DONE]\n\n");
      job.assistant.status = "complete";
      job.assistant.content = job.reply;
      job.assistant.updatedAt = new Date().toISOString();
      job.chat.updatedAt = job.assistant.updatedAt;
      if (job.withProposal) {
        job.chat.writeProposals.push(proposal(state, job.assistant.id, ["figure out|разобраться", "look into|изучить, рассмотреть"]));
      }
      response.end();
    })();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function handleApi(route, state, streamPort) {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();
  const body = () => { try { return request.postDataJSON() || {}; } catch { return {}; } };

  if (path === "/api/session") {
    return json(route, { user: { id: "preview-user", email: "learner@example.com", name: "Learner" } });
  }
  if (path === "/api/translate" && method === "POST") {
    const { text = "" } = body();
    const known = { resilient: "устойчивый, жизнестойкий", "figure out": "разобраться" };
    return json(route, { translation: known[String(text).toLowerCase()] || `перевод: ${text}` });
  }
  if (path === "/api/phrases" && method === "POST") return json(route, { status: "to_learn", translationPending: false });

  if (path === "/api/ai/chats") {
    if (method === "GET") {
      const ordered = [...state.chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return json(route, { generationConfigured: true, chats: ordered.map(summary) });
    }
    if (method === "POST") {
      const now = new Date().toISOString();
      const chat = { id: `chat-${++state.counter}`, title: "New vocabulary practice", createdAt: now, updatedAt: now, messages: [], writeProposals: [] };
      message(state, chat, "assistant", "Hi! Tell me a word or phrase you want to practise, or ask for an example.", { clientMessageId: `opening:${chat.id}` });
      state.chats.push(chat);
      return json(route, { chat: detail(chat) }, 201);
    }
  }

  const detailMatch = path.match(/^\/api\/ai\/chats\/([^/]+)$/u);
  if (detailMatch) {
    const chat = state.chats.find((item) => item.id === decodeURIComponent(detailMatch[1]));
    if (!chat) return apiError(route, "not_found", 404);
    if (method === "GET") return json(route, { chat: detail(chat) });
    if (method === "PATCH") {
      const title = typeof body().title === "string" ? body().title.trim().replace(/\s+/gu, " ") : "";
      if (!title) return apiError(route, "invalid_field", 400);
      if ([...title].length > 100) return apiError(route, "field_too_long", 400);
      chat.title = title; // like the real API, a rename keeps the ordering timestamp
      return json(route, { chat: summary(chat) });
    }
    if (method === "DELETE") {
      if (chat.messages.some((item) => item.role === "assistant" && item.status === "pending")) {
        return apiError(route, "turn_in_progress", 409);
      }
      state.chats = state.chats.filter((item) => item !== chat);
      return json(route, { deleted: true });
    }
  }

  const messagesMatch = path.match(/^\/api\/ai\/chats\/([^/]+)\/messages$/u);
  if (messagesMatch && method === "POST") {
    const chat = state.chats.find((item) => item.id === decodeURIComponent(messagesMatch[1]));
    if (!chat) return apiError(route, "not_found", 404);
    const { clientMessageId, content = "" } = body();
    let user = chat.messages.find((item) => item.role === "user" && item.clientMessageId === clientMessageId);
    let assistant;
    let attempt = 1;
    if (user) {
      assistant = chat.messages.find((item) => item.role === "assistant" && item.clientMessageId === clientMessageId);
      attempt = (state.attempts.get(clientMessageId) || 1) + 1;
      assistant.status = "pending";
      assistant.errorCode = null;
      assistant.terminal = null;
      assistant.content = "";
    } else {
      user = message(state, chat, "user", content, { clientMessageId });
      assistant = message(state, chat, "assistant", "", { clientMessageId, status: "pending" });
    }
    state.attempts.set(clientMessageId, attempt);
    chat.updatedAt = new Date().toISOString();
    const token = `job-${++state.counter}`;
    state.jobs.set(token, {
      chat, assistant, reply: REPLY, cancelled: false,
      failFirst: /\bfail\b/iu.test(content) && attempt === 1,
      withProposal: /\bpropose\b/iu.test(content),
    });
    // Hand the request to the streaming server; the page still sees the original URL.
    return route.continue({ url: `http://127.0.0.1:${streamPort}/${token}`, method: "GET", postData: undefined });
  }

  const cancelMatch = path.match(/^\/api\/ai\/chats\/([^/]+)\/messages\/([^/]+)\/cancel$/u);
  if (cancelMatch && method === "POST") {
    const chat = state.chats.find((item) => item.id === decodeURIComponent(cancelMatch[1]));
    const clientMessageId = decodeURIComponent(cancelMatch[2]);
    const assistant = chat?.messages.find((item) => item.role === "assistant" && item.clientMessageId === clientMessageId);
    for (const job of state.jobs.values()) if (job.assistant === assistant) job.cancelled = true;
    if (assistant && assistant.status === "pending") {
      assistant.status = "failed";
      assistant.errorCode = "generation_cancelled";
      assistant.terminal = { termination: "user_cancelled" };
      assistant.updatedAt = new Date().toISOString();
    }
    return json(route, { cancelled: true });
  }

  const proposalMatch = path.match(/^\/api\/ai\/chats\/([^/]+)\/write-proposals\/([^/]+)$/u);
  if (proposalMatch && method === "PATCH") {
    const chat = state.chats.find((item) => item.id === decodeURIComponent(proposalMatch[1]));
    const item = chat?.writeProposals.find((entry) => entry.id === decodeURIComponent(proposalMatch[2]));
    if (!item) return apiError(route, "not_found", 404);
    await sleep(500);
    const confirmed = body().decision === "confirm";
    item.status = confirmed ? "confirmed" : "cancelled";
    item.decidedAt = new Date().toISOString();
    item.result = confirmed ? { entries: item.items.map(() => ({ state: "added" })) } : null;
    return json(route, { proposal: item });
  }

  if (/^\/api\/ai\/chats\/[^/]+\/targets$/u.test(path)) return json(route, { targets: [] });
  if (path === "/api/ai/meanings") return json(route, { meanings: [] });
  return route.fallback();
}

// ─────────────────────────────── browser side ───────────────────────────────

export async function startPreview({
  url = DEFAULT_URL,
  mobile = false,
  theme = "light",
  headless = false,
} = {}) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(4000) });
  } catch {
    throw new Error(`Cannot reach ${url}. Start the dev server first with \`npm run dev\` (or set PREVIEW_URL).`);
  }

  const state = seed();
  state.attempts = new Map();
  const stream = await startStreamServer(state);
  const streamPort = stream.address().port;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    ...(mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: headless ? { width: 1360, height: 860 } : null }),
    colorScheme: theme,
  });
  await context.addInitScript((value) => {
    try { localStorage.setItem("unmumble:theme", value); } catch { /* storage can be unavailable */ }
  }, theme);
  await context.route("**/api/**", (route) => handleApi(route, state, streamPort).catch((error) => {
    console.error("preview backend:", error.message);
    return route.abort().catch(() => {});
  }));
  const page = await context.newPage();
  const closed = new Promise((resolve) => browser.on("disconnected", resolve));
  const close = async () => {
    await browser.close().catch(() => {});
    stream.close();
  };
  closed.then(() => stream.close());
  return { browser, context, page, state, close, closed, chatUrl: new URL("/chat", url).href };
}

function parseArguments(argv) {
  const options = { url: process.env.PREVIEW_URL || DEFAULT_URL, mobile: false, theme: "light", headless: false };
  for (const argument of argv) {
    if (argument === "--mobile") options.mobile = true;
    else if (argument === "--dark") options.theme = "dark";
    else if (argument === "--light") options.theme = "light";
    else if (argument === "--headless") options.headless = true;
    else if (!argument.startsWith("--")) options.url = argument;
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  let session;
  try {
    session = await startPreview(options);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const { page, close, closed, chatUrl } = session;
  await page.goto(chatUrl);

  if (options.headless) {
    try {
      await page.getByRole("navigation", { name: "Practice chats" }).getByText("Reliability practice").waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Send message" }).waitFor({ timeout: 5000 });
      console.log("preview:chat smoke check passed (signed-in chat rendered from the stubbed backend).");
      await close();
    } catch (error) {
      console.error(`preview:chat smoke check failed: ${error.message}`);
      await close();
      process.exit(1);
    }
    return;
  }

  console.log(`AI Chat preview open at ${chatUrl} (${options.mobile ? "mobile" : "desktop"}, ${options.theme}).`);
  console.log('Try: send a message, type "fail" then Retry, type "propose", press Stop while it streams,');
  console.log("select words for Translate / Add to learning, rename or delete a chat from its ⋯ menu.");
  console.log("Close the browser window (or press Ctrl+C) to stop.");
  process.on("SIGINT", () => { void close().then(() => process.exit(0)); });
  await closed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
