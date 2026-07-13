import type { GitHubMonitorState } from "../types";

const STORAGE_KEY = "suda-github-monitor-state";

export const EMPTY_GITHUB_MONITOR_STATE = {
  processedEventIds: [] as string[],
  branchHeads: {} as Record<string, string>,
  lastSuccessfulPollAt: null as string | null,
  baselineEstablished: false,
};

export function loadGitHubMonitorState() {
  if (typeof localStorage === "undefined") {
    return { ...EMPTY_GITHUB_MONITOR_STATE };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_GITHUB_MONITOR_STATE };
    const parsed = JSON.parse(raw) as Partial<typeof EMPTY_GITHUB_MONITOR_STATE>;
    return {
      processedEventIds: parsed.processedEventIds ?? [],
      branchHeads: parsed.branchHeads ?? {},
      lastSuccessfulPollAt: parsed.lastSuccessfulPollAt ?? null,
      baselineEstablished: parsed.baselineEstablished ?? false,
    };
  } catch {
    return { ...EMPTY_GITHUB_MONITOR_STATE };
  }
}

export function saveGitHubMonitorState(state: GitHubMonitorState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...state,
      baselineEstablished: state.baselineEstablished ?? false,
    }),
  );
}

export function appendActivityHistory(messages: string[]): void {
  if (typeof localStorage === "undefined" || messages.length === 0) return;
  const key = "suda-activity-history";
  try {
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    localStorage.setItem(
      key,
      JSON.stringify([...existing, ...messages].slice(-100)),
    );
  } catch {
    localStorage.setItem(key, JSON.stringify(messages));
  }
}
