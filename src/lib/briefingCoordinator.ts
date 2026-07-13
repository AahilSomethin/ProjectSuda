import type { GitHubActivity } from "../types";
import type { TaskChange } from "./taskChanges";
import {
  formatGitHubActivityMessage,
  githubActivityPriority,
  sortGitHubActivities,
} from "./githubChanges";
import { formatTaskChangesUpdate, formatTaskChangesVoiceText } from "../services/briefing";

export const MAX_BRIEFING_EVENTS = 5;

export type BriefingEvent =
  | { kind: "github"; activity: GitHubActivity; priority: number }
  | { kind: "linear"; changes: TaskChange[]; priority: number }
  | { kind: "integration_warning"; message: string; priority: number; key: string };

const PRIORITY = {
  prMerged: 1,
  githubPush: 2,
  calendar: 3,
  linear: 4,
  integrationWarning: 5,
} as const;

export function createBriefingEvents(input: {
  githubActivities?: GitHubActivity[];
  linearChanges?: TaskChange[];
  integrationWarnings?: Array<{ message: string; key: string }>;
}): BriefingEvent[] {
  const events: BriefingEvent[] = [];

  for (const activity of input.githubActivities ?? []) {
    events.push({
      kind: "github",
      activity,
      priority: githubActivityPriority(activity),
    });
  }

  if (input.linearChanges && input.linearChanges.length > 0) {
    events.push({
      kind: "linear",
      changes: input.linearChanges,
      priority: PRIORITY.linear,
    });
  }

  for (const warning of input.integrationWarnings ?? []) {
    events.push({
      kind: "integration_warning",
      message: warning.message,
      key: warning.key,
      priority: PRIORITY.integrationWarning,
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

export function buildCombinedBriefing(events: BriefingEvent[]): CombinedBriefing | null {
  if (events.length === 0) return null;

  const bulletLines: string[] = [];
  const overflow: string[] = [];

  for (const event of events) {
    if (event.kind === "linear") {
      const text = formatTaskChangesUpdate(event.changes);
      const lines = text.split("\n").slice(1);
      bulletLines.push(...lines.map((line) => line.replace(/^•\s*/, "• ")));
      continue;
    }

    if (event.kind === "integration_warning") {
      bulletLines.push(`• ${event.message}`);
      continue;
    }

    bulletLines.push(`• ${formatGitHubActivityMessage(event.activity)}`);
  }

  const displayed = bulletLines.slice(0, MAX_BRIEFING_EVENTS);
  overflow.push(...bulletLines.slice(MAX_BRIEFING_EVENTS));

  const githubRepos = [
    ...new Set(
      events
        .filter((e): e is Extract<BriefingEvent, { kind: "github" }> => e.kind === "github")
        .map((e) => e.activity.repository),
    ),
  ];

  const header =
    githubRepos.length === 1
      ? `GitHub update for ${githubRepos[0]}:`
      : githubRepos.length > 1
        ? "GitHub updates:"
        : events.some((e) => e.kind === "linear")
          ? "Updates:"
          : "Transmission:";

  const message = [header, ...displayed].join("\n");

  const voiceParts: string[] = [];
  for (const event of events.slice(0, MAX_BRIEFING_EVENTS)) {
    if (event.kind === "github") {
      voiceParts.push(formatGitHubActivityMessage(event.activity));
    } else if (event.kind === "linear") {
      voiceParts.push(formatTaskChangesVoiceText(event.changes));
    } else if (event.kind === "integration_warning") {
      voiceParts.push(event.message);
    }
  }

  return {
    title: "New Transmission",
    message,
    voiceMessage: voiceParts.join(" "),
    overflowMessages: overflow,
  };
}

export function groupGitHubByRepo(activities: GitHubActivity[]): GitHubActivity[] {
  return sortGitHubActivities(activities);
}
