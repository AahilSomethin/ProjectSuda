import { describe, expect, it } from "vitest";
import type { GitHubActivity } from "../types";
import type { TaskChange } from "./taskChanges";
import {
  buildCombinedBriefing,
  createBriefingEvents,
  MAX_BRIEFING_EVENTS,
} from "./briefingCoordinator";

function taskChange(id: string, status = "In Progress"): TaskChange {
  return {
    kind: "updated",
    task: {
      id,
      linearId: id,
      title: "Task",
      status,
      updatedAt: "2026-07-13T10:00:00Z",
    },
    changes: ["status updated"],
  };
}

describe("briefingCoordinator", () => {
  it("orders merged PR before push", () => {
    const merge: GitHubActivity = {
      id: "m1",
      type: "pull_request_merged",
      repository: "MINDCrew",
      pullRequestNumber: 42,
      title: "Feature",
      actor: "Aahil",
      baseBranch: "main",
      headBranch: "feature",
      occurredAt: "2026-07-13T10:00:00Z",
    };
    const push: GitHubActivity = {
      id: "p1",
      type: "push",
      repository: "MINDCrew",
      branch: "main",
      actor: "Aahil",
      commitCount: 3,
      commitMessages: [],
      forced: false,
      occurredAt: "2026-07-13T10:00:00Z",
    };

    const events = createBriefingEvents({
      githubActivities: [push, merge],
    });
    const briefing = buildCombinedBriefing(events);
    expect(briefing?.message).toContain("SUDA update:");
    expect(briefing?.message).toContain("Pull request #42 was merged into main.");
    expect(briefing?.message.indexOf("Pull request")).toBeLessThan(
      briefing?.message.indexOf("pushed") ?? 0,
    );
  });

  it("caps briefing at five events", () => {
    const githubActivities: GitHubActivity[] = Array.from({ length: 7 }, (_, i) => ({
      id: `id-${i}`,
      type: "branch_created" as const,
      repository: "suda",
      branch: `branch-${i}`,
      actor: "Aahil",
      occurredAt: "2026-07-13T10:00:00Z",
    }));

    const events = createBriefingEvents({ githubActivities });
    const briefing = buildCombinedBriefing(events);
    const bullets = briefing?.message.split("\n").filter((line) => line.startsWith("•")) ?? [];
    expect(bullets.length).toBe(MAX_BRIEFING_EVENTS);
    expect(briefing?.overflowMessages.length).toBe(2);
  });

  it("combines github and linear into one SUDA update", () => {
    const events = createBriefingEvents({
      githubActivities: [
        {
          id: "p1",
          type: "push",
          repository: "MINDCrew",
          branch: "main",
          actor: "Aahil",
          commitCount: 2,
          commitMessages: [],
          forced: false,
          occurredAt: "2026-07-13T10:00:00Z",
        },
        {
          id: "pr1",
          type: "pull_request_updated",
          repository: "MINDCrew",
          pullRequestNumber: 42,
          title: "Feature",
          actor: "Aahil",
          action: "opened",
          occurredAt: "2026-07-13T10:00:00Z",
        },
      ],
      linearChanges: [taskChange("MIND-42", "Done")],
    });

    const briefing = buildCombinedBriefing(events);
    expect(briefing?.message).toContain("SUDA update:");
    expect(briefing?.message).toContain("2 commits were pushed to MINDCrew.");
    expect(briefing?.message).toContain("Pull request #42 was opened.");
    expect(briefing?.message).toContain("MIND-42 moved to Done");
  });
});
