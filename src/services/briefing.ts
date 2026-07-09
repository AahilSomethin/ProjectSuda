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

export function formatBriefingVoiceText(
  briefing: LinearBriefingResponse,
): string {
  const parts: string[] = [briefing.summary];

  if (briefing.warnings.length > 0) {
    parts.push(briefing.warnings.join(" "));
  }

  if (briefing.firstAction.trim()) {
    parts.push(briefing.firstAction);
  }

  return parts.join(" ");
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
