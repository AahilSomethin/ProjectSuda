export type TransmissionType = "task" | "meeting" | "update" | "info" | "briefing";

export type TransmissionPhase = "idle" | "intro" | "message";

export interface LinearTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  updatedAt: string;
}

export interface BriefingFocusTask {
  title: string;
  reason: string;
  url?: string | null;
}

export interface BriefingRawTask {
  identifier: string;
  title: string;
  url: string;
  state: string;
  priority: number;
  dueDate?: string | null;
  updatedAt?: string | null;
  project?: string | null;
  team?: string | null;
}

export interface BriefingStats {
  urgentOrHigh: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  noDueDate: number;
}

export interface LinearBriefingResponse {
  source: "linear";
  generatedAt: string;
  taskCount: number;
  summary: string;
  focusTasks: BriefingFocusTask[];
  warnings: string[];
  firstAction: string;
  stats: BriefingStats;
  rawTasks: BriefingRawTask[];
}

export interface TransmissionPayload {
  title: string;
  message: string;
  /** Optional shorter text for TTS; defaults to message when omitted */
  voiceMessage?: string;
  type: TransmissionType;
  voiceEnabled?: boolean;
  characterVisible?: boolean;
  /** Skip the 3s GIF intro — used for idle/empty status messages */
  skipIntro?: boolean;
  /** Show action buttons in the status popup (e.g. Refresh Briefing) */
  showActions?: boolean;
}

export interface WidgetSettings {
  muteVoice: boolean;
  disableText: boolean;
  hideCharacter: boolean;
}

export interface ActiveTransmission extends TransmissionPayload {
  phase: TransmissionPhase;
}
