import type { LinearTask } from "../types";

export interface TaskSnapshot {
  id: string;
  linearId: string;
  updatedAt: string;
  fingerprint: string;
  announcedUpdatedAt?: string;
  announcedDueSoonKey?: string;
}

export interface TaskCacheState {
  baselineEstablished: boolean;
  snapshots: Record<string, TaskSnapshot>;
}

const CACHE_KEY = "suda-task-cache";

export const EMPTY_TASK_CACHE: TaskCacheState = {
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

export function loadTaskCache(): TaskCacheState {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...EMPTY_TASK_CACHE, snapshots: {} };
    const parsed = JSON.parse(raw) as TaskCacheState;
    return {
      baselineEstablished: parsed.baselineEstablished ?? false,
      snapshots: parsed.snapshots ?? {},
    };
  } catch {
    return { ...EMPTY_TASK_CACHE, snapshots: {} };
  }
}

export function saveTaskCache(state: TaskCacheState): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(state));
}

export function establishBaseline(
  state: TaskCacheState,
  tasks: LinearTask[],
): TaskCacheState {
  const snapshots: Record<string, TaskSnapshot> = { ...state.snapshots };
  for (const task of tasks) {
    snapshots[task.id] = snapshotFromTask(task);
  }
  return {
    baselineEstablished: true,
    snapshots,
  };
}

export function upsertSnapshots(
  state: TaskCacheState,
  tasks: LinearTask[],
  patch?: (snapshot: TaskSnapshot, task: LinearTask) => TaskSnapshot,
): TaskCacheState {
  const snapshots = { ...state.snapshots };
  for (const task of tasks) {
    const base = snapshotFromTask(task);
    const existing = snapshots[task.id];
    snapshots[task.id] = patch
      ? patch({ ...existing, ...base }, task)
      : { ...existing, ...base };
  }
  return { ...state, snapshots };
}
