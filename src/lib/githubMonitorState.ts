import type { GitHubMonitorState } from "../types";
import { GITHUB_MONITOR_STATE_VERSION } from "../types";

const STORAGE_KEY = "suda-github-monitor-state";
const MAX_PROCESSED_IDS = 500;

export const EMPTY_GITHUB_MONITOR_STATE: GitHubMonitorState = {
  version: GITHUB_MONITOR_STATE_VERSION,
  processedEventIds: [],
  branchHeads: {},
  prSnapshots: {},
  lastSuccessfulPollAt: null,
  baselineEstablished: false,
};

function capProcessedIds(ids: string[]): string[] {
  if (ids.length <= MAX_PROCESSED_IDS) return ids;
  return ids.slice(ids.length - MAX_PROCESSED_IDS);
}

function migrateGitHubState(
  parsed: Partial<GitHubMonitorState>,
): GitHubMonitorState {
  return {
    version: parsed.version ?? GITHUB_MONITOR_STATE_VERSION,
    processedEventIds: capProcessedIds(parsed.processedEventIds ?? []),
    branchHeads: parsed.branchHeads ?? {},
    prSnapshots: parsed.prSnapshots ?? {},
    lastSuccessfulPollAt: parsed.lastSuccessfulPollAt ?? null,
    baselineEstablished: parsed.baselineEstablished ?? false,
  };
}

export function loadGitHubMonitorState(): GitHubMonitorState {
  if (typeof localStorage === "undefined") {
    return { ...EMPTY_GITHUB_MONITOR_STATE };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_GITHUB_MONITOR_STATE };
    const parsed = JSON.parse(raw) as Partial<GitHubMonitorState>;
    return migrateGitHubState(parsed);
  } catch {
    return { ...EMPTY_GITHUB_MONITOR_STATE };
  }
}

export function saveGitHubMonitorState(state: GitHubMonitorState): void {
  if (typeof localStorage === "undefined") return;
  const normalized: GitHubMonitorState = {
    ...state,
    version: GITHUB_MONITOR_STATE_VERSION,
    processedEventIds: capProcessedIds(state.processedEventIds),
    baselineEstablished: state.baselineEstablished ?? false,
    prSnapshots: state.prSnapshots ?? {},
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}

export function statesEqual(
  a: GitHubMonitorState,
  b: GitHubMonitorState,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pruneBranchHeadsForRepos(
  state: GitHubMonitorState,
  configuredRepos: string[],
): GitHubMonitorState {
  const repoSet = new Set(configuredRepos);
  const branchHeads: Record<string, string> = {};
  for (const [key, sha] of Object.entries(state.branchHeads)) {
    const repo = key.split(":")[0];
    if (repoSet.has(repo)) {
      branchHeads[key] = sha;
    }
  }

  const prSnapshots: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.prSnapshots ?? {})) {
    const repo = key.split(":")[0];
    if (repoSet.has(repo)) {
      prSnapshots[key] = value;
    }
  }

  return { ...state, branchHeads, prSnapshots };
}

export function appendActivityHistory(messages: string[]): void {
  if (typeof localStorage === "undefined" || messages.length === 0) return;
  const key = "suda-activity-history";
  const MAX_HISTORY = 100;
  try {
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    localStorage.setItem(
      key,
      JSON.stringify([...existing, ...messages].slice(-MAX_HISTORY)),
    );
  } catch {
    localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_HISTORY)));
  }
}
