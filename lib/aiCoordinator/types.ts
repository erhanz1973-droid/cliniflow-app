/**
 * AI treatment coordinator — types & future extension points (MVP: in-memory only).
 */

import type { AiLeadData } from "./leadData";
import type { SmileScoreData } from "../smileScore";

export type AiCoordinatorMessageRole = "patient" | "assistant" | "system";

/** Delivery channel — only `in_app` is used in MVP. */
export type AiCoordinatorChannel = "in_app" | "whatsapp";

/** Patient Treatment Guide vs coordinator operations (travel/hotels on server). */
export type AiCoordinatorContextMode = "treatment_guide" | "coordinator";

export interface AiCoordinatorMessage {
  id: string;
  role: AiCoordinatorMessageRole;
  text: string;
  createdAt: number;
  /** Future: mirror outbound/inbound WhatsApp */
  channel?: AiCoordinatorChannel;
  /** Per-turn extraction snapshot (assistant messages only) */
  leadHints?: AiLeadData;
  /** Transient UI state */
  pending?: boolean;
  failed?: boolean;
}

export interface AiCoordinatorHistoryTurn {
  role: "patient" | "assistant";
  text: string;
}

export interface AiCoordinatorLeadPipelineMeta {
  saved: boolean;
  profileId?: string;
  sessionId?: string;
  isHot?: boolean;
  leadScore?: number;
  reason?: string;
}

export interface AiCoordinatorChatRequest {
  message: string;
  clinicId?: string;
  /** Stable session key for CRM upsert (required for pipeline persistence). */
  sessionId?: string;
  patientId?: string;
  /** Last N turns only — never send full transcript. */
  history?: AiCoordinatorHistoryTurn[];
  /** Rolling summary from prior turns (server updates each response). */
  conversationSummary?: string | null;
  /** Session-accumulated lead profile from prior turns. */
  priorLeadData?: AiLeadData | null;
  /** When `treatment_guide`, server omits travel/hotel context and uses guide tone. */
  contextMode?: AiCoordinatorContextMode;
  includeTravelContext?: boolean;
  /** Latest smile analysis — powers "Ask AI About My Results". */
  smileAnalysisContext?: SmileScoreData | null;
}

export type AiCoordinatorChatResponse =
  | {
      success: true;
      reply: string;
      leadData: AiLeadData;
      leadSummarySections?: Array<{ id: string; title: string; bullets: string[] }>;
      leadSummaryLines?: string[];
      leadSummaryParagraph?: string;
      conversationSummary?: string;
      leadPipeline?: AiCoordinatorLeadPipelineMeta;
      operationalIntakeFlags?: Record<string, unknown> | null;
      intakeJourney?: Record<string, unknown> | null;
    }
  | { success: false; error?: string; message?: string };

/** Future: Supabase persistence (not implemented). */
export interface AiCoordinatorPersistenceAdapter {
  loadSession(clinicId?: string | null): Promise<{
    messages: AiCoordinatorMessage[];
    conversationSummary: string;
    leadData: AiLeadData;
  }>;
  saveSession(state: {
    messages: AiCoordinatorMessage[];
    conversationSummary: string;
    leadData: AiLeadData;
    clinicId?: string | null;
  }): Promise<void>;
}

/** Future: WhatsApp Business bridge (not implemented). */
export interface AiCoordinatorWhatsAppAdapter {
  sendToPatient(params: { phone: string; text: string }): Promise<void>;
  onInboundMessage(handler: (msg: { text: string; externalId: string }) => void): void;
}

/** Future: human coordinator handoff (not implemented). */
export interface AiCoordinatorHandoffAdapter {
  requestHumanCoordinator(params: {
    clinicId?: string | null;
    patientId?: string | null;
    reason?: string;
    transcript?: AiCoordinatorMessage[];
  }): Promise<{ ticketId?: string }>;
}

/** Future: batch re-extract full transcript (CRM sync). */
export interface AiCoordinatorLeadExtractor {
  extract(transcript: AiCoordinatorMessage[]): Promise<AiLeadData>;
}

export function createAiCoordinatorMessage(
  role: AiCoordinatorMessageRole,
  text: string,
  partial?: Partial<AiCoordinatorMessage>,
): AiCoordinatorMessage {
  return {
    id: `aic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    role,
    text,
    createdAt: Date.now(),
    channel: "in_app",
    ...partial,
  };
}
