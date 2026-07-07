export type TransmissionType = "task" | "meeting" | "update" | "info";

export type TransmissionPhase = "idle" | "intro" | "message";

export type PersonalityMode =
  | "gentle"
  | "focused"
  | "strict"
  | "bitchy"
  | "stubborn"
  | "cheerful"
  | "deadpan"
  | "motivational"
  | "chaotic";

export const PERSONALITY_MODES: PersonalityMode[] = [
  "gentle",
  "focused",
  "strict",
  "bitchy",
  "stubborn",
  "cheerful",
  "deadpan",
  "motivational",
  "chaotic",
];

export interface LinearTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: string;
  updatedAt: string;
}

export interface CalendarMeeting {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
}

export interface TransmissionPayload {
  title: string;
  message: string;
  type: TransmissionType;
  voiceEnabled?: boolean;
  characterVisible?: boolean;
  /** Skip the 3s GIF intro — used for idle/empty status messages */
  skipIntro?: boolean;
  /** Show action buttons in the status popup (e.g. Summarize Tasks) */
  showActions?: boolean;
}

export interface WidgetSettings {
  muteVoice: boolean;
  disableText: boolean;
  hideCharacter: boolean;
  personality: PersonalityMode;
}

export interface ActiveTransmission extends TransmissionPayload {
  phase: TransmissionPhase;
}
