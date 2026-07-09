import {
  formatBriefingMessage,
  formatBriefingVoiceText,
  formatNewTasksUpdate,
} from "../services/briefing";
import type {
  ActiveTransmission,
  LinearBriefingResponse,
  LinearTask,
  TransmissionPayload,
} from "../types";

export const SUDA_MESSAGES = {
  idle: "SUDA online. No active transmission.",
  checkingLinear: "Checking Linear…",
  briefingError:
    "Failed to load Linear briefing: I couldn't reach Linear right now. Check your connection and LINEAR_API_KEY, then try again.",
} as const;

const AUTO_HIDE_MS = {
  default: 10_000,
  error: 15_000,
  idle: 8_000,
} as const;

export function createBriefingPayload(
  briefing: LinearBriefingResponse,
  options?: { voiceEnabled?: boolean; skipIntro?: boolean },
): TransmissionPayload {
  return {
    title: "Morning Briefing",
    message: formatBriefingMessage(briefing),
    voiceMessage: formatBriefingVoiceText(briefing),
    type: "briefing",
    skipIntro: options?.skipIntro ?? true,
    voiceEnabled: options?.voiceEnabled ?? true,
    showActions: true,
  };
}

export function createCheckingLinearPayload(): TransmissionPayload {
  return {
    title: "Morning Briefing",
    message: SUDA_MESSAGES.checkingLinear,
    type: "briefing",
    skipIntro: true,
    voiceEnabled: true,
    showActions: true,
  };
}

export function createBriefingErrorPayload(message: string): TransmissionPayload {
  return {
    title: "Morning Briefing",
    message,
    type: "briefing",
    skipIntro: true,
    voiceEnabled: true,
    showActions: true,
  };
}

export function createIdlePayload(): TransmissionPayload {
  return {
    title: "SUDA",
    message: SUDA_MESSAGES.idle,
    type: "info",
    skipIntro: true,
    voiceEnabled: true,
    showActions: true,
  };
}

export function createNewTasksPayload(tasks: LinearTask[]): TransmissionPayload {
  return {
    title: "New Transmission",
    message: formatNewTasksUpdate(tasks),
    type: "update",
    voiceEnabled: true,
  };
}

export function getTransmissionAutoHideMs(
  transmission: ActiveTransmission,
): number {
  if (transmission.message.startsWith("Failed to load Linear briefing")) {
    return AUTO_HIDE_MS.error;
  }
  if (transmission.message === SUDA_MESSAGES.idle) {
    return AUTO_HIDE_MS.idle;
  }
  return AUTO_HIDE_MS.default;
}
