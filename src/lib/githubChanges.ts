import type { GitHubActivity } from "../types";

export function formatGitHubActivityMessage(activity: GitHubActivity): string {
  switch (activity.type) {
    case "push": {
      if (activity.forced) {
        return `The ${activity.branch} branch on ${activity.repository} was force-pushed, likely following a rebase or history rewrite.`;
      }
      const commitWord =
        activity.commitCount === 1
          ? "One commit was"
          : `${activity.commitCount} commits were`;
      return `${commitWord} pushed to ${activity.repository}.`;
    }
    case "pull_request_merged":
      return `Pull request #${activity.pullRequestNumber} was merged into ${activity.baseBranch}.`;
    case "branch_created":
      return `A new branch named ${activity.branch} was pushed to ${activity.repository}.`;
    case "pull_request_updated":
      if (activity.action === "opened" || activity.action === "reopened") {
        return `Pull request #${activity.pullRequestNumber} was opened.`;
      }
      if (activity.action === "synchronize") {
        return `Pull request #${activity.pullRequestNumber} was updated.`;
      }
      return `Pull request #${activity.pullRequestNumber} was ${activity.action}.`;
  }
}

export function githubActivityPriority(activity: GitHubActivity): number {
  switch (activity.type) {
    case "pull_request_merged":
      return 1;
    case "push":
      return activity.forced ? 2 : 3;
    case "branch_created":
      return 5;
    case "pull_request_updated":
      return 6;
  }
}

export function sortGitHubActivities(
  activities: GitHubActivity[],
): GitHubActivity[] {
  return [...activities].sort(
    (a, b) => githubActivityPriority(a) - githubActivityPriority(b),
  );
}
