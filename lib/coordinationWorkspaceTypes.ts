export type ConversationRole =
  | "patient"
  | "ai"
  | "human"
  | "doctor"
  | "doctor_intent"
  | "ai_draft"
  | "system";

export type ConversationKind = "message" | "system" | "doctor_intent" | "ai_draft";

export type ConversationTurn = {
  id: string;
  kind?: ConversationKind;
  role: ConversationRole;
  text: string;
  at?: string;
  channel?: string;
  label?: string | null;
  eventType?: string | null;
  source?: string | null;
};

export type OperationalEvent = {
  id: string;
  label?: string;
  eventType?: string;
  createdAt?: string;
};

export type AiState = {
  responderMode?: string | null;
  responderModeLabel?: string | null;
  primaryResponderLabel?: string | null;
  handlingStateLabel?: string | null;
  aiPaused?: boolean;
  autoReplyAllowed?: boolean;
  draftGenerationAllowed?: boolean;
  aiEscalationRequired?: boolean;
  coordinationMode?: string | null;
};

export type LeadHeat = {
  score?: number | null;
  isHot?: boolean;
  label?: string;
  messageCount?: number | null;
};

export type CurrentStrategy = {
  patientContextClass?: string;
  travelContextDetected?: boolean;
  avoidTravelCoordinationTopics?: boolean;
  journeyStage?: string | null;
  journeyStageLabel?: string | null;
  readinessPercent?: number | null;
  waitingParty?: string | null;
  waitingPartyLabel?: string | null;
  blockingReason?: string | null;
  nextAction?: string | null;
  recentTopics?: string[];
  pricingAlreadyDiscussed?: boolean;
  lastCtaType?: string | null;
};

export type WorkspaceProfile = {
  patientName?: string;
  treatmentInterest?: string | null;
  country?: string | null;
  responderMode?: string;
  responderModeLabel?: string;
  primaryResponderLabel?: string;
  handlingStateLabel?: string;
  conversationSummary?: string;
  delegation?: {
    statusLabel?: string;
    draftGenerationAllowed?: boolean;
    autoReplyAllowed?: boolean;
    aiEscalationRequired?: boolean;
  };
};

export type CoordinationWorkspaceResponse = {
  ok?: boolean;
  profile?: WorkspaceProfile | null;
  conversation?: ConversationTurn[];
  supervisionFeed?: ConversationTurn[];
  messages?: ConversationTurn[];
  aiState?: AiState;
  leadHeat?: LeadHeat;
  currentStrategy?: CurrentStrategy;
  blocker?: string | null;
  nextStep?: string | null;
  latestAiReply?: string | null;
  latestAiReplyAt?: string | null;
  latestPatientMessage?: string | null;
  error?: string;
  message?: string;
};
