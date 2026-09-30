import type { AiChatMeaningMode } from "./contracts.ts";
import type { AiChatTerminalTelemetry } from "./terminal-telemetry.ts";
import type { AiChatPublicWriteProposal } from "./write-proposals.ts";

export type AiChatPublicMeaning = {
  id: string | null;
  source: "legacy" | "personal";
  translation: string;
  context: string;
};

export type AiChatPublicTarget = {
  id: string;
  phraseId: string | null;
  text: string;
  meaningMode: AiChatMeaningMode;
  selectedMeaningId: string | null;
  selectedMeaningSnapshot: string;
  selectedMeaning: AiChatPublicMeaning | null;
  knownMeanings: AiChatPublicMeaning[];
  createdAt: string;
  updatedAt: string;
};

export type AiChatPublicMessage = {
  id: string;
  role: "user" | "assistant";
  sequence: number;
  content: string;
  status: "complete" | "pending" | "failed";
  clientMessageId: string;
  errorCode: string | null;
  terminal: AiChatTerminalTelemetry | null;
  createdAt: string;
  updatedAt: string;
};

export type AiChatPublicTurnTerminal = {
  clientMessageId: string;
  assistantMessageId: string;
  status: "complete" | "pending" | "failed";
  errorCode: string | null;
};

export type AiChatPublicSummary = {
  id: string;
  title: string;
  explanationLanguage: string;
  targetCount: number;
  messageCount: number;
  /** One plain-text line from the latest message; empty for a chat without text yet. */
  preview: string;
  createdAt: string;
  updatedAt: string;
};

export type AiChatPublicDetail = AiChatPublicSummary & {
  targets: AiChatPublicTarget[];
  messages: AiChatPublicMessage[];
  writeProposals: AiChatPublicWriteProposal[];
};
