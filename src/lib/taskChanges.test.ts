import { describe, expect, it } from "vitest";
import {
  buildTaskFingerprint,
  establishBaseline,
  EMPTY_TASK_CACHE,
} from "./taskCache";
import { detectTaskChanges } from "./taskChanges";
import type { LinearTask } from "../types";

function task(overrides: Partial<LinearTask> = {}): LinearTask {
  return {
    id: "ENG-1",
    linearId: "uuid-1",
    title: "Fix auth",
    status: "In Progress",
    priority: "High",
    dueDate: "2099-01-01",
    updatedAt: "2026-07-08T10:00:00Z",
    ...overrides,
  };
}

describe("taskChanges", () => {
  it("establishes baseline without announcing existing tasks", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [task()]);
    const { changes } = detectTaskChanges(baseline, [task()]);
    expect(changes).toHaveLength(0);
    expect(baseline.baselineEstablished).toBe(true);
  });

  it("detects new tasks after baseline", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [task()]);
    const incoming = task({ id: "ENG-2", linearId: "uuid-2", title: "New task" });
    const { changes } = detectTaskChanges(baseline, [task(), incoming]);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("new");
  });

  it("detects meaningful field updates", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [task()]);
    const updated = task({ status: "Done", updatedAt: "2026-07-08T11:00:00Z" });
    const { changes } = detectTaskChanges(baseline, [updated]);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("updated");
    expect(changes[0].changes).toContain("status updated");
  });

  it("reports description updates without exposing body in change labels", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [
      task({ description: "Old body" }),
    ]);
    const updated = task({
      description: "New secret body that should never be spoken",
      updatedAt: "2026-07-08T11:00:00Z",
    });
    const { changes } = detectTaskChanges(baseline, [updated]);
    expect(changes[0].changes).toContain("description updated");
    expect(changes[0].changes.join(" ")).not.toContain("secret body");
  });

  it("does not repeat unchanged tasks on subsequent polls", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [task()]);
    const first = detectTaskChanges(baseline, [task()]);
    const second = detectTaskChanges(first.nextCache, [task()]);
    expect(second.changes).toHaveLength(0);
  });

  it("ignores updatedAt-only changes without fingerprint updates", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [task()]);
    const bumped = task({ updatedAt: "2026-07-08T11:00:00Z" });
    const { changes } = detectTaskChanges(baseline, [bumped]);
    expect(changes).toHaveLength(0);
  });

  it("prunes deleted tasks from cache", () => {
    const baseline = establishBaseline(EMPTY_TASK_CACHE, [task(), task({ id: "ENG-2", linearId: "uuid-2" })]);
    const { nextCache } = detectTaskChanges(baseline, [task()]);
    expect(Object.keys(nextCache.snapshots)).toEqual(["ENG-1"]);
  });

  it("builds stable fingerprints", () => {
    const fp1 = buildTaskFingerprint(task({ description: "abc" }));
    const fp2 = buildTaskFingerprint(task({ description: "abc" }));
    const fp3 = buildTaskFingerprint(task({ description: "xyz" }));
    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });
});
