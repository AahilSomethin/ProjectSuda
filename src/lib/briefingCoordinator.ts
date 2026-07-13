import type { GitHubActivity } from "../types";
import type { TaskChange } from "./taskChanges";
import {
  formatGitHubActivityMessage,
  githubActivityPriority,
  sortGitHubActivities,
} from "./githubChanges";
import {
  formatTaskChangeBullet,
  formatTaskChangeVoiceLine,
} from "../services/briefing";

export const MAX_BRIEFING_EVENTS = 5;

export type BriefingEvent =
  | { kind: "github"; activity: GitHubActivity; priority: number }
  | { kind: "linear"; change: TaskChange; priority: number };

const PRIORITY = {
  prMerged: 1,
  githubPush: 2,
  calendar: 3,
  linear: 4,
  branchCreated: 5,
  prUpdated: 6,
} as const;

export function createBriefingEvents(input: {
  githubActivities?: GitHubActivity[];
  linearChanges?: TaskChange[];
}): BriefingEvent[] {
  const events: BriefingEvent[] = [];

  for (const activity of input.githubActivities ?? []) {
    events.push({
      kind: "github",
      activity,
      priority: githubActivityPriority(activity),
    });
  }

  for (const change of input.linearChanges ?? []) {
    events.push({
      kind: "linear",
      change,
      priority: PRIORITY.linear,
    });
  }

  return events.sort((a, b) => a.priority - b.priority);
}

export interface CombinedBriefing {
  title: string;
  message: string;
  voiceMessage: string;
  overflowMessages: string[];
}

function eventBullet(event: BriefingEvent): string {
  if (event.kind === "linear") {
    return formatTaskChangeBullet(event.change);
  }
  return formatGitHubActivityMessage(event.activity);
}

function eventVoiceLine(event: BriefingEvent): string {
  if (event.kind === "linear") {
    return formatTaskChangeVoiceLine(event.change);
  }
  return formatGitHubActivityMessage(event.activity);
}

export function buildCombinedBriefing(events: BriefingEvent[]): CombinedBriefing | null {
  if (events.length === 0) return null;

  const bulletLines = events.map((event) => `• ${eventBullet(event)}`);
  const displayed = bulletLines.slice(0, MAX_BRIEFING_EVENTS);
  const overflow = bulletLines.slice(MAX_BRIEFING_EVENTS);

  const message = ["SUDA update:", ...displayed].join("\n");

  const voiceParts = events
    .slice(0, MAX_BRIEFING_EVENTS)
    .map((event) => eventVoiceLine(event));

  return {
    title: "SUDA",
    message,
    voiceMessage: voiceParts.join(" "),
    overflowMessages: overflow,
  };
}

export function groupGitHubByRepo(activities: GitHubActivity[]): GitHubActivity[] {
  return sortGitHubActivities(activities);
}
