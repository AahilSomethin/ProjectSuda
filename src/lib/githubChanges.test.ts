import { describe, expect, it } from "vitest";
import type { GitHubActivity } from "../types";
import {
  formatGitHubActivityMessage,
  sortGitHubActivities,
} from "./githubChanges";

describe("githubChanges", () => {
  it("force push is described as likely rebase, not confirmed", () => {
    const activity: GitHubActivity = {
      id: "suda:1",
      type: "push",
      repository: "MINDCrew",
      branch: "feature/messages",
      actor: "Aahil",
      commitCount: 1,
      commitMessages: [],
      forced: true,
      occurredAt: "2026-07-13T10:00:00Z",
    };
    const message = formatGitHubActivityMessage(activity);
    expect(message).toContain("likely following a rebase or history rewrite");
    expect(message).not.toContain("was rebased");
  });

  it("formats push activity without actor prefix", () => {
    const activity: GitHubActivity = {
      id: "1",
      type: "push",
      repository: "MINDCrew",
      branch: "main",
      actor: "Aahil",
      commitCount: 2,
      commitMessages: [],
      forced: false,
      occurredAt: "2026-07-13T10:00:00Z",
    };
    expect(formatGitHubActivityMessage(activity)).toBe(
      "2 commits were pushed to MINDCrew.",
    );
  });

  it("formats opened pull requests", () => {
    const activity: GitHubActivity = {
      id: "2",
      type: "pull_request_updated",
      repository: "MINDCrew",
      pullRequestNumber: 42,
      title: "Feature",
      actor: "Aahil",
      action: "opened",
      occurredAt: "2026-07-13T10:00:00Z",
    };
    expect(formatGitHubActivityMessage(activity)).toBe(
      "Pull request #42 was opened.",
    );
  });

  it("sorts merged PRs before pushes", () => {
    const push: GitHubActivity = {
      id: "1",
      type: "push",
      repository: "MINDCrew",
      branch: "main",
      actor: "Aahil",
      commitCount: 3,
      commitMessages: [],
      forced: false,
      occurredAt: "2026-07-13T10:00:00Z",
    };
    const merge: GitHubActivity = {
      id: "2",
      type: "pull_request_merged",
      repository: "MINDCrew",
      pullRequestNumber: 42,
      title: "Feature",
      actor: "Aahil",
      baseBranch: "main",
      headBranch: "feature",
      occurredAt: "2026-07-13T10:00:00Z",
    };
    const sorted = sortGitHubActivities([push, merge]);
    expect(sorted[0].type).toBe("pull_request_merged");
  });
});
