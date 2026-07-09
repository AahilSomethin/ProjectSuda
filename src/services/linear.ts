import type { LinearTask } from "../types";
import {
  BriefingError,
  briefingToLinearTasks,
  fetchLinearBriefing,
  formatBriefingLoadError,
  getCachedBriefing,
} from "./briefing";

function isIncomplete(status: string): boolean {
  const done = ["done", "completed", "cancelled", "canceled"];
  return !done.includes(status.toLowerCase());
}

function tasksFromCache(): LinearTask[] | null {
  const cached = getCachedBriefing();
  if (!cached) return null;
  return briefingToLinearTasks(cached).filter((task) =>
    isIncomplete(task.status),
  );
}

export async function fetchIncompleteLinearTasks(
  forceRefresh = false,
): Promise<LinearTask[]> {
  if (!forceRefresh) {
    const cached = tasksFromCache();
    if (cached !== null) {
      return cached;
    }
  }

  try {
    const briefing = await fetchLinearBriefing();
    return briefingToLinearTasks(briefing).filter((task) =>
      isIncomplete(task.status),
    );
  } catch (error) {
    if (error instanceof BriefingError) {
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Unknown error";
    throw new BriefingError(formatBriefingLoadError(message));
  }
}

export { fetchLinearBriefing, BriefingError };
