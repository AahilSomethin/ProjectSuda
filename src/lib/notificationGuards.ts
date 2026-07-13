import type {
  GitHubActivity,
  GitHubMonitorState,
  TransmissionPayload,
  WidgetSettings,
} from "../types";
import type { TaskCacheState } from "./taskCache";
import type { BriefingEvent, CombinedBriefing } from "./briefingCoordinator";
import type { TaskChange } from "./taskChanges";

export const MAX_TRANSMISSION_DEDUP_IDS = 100;

export function hasMeaningfulActivity(events: BriefingEvent[]): boolean {
  return events.length > 0;
}

export function shouldOpenTransmission(events: BriefingEvent[]): boolean {
  return hasMeaningfulActivity(events);
}

export function isLinearBaselinePoll(
  cache: TaskCacheState,
  changes: TaskChange[],
): boolean {
  return !cache.baselineEstablished && changes.length === 0;
}

export function isGitHubBaselinePoll(
  state: GitHubMonitorState,
  activities: GitHubActivity[],
): boolean {
  return !state.baselineEstablished && activities.length === 0;
}

export function buildTransmissionDedupKey(
  events: BriefingEvent[],
  voiceMessage: string,
): string {
  const eventIds = events.map((event) => {
    if (event.kind === "linear") {
      return `linear:${event.change.task.id}:${event.change.kind}:${event.change.changes.join(",")}`;
    }
    return `github:${event.activity.id}`;
  });
  return `${eventIds.join("|")}::${voiceMessage.trim()}`;
}

export function buildTransmissionIdFromBriefing(
  briefing: CombinedBriefing,
  events: BriefingEvent[],
): string {
  return buildTransmissionDedupKey(events, briefing.voiceMessage);
}

export function isDuplicateTransmission(
  key: string,
  seen: Set<string>,
): boolean {
  return seen.has(key);
}

export function rememberTransmission(
  key: string,
  seen: Set<string>,
  maxSize = MAX_TRANSMISSION_DEDUP_IDS,
): void {
  if (seen.has(key)) return;
  seen.add(key);
  while (seen.size > maxSize) {
    const oldest = seen.values().next().value;
    if (oldest === undefined) break;
    seen.delete(oldest);
  }
}

export function canInvokeVoice(
  payload: TransmissionPayload,
  settings: WidgetSettings,
): boolean {
  return (
    payload.kind === "meaningful-activity" &&
    payload.voiceEnabled === true &&
    !settings.muteVoice &&
    (payload.voiceMessage?.trim().length ?? 0) > 0
  );
}

export function shouldShowTextOnly(
  payload: TransmissionPayload,
  settings: WidgetSettings,
): boolean {
  if (payload.kind !== "meaningful-activity") return true;
  return settings.muteVoice || (payload.voiceMessage?.trim().length ?? 0) === 0;
}
