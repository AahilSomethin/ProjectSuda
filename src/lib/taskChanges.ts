import {
  isOverdueInMaldives,
  isTodayInMaldives,
  isTomorrowInMaldives,
} from "./timezone";
import {
  establishBaseline,
  loadTaskCache,
  saveTaskCache,
  snapshotFromTask,
  type TaskCacheState,
  type TaskSnapshot,
} from "./taskCache";
import type { LinearTask } from "../types";

export type TaskChangeKind = "new" | "updated" | "dueSoon";

export interface TaskChange {
  kind: TaskChangeKind;
  task: LinearTask;
  changes: string[];
}

export interface DetectTaskChangesResult {
  changes: TaskChange[];
  nextCache: TaskCacheState;
}

function describeFieldChanges(
  previous: TaskSnapshot,
  task: LinearTask,
): string[] {
  const changes: string[] = [];
  const prevParts = previous.fingerprint.split("|");
  const [prevTitle, prevDesc, prevStatus, prevPriority, prevDue, prevAssignee] =
    prevParts;

  if (prevTitle !== task.title) changes.push("title");
  if (prevDesc !== (task.description ?? "")) changes.push("description");
  if (prevStatus !== task.status) changes.push("status");
  if (prevPriority !== (task.priority ?? "")) changes.push("priority");
  if (prevDue !== (task.dueDate ?? "")) changes.push("due date");
  if (prevAssignee !== (task.assignee ?? "")) changes.push("assignee");

  return changes;
}

function dueSoonKey(task: LinearTask): string | null {
  if (!task.dueDate) return null;
  if (isOverdueInMaldives(task.dueDate) || isTodayInMaldives(task.dueDate)) {
    return `${task.id}:${task.dueDate}`;
  }
  if (isTomorrowInMaldives(task.dueDate)) {
    return `${task.id}:${task.dueDate}`;
  }
  return null;
}

function isDueSoon(task: LinearTask): boolean {
  return dueSoonKey(task) !== null;
}

export function detectTaskChanges(
  cache: TaskCacheState,
  tasks: LinearTask[],
): DetectTaskChangesResult {
  if (!cache.baselineEstablished) {
    return {
      changes: [],
      nextCache: establishBaseline(cache, tasks),
    };
  }

  const changes: TaskChange[] = [];
  let nextCache = { ...cache, snapshots: { ...cache.snapshots } };

  for (const task of tasks) {
    const existing = cache.snapshots[task.id];
    const snapshot = snapshotFromTask(task);

    if (!existing) {
      changes.push({ kind: "new", task, changes: ["new task"] });
      nextCache.snapshots[task.id] = snapshot;
      continue;
    }

    const fieldChanges = describeFieldChanges(existing, task);
    const updatedAtChanged = existing.updatedAt !== task.updatedAt;

    if (fieldChanges.length > 0) {
      const spokenChanges = fieldChanges.map((field) =>
        field === "description" ? "description updated" : `${field} updated`,
      );
      changes.push({
        kind: "updated",
        task,
        changes: spokenChanges,
      });
      nextCache.snapshots[task.id] = {
        ...snapshot,
        announcedUpdatedAt: task.updatedAt,
      };
      continue;
    }

    if (updatedAtChanged) {
      nextCache.snapshots[task.id] = {
        ...snapshot,
        announcedUpdatedAt: task.updatedAt,
      };
      continue;
    }

    const soonKey = dueSoonKey(task);
    if (
      soonKey &&
      isDueSoon(task) &&
      existing.announcedDueSoonKey !== soonKey
    ) {
      changes.push({ kind: "dueSoon", task, changes: ["due soon"] });
      nextCache.snapshots[task.id] = {
        ...snapshot,
        announcedDueSoonKey: soonKey,
      };
    } else {
      nextCache.snapshots[task.id] = {
        ...existing,
        ...snapshot,
        announcedUpdatedAt: existing.announcedUpdatedAt,
        announcedDueSoonKey: existing.announcedDueSoonKey,
      };
    }
  }

  return { changes, nextCache };
}

export function persistTaskCache(state: TaskCacheState): void {
  saveTaskCache(state);
}

export function getInitialTaskCache(): TaskCacheState {
  return loadTaskCache();
}

export function markBaselineFromTasks(
  cache: TaskCacheState,
  tasks: LinearTask[],
): TaskCacheState {
  const next = establishBaseline(cache, tasks);
  saveTaskCache(next);
  return next;
}
