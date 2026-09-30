import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readGlobalStyles } from "./helpers/styles.mjs";

const chatComponentUrls = [
  new URL("../app/components/ai-practice-chat.tsx", import.meta.url),
  new URL("../app/components/ai-chat-composer.tsx", import.meta.url),
  new URL("../app/components/ai-chat-conversation.tsx", import.meta.url),
  new URL("../app/components/ai-chat-workspace.tsx", import.meta.url),
  new URL("../app/components/use-ai-chat-turn-controller.ts", import.meta.url),
  new URL("../lib/ai-chat/client-http.ts", import.meta.url),
];
const selectionActionsUrl = new URL("../app/components/ai-chat-selection-actions.tsx", import.meta.url);
const phraseWorkspaceUrl = new URL("../app/components/phrase-workspace.tsx", import.meta.url);

async function readChatSource() {
  return (await Promise.all(chatComponentUrls.map((url) => readFile(url, "utf8")))).join("\n");
}

test("signed-in chat uses AI SDK useChat with the compact canonical transport", async () => {
  const source = await readChatSource();
  assert.match(source, /useChat<AiChatUiMessage>/);
  assert.match(source, /new DefaultChatTransport/);
  assert.match(source, /prepareSendMessagesRequest: prepareAiChatMessageRequest/);
  assert.match(source, /\/api\/ai\/chats\/\$\{chat\.id\}\/messages/);
  assert.match(source, /sendMessage\(/);
  assert.match(source, /Retry/);
  assert.match(source, /provider_rate_limited/);
  assert.match(source, /turn_in_progress/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("retryable terminal failures explain exact safe causes and stopped responses", async () => {
  const source = await readChatSource();

  assert.match(
    source,
    /case "response_incomplete":\s*return responseIncompleteMessage\(terminal\);/,
  );
  assert.match(
    source,
    /case "generation_cancelled":\s*return "You stopped this response\. Retry it if needed\.";/,
  );
  assert.match(
    source,
    /case "generation_interrupted":\s*return "The live connection was interrupted before the response was saved\. You can retry safely\.";/,
  );
  assert.match(
    source,
    /case "tool_timeout":\s*return "The chat action timed out\. Nothing was changed\. You can continue or retry\.";/,
  );
  assert.match(
    source,
    /case "tool_failed":\s*return "The chat action failed\. Nothing was changed\. You can continue or retry\.";/,
  );
  assert.match(
    source,
    /case "tool_budget_exceeded":\s*return "This request needed more vocabulary lookups than one response can safely run\. Nothing was changed\. Split it into smaller requests\.";/,
  );
  assert.match(source, /case "length":\s*return "The model reached its response limit before finishing\. Retry with a shorter request\.";/);
  assert.match(source, /case "content-filter":\s*return "The provider stopped this response because of its safety filter\. Try rephrasing the request\.";/);
  assert.match(source, /case "tool-calls":\s*return "The model stopped before it finished the requested vocabulary action\. Nothing was changed\.";/);
});

test("only explicit Stop cancels the server turn while transport errors reconcile quietly", async () => {
  const source = await readChatSource();

  assert.match(
    source,
    /const activeClientMessageId = useRef<string \| null>\(canonicalPendingClientMessageId\)/,
  );
  assert.match(source, /const cancelPendingTurn = useCallback\(\(\) =>/);
  assert.match(
    source,
    /\/api\/ai\/chats\/\$\{encodeURIComponent\(chat\.id\)\}\/messages\/\$\{encodeURIComponent\(clientMessageId\)\}\/cancel/,
  );
  assert.match(source, /body: JSON\.stringify\(\{\}\)/);
  assert.match(source, /function stopPendingTurn\(\)/);
  assert.match(source, /stop\(\);\s*void cancelPendingTurn\(\);/s);
  assert.match(source, /onError: \(\) => void recoverPendingTurn\(\)/);
  assert.doesNotMatch(source, /onError: \(\) => void cancelPendingTurn\(\)/);
  assert.match(source, /shouldRecoverAiChatFinishedStream\(\{/);
  assert.match(source, /shouldSettleAiChatStreamFromCanonical\(\{/);
  assert.match(source, /setLocallyTerminalClientMessageId\(clientMessageId\);\s*updateActiveClientMessageId\(null\);\s*clearError\(\);\s*stop\(\);/s);
  assert.match(source, /recoverAiChatCanonicalTurn\(\{/);
  assert.match(source, /recoveryWindowMs:\s*AI_CHAT_CANONICAL_RECOVERY_WINDOW_MS/);
  assert.doesNotMatch(source, /response is still running/);
  assert.match(source, /refresh\(signal, \{ quiet: true, detailOnly: true \}\)/);
  assert.match(source, /options\?\.detailOnly\s*\?\s*Promise\.resolve\(null\)/);
  assert.match(source, /withAiChatCancelDeadline\(async \(signal\) =>/);
  assert.match(source, /recoverAiChatCanonicalTurn\(\{[\s\S]*?signal:\s*recoveryController\.signal,/);
  assert.match(source, /onStop=\{stopPendingTurn\}/);
  assert.match(source, /onClick=\{onStop\}/);
});

test("each interactive message owns its selection context without a raw-Markdown override", async () => {
  const source = await readFile(
    new URL("../app/components/ai-chat-conversation.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /selectionchange/);
  assert.doesNotMatch(source, /messageTexts/);
  assert.doesNotMatch(source, /interactiveEnglishContext/);
  assert.match(source, /onPhraseSelect=\{\(phrase, context, details\) => chooseText\(/);
});

test("jumping to the latest message respects reduced-motion preferences", async () => {
  const source = await readFile(
    new URL("../app/components/ai-chat-conversation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /behavior:\s*reduceMotion \? "auto" : "smooth"/);
});

test("stopping blocks a second send and rejected outbound text remains recoverable", async () => {
  const [source, styles] = await Promise.all([
    readChatSource(),
    readGlobalStyles(),
  ]);

  assert.match(source, /const \[cancelling, setCancelling\] = useState\(false\)/);
  assert.match(source, /isAiChatTurnBlocked\(\{/);
  assert.match(source, /cancelling,/);
  assert.match(source, /label=\{cancelling \? "Stopping response" : "Stop response"\}/);
  assert.match(source, /disabled=\{cancelling\}/);
  assert.match(source, /reconcileAiChatOutboundTurn\(\{/);
  assert.match(source, /preserveUnverifiedAiChatOutboundTurn\(\{/);
  assert.match(source, /Retry message/);
  assert.match(source, /Promise<AiChatClientDetail \| null>/);
  assert.match(styles, /\.ai-chat-outbound-recovery \{[^}]*display:\s*flex;/s);
  assert.match(styles, /\.ai-chat-outbound-recovery button \{[^}]*min-height:\s*44px;/s);
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*?\.ai-chat-outbound-recovery \{[^}]*flex-direction:\s*column;/s);
});

test("chat UI exposes separate list/dialog panes and contextual selection actions", async () => {
  const source = await readChatSource();
  assert.match(source, /<nav[^>]+aria-label="Practice chats"/s);
  assert.match(source, /id="ai-chat-sidebar"/);
  assert.match(source, /aria-controls="ai-chat-sidebar"/);
  assert.match(source, /aria-expanded=\{sidebarOpen\}/);
  assert.match(source, />New Chat<\/Button>/);
  assert.match(source, /role="log"/);
  assert.match(source, /aria-relevant="additions text"/);
  assert.match(source, /className="ai-chat-composer"/);
  assert.match(source, /InteractiveEnglishText/);
  assert.match(source, /onWordActivate=/);
  assert.match(source, /ChatSelectionActions/);
  assert.doesNotMatch(source, /ai-chat-target-panel/);
  assert.doesNotMatch(source, /ai-chat-target-adders/);
  assert.doesNotMatch(source, /ai-chat-suggestions/);
  assert.doesNotMatch(source, /Add saved target|Add word or phrase|Meaning scope|Request ideas/);
});

test("agent writes render as inline proposal cards and confirm without another chat turn", async () => {
  const [source, styles] = await Promise.all([
    readChatSource(),
    readGlobalStyles(),
  ]);
  assert.match(source, /AiChatWriteProposal/);
  assert.match(source, /\(chat\.writeProposals \|\| \[\]\)\.filter\(/);
  assert.match(source, /write-proposals\/\$\{proposalId\}/);
  assert.match(source, /method:\s*"PATCH"/);
  assert.match(source, /decision:\s*"confirm"/);
  assert.match(source, /decision:\s*"cancel"/);
  assert.match(source, /await refresh\(\)/);
  assert.doesNotMatch(source, /sendMessage\([^)]*proposal/u);
  assert.match(styles, /\.ai-chat-write-proposal \{/);
  assert.match(styles, /\.ai-chat-write-proposal-actions/);
});

test("chat selection actions reuse DeepL and vocabulary APIs without a new provider path", async () => {
  const source = await readFile(selectionActionsUrl, "utf8");
  assert.match(source, /role="toolbar"/);
  assert.match(source, /"Translate"/);
  assert.match(source, /"Add to learning"/);
  assert.match(source, /Selected phrase/);
  assert.match(source, /"Word"/);
  assert.match(source, /"\/api\/translate"/);
  assert.match(source, /"\/api\/phrases"/);
  assert.doesNotMatch(source, /\/api\/ai\/translate/);
});

test("new chat and add-to-learning actions share the primary button treatment", async () => {
  const [chatSource, selectionSource, composerSource] = await Promise.all([
    readChatSource(),
    readFile(selectionActionsUrl, "utf8"),
    readFile(new URL("../app/components/ai-chat-composer.tsx", import.meta.url), "utf8"),
  ]);

  // Every chat action is the shared kit Button: primary for the main call to action.
  assert.match(chatSource, /<Button[^>]*className="ai-chat-new"[\s\S]*?variant="primary"[\s\S]*?>New Chat<\/Button>/);
  assert.match(chatSource, /<Button[\s\S]*?size="lg"[\s\S]*?variant="primary"[\s\S]*?>New Chat<\/Button>/);
  assert.match(selectionSource, /<Button[\s\S]*?variant="primary"[\s\S]*?>\{saving \? "Adding…" : "Add to learning"\}<\/Button>/);
  assert.match(composerSource, /<IconButton[\s\S]*?className="ai-chat-send"[\s\S]*?variant="primary"/);
  assert.match(composerSource, /<IconButton[\s\S]*?className="ai-chat-stop"[\s\S]*?variant="danger"/);
  assert.doesNotMatch(chatSource + selectionSource, /ai-chat-primary-action/);
});

test("chat styles provide responsive drawer, selection sheet, and comfortable targets", async () => {
  const source = await readGlobalStyles();
  assert.doesNotMatch(source, /\.ai-chat-target(?:-|\s|,)/);
  assert.doesNotMatch(source, /\.ai-chat-suggestions(?:\s|\{|,)/);
  assert.match(source, /\.ai-chat-sidebar-overlay/);
  assert.match(source, /\.ai-chat-selection-actions/);
  assert.match(source, /\[data-interactive-english-word\]/);
  assert.match(source, /text-decoration-style:\s*dotted/);
  assert.match(source, /min-height:\s*44px/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
});

test("assistant messages opt into safe Markdown while user messages stay literal", async () => {
  const [source, styles] = await Promise.all([
    readChatSource(),
    readGlobalStyles(),
  ]);

  assert.match(source, /markdown=\{message\.role === "assistant"\}/);
  assert.match(styles, /\.ai-chat-message-text \.interactive-english-text > :first-child \{ margin-top:\s*0; \}/);
  assert.match(styles, /\.ai-chat-message-text (?:ul|ol),/);
  assert.match(styles, /\.ai-chat-message-text code \{/);
  assert.match(styles, /\.ai-chat-message-text a \{/);
});

test("signed-out chat content starts below the navigation without stretching empty grid space", async () => {
  const source = await readGlobalStyles();

  assert.match(source, /\.ai-chat-shell \{[^}]*align-content:\s*start;/s);
});

test("chat list never scrolls sideways and the phone status is a subtitle under the title", async () => {
  const [source, conversationSource] = await Promise.all([
    readGlobalStyles(),
    readFile(new URL("../app/components/ai-chat-conversation.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /\.ai-chat-list \{[^}]*min-width:\s*0;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s);
  assert.doesNotMatch(source, /\.ai-chat-list-item:hover \{[^}]*transform:/s);
  // The badge becomes a plain subtitle line in the header grid on phones.
  assert.match(source, /@media \(max-width: 760px\) \{[\s\S]*?\.ai-chat-conversation-header \{[^}]*grid-template-areas:\s*"chats title" "chats status";/s);
  assert.match(source, /@media \(max-width: 760px\) \{[\s\S]*?\.ai-chat-generation-status \{[^}]*grid-area:\s*status;[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  assert.doesNotMatch(source, /\.ai-chat-generation-status \{[^}]*border-radius:\s*50%;/s);
  // One live status element carries the same words on every screen size.
  assert.match(conversationSource, /className=\{`ai-chat-generation-status \$\{turnBusy \? "busy" : ""\}`\}/);
  assert.match(conversationSource, /role="status"/);
  for (const label of ["Stopping…", "Thinking…", "Responding…", "Waiting…", "Ready"]) {
    assert.match(conversationSource, new RegExp(`"${label}"`, "u"));
  }
});

test("chat feedback and transient surfaces expose truthful, interruptible states", async () => {
  const [chatSource, selectionSource, styles] = await Promise.all([
    readChatSource(),
    readFile(selectionActionsUrl, "utf8"),
    readGlobalStyles(),
  ]);

  assert.match(selectionSource, /const \[saveError, setSaveError\] = useState\(""\)/);
  assert.match(selectionSource, /saveError && <p className="ai-chat-selection-error" role="alert">/);
  assert.match(chatSource, /disabled=\{!draft\.trim\(\) \|\| turnBusy \|\| !generationConfigured\}/);
  assert.match(chatSource, /function closeSidebarOnEscape\(event: KeyboardEvent\)/);
  assert.match(chatSource, /event\.key !== "Escape"/);
  assert.match(chatSource, /setSidebarOpen\(false\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ai-chat-message-enter,[\s\S]*?animation:\s*none;/s);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ai-chat-typing i \{ animation:\s*none;/s);
});

test("chat switching is last-request-wins and refresh does not remount away drafts", async () => {
  const source = await readChatSource();
  assert.match(source, /openRequestId/);
  assert.match(source, /key=\{chat\.id\}/);
  assert.doesNotMatch(source, /key=\{`\$\{chat\.id\}:\$\{chat\.updatedAt\}`\}/);
  assert.match(source, /drafts/);
  assert.match(source, /window\.history\.(?:pushState|replaceState)/);
  assert.match(source, /isComposing/);
  assert.match(source, /shiftKey/);
});

test("a terminal stream stays visible until canonical history actually changes", async () => {
  const source = await readChatSource();

  assert.match(source, /observeCanonicalMessages\(\s*observedCanonicalMessages\.current,\s*canonicalMessages,\s*busy,/s);
  assert.match(source, /observedCanonicalMessages\.current = sync\.observed/);
  assert.match(source, /if \(sync\.apply\) setMessages\(canonicalMessages\)/);
  assert.doesNotMatch(source, /if \(!busy\) setMessages\(canonicalMessages\)/);
});

test("compact composer has no internal scrollbar and expands into a full-screen editor", async () => {
  const [source, styles] = await Promise.all([
    readChatSource(),
    readGlobalStyles(),
  ]);

  assert.match(source, /label="Expand composer"/);
  assert.match(source, /label="Close expanded composer"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /Compose message/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /useLayoutEffect/);
  assert.match(source, /readComposerSelection\(compactComposer\.current\)/);
  assert.match(source, /restoreComposerSelection\(expandedComposer\.current/);
  assert.match(source, /readComposerSelection\(expandedComposer\.current\)/);
  assert.match(source, /restoreComposerSelection\(compactComposer\.current/);
  assert.match(styles, /\.ai-chat-composer textarea \{[^}]*resize:\s*none;[^}]*overflow-y:\s*hidden;/s);
  assert.match(styles, /\.ai-chat-composer:focus-within \{[^}]*border-color:[^}]*box-shadow:/s);
  assert.doesNotMatch(styles, /\.ai-chat-workspace textarea:focus-visible/);
  assert.match(styles, /\.ai-chat-composer-dialog \{/);
  assert.match(styles, /\.ai-chat-composer-dialog-editor textarea \{/);
});

test("chat entry points do not preselect hidden practice targets", async () => {
  const [chatSource, phraseSource] = await Promise.all([
    readChatSource(),
    readFile(phraseWorkspaceUrl, "utf8"),
  ]);
  assert.doesNotMatch(chatSource, /URLSearchParams|phraseId|AiChatTargetRequest/);
  assert.doesNotMatch(phraseSource, /Practice with AI|openAiPractice|\/chat\?/);
});

test("chat controls come from the shared UI kit; only the drawer scrim and list rows stay native", async () => {
  const [chatSource, selectionSource, proposalSource] = await Promise.all([
    readChatSource(),
    readFile(selectionActionsUrl, "utf8"),
    readFile(new URL("../app/components/ai-chat-write-proposal.tsx", import.meta.url), "utf8"),
  ]);
  const uiSource = [chatSource, selectionSource, proposalSource].join("\n");

  assert.match(uiSource, /from "@\/app\/components\/ui"/);
  assert.doesNotMatch(uiSource, /landing-button/);
  assert.match(chatSource, /<Notice/);
  assert.match(chatSource, /<EmptyState/);
  assert.match(chatSource, /<ListSkeleton/);
  assert.match(chatSource, /<Skeleton/);
  assert.match(proposalSource, /<Notice/);
  // ai-chat-workspace.tsx: the scrim behind the drawer and one row per chat.
  assert.equal((uiSource.match(/<button\b/g) || []).length, 2);
});

test("only messages added after a chat opens animate in, and every animation honours reduced motion", async () => {
  const [conversationSource, styles] = await Promise.all([
    readFile(new URL("../app/components/ai-chat-conversation.tsx", import.meta.url), "utf8"),
    readGlobalStyles(),
  ]);

  assert.match(conversationSource, /\[openingMessageIds\] = useState\(\(\) => new Set\(messages\.map/);
  assert.match(conversationSource, /openingMessageIds\.has\(message\.id\)/);
  assert.match(styles, /\.ai-chat-message-enter \{ animation: ai-chat-rise/);
  assert.match(styles, /@keyframes ai-chat-typing/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ai-chat-typing i \{ animation:\s*none;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.ai-chat-generation-status\.busy::before \{ animation:\s*none;/);
});

test("the fixed Feedback button is parked beside the composer instead of covering the send control", async () => {
  const styles = await readGlobalStyles();

  assert.match(styles, /body:has\(\.ai-chat-workspace\) \.feedback-trigger \{[^}]*width:\s*46px;/s);
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*?\.ai-chat-composer-region \{[^}]*padding:\s*10px 66px 10px 10px;/s);
  assert.match(styles, /\.ai-chat-composer-region:focus-within \{ padding-right:\s*10px; \}/);
  // The widget hides itself while a reply streams; the composer no longer needs that.
  assert.match(styles, /body:has\(\.ai-chat-workspace\) \.feedback-trigger \{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s);
});

test("a failed reply is reported once, on the message, with its own Retry", async () => {
  const [composerSource, conversationSource] = await Promise.all([
    readFile(new URL("../app/components/ai-chat-composer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ai-chat-conversation.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(composerSource, /Retry it below|showRetryFailure/);
  assert.doesNotMatch(conversationSource, /showRetryFailure/);
  assert.match(conversationSource, /className="ai-chat-message-failure"/);
  assert.match(conversationSource, />Retry<\/Button>/);
});

test("the expanded editor names the platform's send shortcut and sends with it", async () => {
  const source = await readFile(new URL("../app/components/ai-chat-composer.tsx", import.meta.url), "utf8");

  assert.match(source, /function sendShortcutLabel\(\)/);
  assert.match(source, /"⌘\+Enter" : "Ctrl\+Enter"/);
  assert.match(source, /<span>\{sendShortcut\} to send<\/span>/);
  assert.match(source, /aria-keyshortcuts="Control\+Enter Meta\+Enter"/);
  assert.match(source, /\(!event\.metaKey && !event\.ctrlKey\)/);
  // The compact composer keeps its own Enter / Shift+Enter hint.
  assert.match(source, /Enter to send · Shift\+Enter for a new line/);
});

test("chat rows show a preview and open rename and delete in the shared bottom sheet", async () => {
  const [workspaceSource, actionsSource, styles] = await Promise.all([
    readFile(new URL("../app/components/ai-chat-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/ai-chat-list-actions.tsx", import.meta.url), "utf8"),
    readGlobalStyles(),
  ]);

  assert.match(workspaceSource, /className="ai-chat-list-preview"/);
  assert.match(workspaceSource, /label=\{`Actions for \$\{item\.title\}`\}/);
  assert.match(workspaceSource, /method: "PATCH", body: JSON\.stringify\(\{ title \}\)/);
  assert.match(workspaceSource, /\{ method: "DELETE" \}/);
  assert.match(workspaceSource, /await openChat\(next\.id, "replace"\)/);
  assert.match(workspaceSource, /updateChatUrl\("", "replace"\)/);
  assert.doesNotMatch(workspaceSource + actionsSource, /window\.confirm|\bconfirm\(/);
  assert.match(actionsSource, /<BottomSheet/);
  assert.match(actionsSource, /variant="danger"/);
  assert.match(actionsSource, /Delete this chat\?/);
  assert.match(actionsSource, /maxLength=\{AI_CHAT_TITLE_MAX_CHARACTERS\}/);
  assert.match(styles, /\.ai-chat-list-row \.ai-chat-list-menu \{[^}]*position:\s*absolute;/s);
  assert.match(styles, /\.ai-chat-list-row \.ai-chat-list-item \{[^}]*padding-right:\s*52px;/s);
});

test("the chat preview script stubs the signed-in API in a real browser without touching production paths", async () => {
  const [pkg, script, readme] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/preview-chat.mjs", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(pkg).scripts["preview:chat"], "node scripts/preview-chat.mjs");
  assert.match(readme, /npm run preview:chat/);
  assert.match(script, /PREVIEW_URL/);
  assert.match(script, /--mobile/);
  assert.match(script, /--headless/);
  assert.match(script, /npm run dev/);
  for (const endpoint of [
    String.raw`\/api\/session`,
    String.raw`\/api\/translate`,
    String.raw`\/api\/phrases`,
    String.raw`\/api\/ai\/chats`,
    "write-proposals",
    String.raw`\/cancel`,
  ]) {
    assert.ok(script.includes(endpoint), endpoint);
  }
  for (const method of ['method === "PATCH"', 'method === "DELETE"']) {
    assert.ok(script.includes(method), method);
  }
});
