import type { GitHubActivity } from "../types";

export function formatGitHubActivityMessage(activity: GitHubActivity): string {
  switch (activity.type) {
    case "push": {
      if (activity.forced) {
        return `The ${activity.branch} branch was force-pushed, likely following a rebase or history rewrite.`;
      }
      const commitWord =
        activity.commitCount === 1
          ? "1 commit"
          : `${activity.commitCount} commits`;
      return `${activity.actor} pushed ${commitWord} to ${activity.repository} on ${activity.branch}.`;
    }
    case "pull_request_merged":
      return `Pull request #${activity.pullRequestNumber} was merged into ${activity.baseBranch}.`;
    case "branch_created":
      return `A new branch named ${activity.branch} was pushed.`;
    case "pull_request_updated":
      return `Pull request #${activity.pullRequestNumber} was ${activity.action}: ${activity.title}.`;
  }
}

export function githubActivityPriority(activity: GitHubActivity): number {
  switch (activity.type) {
    case "pull_request_merged":
      return 1;
    case "push":
      return activity.forced ? 2 : 3;
    case "branch_created":
      return 4;
    case "pull_request_updated":
      return 5;
  }
}

export function sortGitHubActivities(
  activities: GitHubActivity[],
): GitHubActivity[] {
  return [...activities].sort(
    (a, b) => githubActivityPriority(a) - githubActivityPriority(b),
  );
}
