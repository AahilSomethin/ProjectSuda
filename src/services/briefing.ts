import { invoke } from "@tauri-apps/api/core";
import { formatDueLabelInMaldivesTime } from "../lib/timezone";
import type { LinearBriefingResponse, LinearTask } from "../types";
import type { TaskChange } from "../lib/taskChanges";

let cachedBriefing: LinearBriefingResponse | null = null;

const VOICE_LIMIT_BRIEFING = 400;
const VOICE_LIMIT_EMPTY = 120;
const VOICE_LIMIT_UPDATES = 700;
const VOICE_TOP_UPDATES = 5;

function isTauriInvokeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

export class BriefingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefingError";
  }
}

function extractInvokeErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  return "Unknown error";
}

export function formatBriefingLoadError(backendMessage: string): string {
  const detail = backendMessage.trim() || "Unknown error";
  return `Failed to load Linear briefing: ${detail}`;
}

export async function fetchLinearBriefing(): Promise<LinearBriefingResponse> {
  if (!isTauriInvokeAvailable()) {
    throw new BriefingError(
      formatBriefingLoadError("Linear briefing requires the SUDA desktop app."),
    );
  }

  try {
    const result = await invoke<LinearBriefingResponse>("linear_briefing");
    cachedBriefing = result;
    return result;
  } catch (error) {
    throw new BriefingError(formatBriefingLoadError(extractInvokeErrorMessage(error)));
  }
}

export function getCachedBriefing(): LinearBriefingResponse | null {
  return cachedBriefing;
}

export function setCachedBriefing(briefing: LinearBriefingResponse | null): void {
  cachedBriefing = briefing;
}

export function evaluateStartupImportance(
  briefing: LinearBriefingResponse,
): boolean {
  if (briefing.taskCount === 0) return false;
  const { stats } = briefing;
  return (
    stats.overdue > 0 ||
    stats.dueToday > 0 ||
    stats.urgentOrHigh > 0
  );
}

export function formatBriefingMessage(briefing: LinearBriefingResponse): string {
  const lines: string[] = [briefing.summary];

  const { stats } = briefing;
  lines.push("");
  lines.push(
    `Stats: ${stats.urgentOrHigh} urgent/high · ${stats.overdue} overdue · ${stats.dueToday} due today · ${stats.dueThisWeek} due this week · ${stats.noDueDate} no due date`,
  );

  if (briefing.focusTasks.length > 0) {
    lines.push("");
    lines.push("Focus:");
    briefing.focusTasks.forEach((task, index) => {
      lines.push(`${index + 1}. ${task.title} — ${task.reason}`);
    });
  }

  if (briefing.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    briefing.warnings.forEach((warning) => {
      lines.push(`• ${warning}`);
    });
  }

  if (briefing.firstAction.trim()) {
    lines.push("");
    lines.push(`First action: ${briefing.firstAction}`);
  }

  return lines.join("\n");
}

export function truncateVoiceText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  const slice = trimmed.slice(0, maxChars);
  const sentenceEnd = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  );

  if (sentenceEnd > 0) {
    return slice.slice(0, sentenceEnd + 1);
  }

  const wordEnd = slice.lastIndexOf(" ");
  if (wordEnd > 0) {
    return `${slice.slice(0, wordEnd)}…`;
  }

  return `${slice}…`;
}

function normalizeFirstAction(firstAction: string): string {
  return firstAction.replace(/\s*\(([^)]+)\)\./, ", $1.");
}

export function buildBriefingVoiceText(
  briefing: LinearBriefingResponse,
): string {
  if (briefing.taskCount === 0) {
    return "No active Linear tasks right now. You're clear.";
  }

  const count = briefing.taskCount;
  const parts = [
    `You have ${count} active Linear task${count === 1 ? "" : "s"}.`,
  ];

  const { stats } = briefing;
  if (stats.overdue > 0) {
    parts.push(
      `${stats.overdue} ${stats.overdue === 1 ? "is" : "are"} overdue.`,
    );
  } else if (stats.dueToday > 0) {
    parts.push(
      `${stats.dueToday} ${stats.dueToday === 1 ? "is" : "are"} due today.`,
    );
  } else if (stats.urgentOrHigh > 0) {
    parts.push(
      `${stats.urgentOrHigh} ${stats.urgentOrHigh === 1 ? "is" : "are"} urgent or high priority.`,
    );
  }

  if (briefing.firstAction.trim()) {
    parts.push(normalizeFirstAction(briefing.firstAction.trim()));
  }

  return parts.join(" ");
}

export function formatBriefingVoiceText(
  briefing: LinearBriefingResponse,
): string {
  const maxChars =
    briefing.taskCount === 0 ? VOICE_LIMIT_EMPTY : VOICE_LIMIT_BRIEFING;
  return truncateVoiceText(buildBriefingVoiceText(briefing), maxChars);
}

function taskStatusDueLabel(task: LinearTask): string {
  const due = formatDueLabelInMaldivesTime(task.dueDate);
  if (due) return `${task.status}, ${due}`;
  return task.status;
}

function formatTaskShortLine(change: TaskChange): string {
  const { task, changes, kind } = change;
  const statusDue = taskStatusDueLabel(task);
  const changeNote =
    kind === "new"
      ? ""
      : changes.length > 0
        ? ` (${changes.join(", ")})`
        : "";
  return `${task.id} ${task.title} — ${statusDue}${changeNote}`;
}

export function formatTaskChangesUpdate(changes: TaskChange[]): string {
  if (changes.length === 0) {
    return "No Linear updates.";
  }

  const header = `${changes.length} Linear update${changes.length === 1 ? "" : "s"}:`;
  const lines = changes.map((change) => `• ${formatTaskShortLine(change)}`);
  return [header, ...lines].join("\n");
}

export function formatTaskChangesVoiceText(changes: TaskChange[]): string {
  if (changes.length === 0) return "";

  const count = changes.length;
  const header = `${count} Linear update${count === 1 ? "" : "s"}.`;
  const top = changes.slice(0, VOICE_TOP_UPDATES);
  const lines = top.map((change) => {
    const { task, changes: changeLabels, kind } = change;
    const statusDue = taskStatusDueLabel(task);
    if (kind === "new") {
      return `${task.id} ${task.title}, ${statusDue}.`;
    }
    const note =
      changeLabels.includes("description updated")
        ? "description updated"
        : changeLabels.join(", ");
    return `${task.id} ${task.title}, ${statusDue}, ${note}.`;
  });

  const remainder = count - top.length;
  const tail =
    remainder > 0 ? ` Plus ${remainder} more update${remainder === 1 ? "" : "s"}.` : "";

  return truncateVoiceText(`${header} ${lines.join(" ")}${tail}`, VOICE_LIMIT_UPDATES);
}

export function briefingToLinearTasks(
  briefing: LinearBriefingResponse,
): LinearTask[] {
  return briefing.rawTasks.map((task) => ({
    id: task.identifier,
    linearId: task.linearId,
    title: task.title,
    description: task.description ?? undefined,
    status: task.state,
    priority: priorityLabel(task.priority),
    dueDate: task.dueDate,
    assignee: task.assignee,
    updatedAt: task.updatedAt ?? briefing.generatedAt,
  }));
}

function priorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Normal";
    case 4:
      return "Low";
    default:
      return "None";
  }
}
