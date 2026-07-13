import { getGreetingTitle } from "./timezone";
import type {
  ActiveTransmission,
  LinearBriefingResponse,
  TransmissionPayload,
} from "../types";
import type { CombinedBriefing } from "./briefingCoordinator";
import { buildTransmissionIdFromBriefing } from "./notificationGuards";
import type { BriefingEvent } from "./briefingCoordinator";

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

export function createCombinedBriefingPayload(
  briefing: CombinedBriefing,
  events: BriefingEvent[],
  options?: { voiceEnabled?: boolean },
): TransmissionPayload {
  const voiceEnabled = options?.voiceEnabled ?? true;
  const voiceMessage = briefing.voiceMessage.trim();

  return {
    title: briefing.title,
    message: briefing.message,
    voiceMessage,
    type: "update",
    kind: "meaningful-activity",
    transmissionId: buildTransmissionIdFromBriefing(briefing, events),
    skipIntro: true,
    voiceEnabled: voiceEnabled && voiceMessage.length > 0,
  };
}

export function createSummonedIdlePayload(): TransmissionPayload {
  return {
    title: "SUDA",
    message: SUDA_MESSAGES.idle,
    type: "info",
    kind: "idle",
    skipIntro: true,
    voiceEnabled: false,
    persistUntilDismissed: true,
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

// Legacy payload builders kept for tests — not used in runtime notification flow.
export function createBriefingPayload(
  briefing: LinearBriefingResponse,
  options?: { voiceEnabled?: boolean; skipIntro?: boolean },
): TransmissionPayload {
  return {
    title: getGreetingTitle(),
    message: briefing.summary,
    voiceMessage: "",
    type: "briefing",
    kind: "status",
    skipIntro: options?.skipIntro ?? true,
    voiceEnabled: options?.voiceEnabled ?? false,
  };
}

export function createCheckingLinearPayload(): TransmissionPayload {
  return {
    title: getGreetingTitle(),
    message: SUDA_MESSAGES.checkingLinear,
    type: "briefing",
    kind: "status",
    skipIntro: true,
    voiceEnabled: false,
  };
}

export function createBriefingErrorPayload(message: string): TransmissionPayload {
  return {
    title: getGreetingTitle(),
    message,
    type: "briefing",
    kind: "status",
    skipIntro: true,
    voiceEnabled: false,
  };
}
