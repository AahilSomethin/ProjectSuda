import type { LinearTask } from "../types";
import { TASK_CACHE_VERSION } from "../types";

export interface TaskSnapshot {
  id: string;
  linearId: string;
  updatedAt: string;
  fingerprint: string;
  announcedUpdatedAt?: string;
  announcedDueSoonKey?: string;
}

export interface TaskCacheState {
  version?: number;
  baselineEstablished: boolean;
  snapshots: Record<string, TaskSnapshot>;
}

const CACHE_KEY = "suda-task-cache";

export const EMPTY_TASK_CACHE: TaskCacheState = {
  version: TASK_CACHE_VERSION,
  baselineEstablished: false,
  snapshots: {},
};

export function buildTaskFingerprint(task: LinearTask): string {
  return [
    task.title,
    task.description ?? "",
    task.status,
    task.priority ?? "",
    task.dueDate ?? "",
    task.assignee ?? "",
  ].join("|");
}

export function snapshotFromTask(task: LinearTask): TaskSnapshot {
  return {
    id: task.id,
    linearId: task.linearId,
    updatedAt: task.updatedAt,
    fingerprint: buildTaskFingerprint(task),
  };
}

function migrateTaskCache(parsed: Partial<TaskCacheState>): TaskCacheState {
  return {
    version: parsed.version ?? TASK_CACHE_VERSION,
    baselineEstablished: parsed.baselineEstablished ?? false,
    snapshots: parsed.snapshots ?? {},
  };
}

export function loadTaskCache(): TaskCacheState {
  if (typeof localStorage === "undefined") {
    return { ...EMPTY_TASK_CACHE, snapshots: {} };
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...EMPTY_TASK_CACHE, snapshots: {} };
    const parsed = JSON.parse(raw) as Partial<TaskCacheState>;
    return migrateTaskCache(parsed);
  } catch {
    return { ...EMPTY_TASK_CACHE, snapshots: {} };
  }
}

export function saveTaskCache(state: TaskCacheState): void {
  if (typeof localStorage === "undefined") return;
  const normalized: TaskCacheState = {
    ...state,
    version: TASK_CACHE_VERSION,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(normalized));
}

export function establishBaseline(
  _cache: TaskCacheState,
  tasks: LinearTask[],
): TaskCacheState {
  const snapshots: Record<string, TaskSnapshot> = {};
  for (const task of tasks) {
    snapshots[task.id] = snapshotFromTask(task);
  }
  return {
    version: TASK_CACHE_VERSION,
    baselineEstablished: true,
    snapshots,
  };
}

export function pruneSnapshotsToTasks(
  cache: TaskCacheState,
  tasks: LinearTask[],
): TaskCacheState {
  const taskIds = new Set(tasks.map((task) => task.id));
  const snapshots: Record<string, TaskSnapshot> = {};
  for (const [id, snapshot] of Object.entries(cache.snapshots)) {
    if (taskIds.has(id)) {
      snapshots[id] = snapshot;
    }
  }
  return { ...cache, snapshots };
}
