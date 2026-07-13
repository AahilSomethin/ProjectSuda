import {
  formatBriefingMessage,
  formatBriefingVoiceText,
  formatTaskChangesUpdate,
  formatTaskChangesVoiceText,
} from "../services/briefing";
import { getGreetingTitle } from "./timezone";
import type {
  ActiveTransmission,
  LinearBriefingResponse,
  TransmissionPayload,
} from "../types";
import type { TaskChange } from "./taskChanges";

export const SUDA_MESSAGES = {
  idle: "No active transmission",
  checkingLinear: "Checking Linear…",
  briefingError:
    "Failed to load Linear briefing: I couldn't reach Linear right now. Check your connection and LINEAR_API_KEY, then try again.",
  linearAuthUnavailable:
    "Linear authentication is unavailable. Linear monitoring has been paused, but GitHub monitoring remains active.",
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
    title: getGreetingTitle(),
    message: formatBriefingMessage(briefing),
    voiceMessage: formatBriefingVoiceText(briefing),
    type: "briefing",
    skipIntro: options?.skipIntro ?? true,
    voiceEnabled: options?.voiceEnabled ?? false,
  };
}

export function createStartupBriefingPayload(
  briefing: LinearBriefingResponse,
  options?: { voiceEnabled?: boolean },
): TransmissionPayload {
  return createBriefingPayload(briefing, {
    voiceEnabled: options?.voiceEnabled ?? false,
    skipIntro: true,
  });
}

export function createCheckingLinearPayload(): TransmissionPayload {
  return {
    title: getGreetingTitle(),
    message: SUDA_MESSAGES.checkingLinear,
    type: "briefing",
    skipIntro: true,
    voiceEnabled: false,
  };
}

export function createBriefingErrorPayload(message: string): TransmissionPayload {
  return {
    title: getGreetingTitle(),
    message,
    type: "briefing",
    skipIntro: true,
    voiceEnabled: false,
  };
}

export function createSummonedIdlePayload(): TransmissionPayload {
  return {
    title: "SUDA",
    message: SUDA_MESSAGES.idle,
    type: "info",
    skipIntro: true,
    voiceEnabled: false,
    persistUntilDismissed: true,
  };
}

export function createCombinedBriefingPayload(
  briefing: {
    title: string;
    message: string;
    voiceMessage: string;
  },
  options?: { voiceEnabled?: boolean },
): TransmissionPayload {
  return {
    title: briefing.title,
    message: briefing.message,
    voiceMessage: briefing.voiceMessage,
    type: "update",
    skipIntro: true,
    voiceEnabled: options?.voiceEnabled ?? true,
  };
}

export function createTaskChangesPayload(
  changes: TaskChange[],
): TransmissionPayload {
  return {
    title: "SUDA",
    message: formatTaskChangesUpdate(changes),
    voiceMessage: formatTaskChangesVoiceText(changes),
    type: "update",
    skipIntro: true,
    voiceEnabled: true,
  };
}

export function getTransmissionAutoHideMs(
  transmission: ActiveTransmission,
): number | undefined {
  if (transmission.persistUntilDismissed) {
    return undefined;
  }
  if (transmission.message.startsWith("Failed to load Linear briefing")) {
    return AUTO_HIDE_MS.error;
  }
  if (transmission.message === SUDA_MESSAGES.idle) {
    return AUTO_HIDE_MS.idle;
  }
  return AUTO_HIDE_MS.default;
}
