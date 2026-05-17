import { AI_COORDINATOR_MAX_RECENT_TURNS, AI_COORDINATOR_WELCOME_MESSAGE } from "./constants";
import { emptyLeadData, type AiLeadData } from "./leadData";
import { createAiCoordinatorMessage, type AiCoordinatorMessage, type AiCoordinatorHistoryTurn } from "./types";

/** Fresh in-memory session with welcome assistant message. */
export function createInitialAiCoordinatorMessages(
  welcomeMessage: string = AI_COORDINATOR_WELCOME_MESSAGE,
): AiCoordinatorMessage[] {
  return [createAiCoordinatorMessage("assistant", welcomeMessage)];
}

/**
 * MVP session holder (React state). Future: swap for persistence adapter.
 */
export type AiCoordinatorSessionState = {
  messages: AiCoordinatorMessage[];
  clinicId: string | null;
  /** Rolling memory — sent to API instead of full history. */
  conversationSummary: string;
  /** Accumulated lead intelligence (Phase 3). */
  leadData: AiLeadData;
};

export function createAiCoordinatorSession(clinicId?: string | null): AiCoordinatorSessionState {
  return {
    messages: createInitialAiCoordinatorMessages(),
    clinicId: clinicId ? String(clinicId).trim() : null,
    conversationSummary: "",
    leadData: emptyLeadData(),
  };
}

/**
 * Last N turns for API only. UI may keep full message list locally.
 */
export function buildCoordinatorHistory(
  messages: AiCoordinatorMessage[],
  excludeMessageId?: string,
): AiCoordinatorHistoryTurn[] {
  const turns = messages
    .filter((m) => m.id !== excludeMessageId && (m.role === "patient" || m.role === "assistant"))
    .map((m) => ({
      role: m.role === "patient" ? ("patient" as const) : ("assistant" as const),
      text: m.text,
    }));
  return turns.slice(-AI_COORDINATOR_MAX_RECENT_TURNS);
}
