import { invoke } from "@tauri-apps/api/core";
import type { LinearBriefingResponse, LinearTask } from "../types";

let cachedBriefing: LinearBriefingResponse | null = null;

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

const VOICE_LIMIT_BRIEFING = 400;
const VOICE_LIMIT_EMPTY = 120;
const VOICE_LIMIT_NEW_TASKS = 200;

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

export function formatNewTasksVoiceText(tasks: LinearTask[]): string {
  if (tasks.length === 0) {
    return "";
  }

  const count = tasks.length;
  const header = `${count} new Linear task${count === 1 ? "" : "s"}.`;
  const firstTask = tasks[0];
  const text = firstTask
    ? `${header} Start with ${firstTask.title}.`
    : header;

  return truncateVoiceText(text, VOICE_LIMIT_NEW_TASKS);
}

export function getBriefingVoiceFingerprint(
  briefing: LinearBriefingResponse,
): string {
  const topTaskId = briefing.rawTasks[0]?.identifier ?? "";
  const warningKey = briefing.warnings.join("|");
  return `${briefing.taskCount}:${briefing.stats.overdue}:${briefing.stats.urgentOrHigh}:${topTaskId}:${warningKey}`;
}

export function formatNewTasksUpdate(tasks: LinearTask[]): string {
  if (tasks.length === 0) {
    return "No new Linear tasks.";
  }

  const header = `${tasks.length} new Linear task${tasks.length === 1 ? "" : "s"}:`;
  const lines = tasks.map((task) => {
    const priority = task.priority ? `, ${task.priority}` : "";
    return `• ${task.title} [${task.status}${priority}]`;
  });

  return [header, ...lines].join("\n");
}

export function briefingToLinearTasks(
  briefing: LinearBriefingResponse,
): LinearTask[] {
  return briefing.rawTasks.map((task) => ({
    id: task.identifier,
    title: task.title,
    status: task.state,
    priority: priorityLabel(task.priority),
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
