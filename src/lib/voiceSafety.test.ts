import { describe, expect, it } from "vitest";
import { formatTaskChangesVoiceText } from "../services/briefing";
import type { TaskChange } from "./taskChanges";

describe("voice safety", () => {
  it("keeps voice text short and never includes descriptions", () => {
    const changes: TaskChange[] = [
      {
        kind: "updated",
        task: {
          id: "ENG-1",
          linearId: "uuid-1",
          title: "Fix auth",
          description: "Very long description that must never be spoken aloud",
          status: "In Progress",
          dueDate: "2026-07-10",
          updatedAt: "2026-07-08T11:00:00Z",
        },
        changes: ["description updated"],
      },
    ];

    const voice = formatTaskChangesVoiceText(changes);
    expect(voice.length).toBeLessThanOrEqual(700);
    expect(voice).toContain("description updated");
    expect(voice).not.toContain("never be spoken");
  });

  it("summarizes overflow updates", () => {
    const changes: TaskChange[] = Array.from({ length: 8 }, (_, index) => ({
      kind: "new" as const,
      task: {
        id: `ENG-${index + 1}`,
        linearId: `uuid-${index + 1}`,
        title: `Task ${index + 1}`,
        status: "Todo",
        updatedAt: "2026-07-08T10:00:00Z",
      },
      changes: ["new task"],
    }));

    const voice = formatTaskChangesVoiceText(changes);
    expect(voice).toContain("Plus 3 more updates");
    expect(voice.length).toBeLessThanOrEqual(700);
  });
});
