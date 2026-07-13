import {
  detectTaskChanges,
  getInitialTaskCache,
  markBaselineFromTasks,
  persistTaskCache,
  type TaskChange,
} from "../lib/taskChanges";
import type { TaskCacheState } from "../lib/taskCache";
import { loadTaskCache } from "../lib/taskCache";
import {
  buildCombinedBriefing,
  createBriefingEvents,
  type BriefingEvent,
} from "../lib/briefingCoordinator";
import {
  appendActivityHistory,
  loadGitHubMonitorState,
  saveGitHubMonitorState,
  statesEqual,
} from "../lib/githubMonitorState";
import { logOnce, logOnStateChange, resetIntegrationLog } from "../lib/integrationLog";
import {
  buildTransmissionDedupKey,
  isDuplicateTransmission,
  rememberTransmission,
  shouldOpenTransmission,
} from "../lib/notificationGuards";
import { createCombinedBriefingPayload } from "../lib/transmissions";
import {
  fetchGitHubPoll,
  fetchGitHubStatus,
  reloadIntegrationEnv,
} from "./github";
import {
  fetchLinearPoll,
  setCachedBriefing,
  briefingToLinearTasks,
} from "./briefing";
import type {
  GitHubActivity,
  GitHubMonitorState,
  IntegrationStatus,
  IntegrationViewStatus,
  LinearTask,
  TransmissionPayload,
} from "../types";

const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const;

const LINEAR_AUTH_WARNING =
  "Linear authentication is unavailable. Linear monitoring has been paused, but GitHub monitoring remains active.";

const GITHUB_AUTH_WARNING =
  "GitHub authentication is unavailable. GitHub monitoring has been paused, but Linear monitoring remains active.";

type TransmissionHandler = (payload: TransmissionPayload) => void;
type StatusHandler = (statuses: IntegrationViewStatus[]) => void;

interface IntegrationRuntime {
  status: IntegrationStatus;
  lastSuccessfulPollAt: string | null;
  failureCount: number;
  pollInFlight: boolean;
  authFailed: boolean;
  disabled: boolean;
  intervalMs: number;
  message?: string;
  rateLimitResetAt: number | null;
}

function defaultRuntime(intervalMs: number): IntegrationRuntime {
  return {
    status: "disabled",
    lastSuccessfulPollAt: null,
    failureCount: 0,
    pollInFlight: false,
    authFailed: false,
    disabled: false,
    intervalMs,
    rateLimitResetAt: null,
  };
}

class IntegrationMonitorService {
  private started = false;
  private cycleInFlight = false;
  private onTransmission: TransmissionHandler | null = null;
  private onStatusChange: StatusHandler | null = null;
  private linear = defaultRuntime(60_000);
  private github = defaultRuntime(60_000);
  private unifiedTimerId: ReturnType<typeof setTimeout> | null = null;
  private taskCache: TaskCacheState = getInitialTaskCache();
  private githubState: GitHubMonitorState = loadGitHubMonitorState();
  private announcedWarnings = new Set<string>();
  private presentedTransmissionIds = new Set<string>();

  start(
    onTransmission: TransmissionHandler,
    onStatusChange?: StatusHandler,
  ): void {
    if (this.started) return;
    this.started = true;
    this.onTransmission = onTransmission;
    this.onStatusChange = onStatusChange ?? null;

    void this.initialize();
  }

  stop(): void {
    this.clearUnifiedTimer();
    this.started = false;
    this.cycleInFlight = false;
    this.onTransmission = null;
    this.onStatusChange = null;
  }

  getIntegrationStatuses(): IntegrationViewStatus[] {
    return [
      {
        name: "linear",
        status: this.linear.status,
        lastSuccessfulPollAt: this.linear.lastSuccessfulPollAt,
        message: this.linear.message,
      },
      {
        name: "github",
        status: this.github.status,
        lastSuccessfulPollAt: this.github.lastSuccessfulPollAt,
        message: this.github.message,
      },
    ];
  }

  syncTaskCache(state: TaskCacheState): void {
    this.taskCache = state;
    persistTaskCache(state);
  }

  establishBaselineFromTasks(tasks: LinearTask[]): void {
    this.taskCache = markBaselineFromTasks(this.taskCache, tasks);
  }

  async retryLinear(): Promise<void> {
    await this.manualRetry("linear");
  }

  async checkGitHubNow(): Promise<void> {
    await this.manualRetry("github");
  }

  async refreshIntegrations(): Promise<void> {
    await this.manualRetry("unified");
  }

  private reloadPersistedState(): void {
    this.taskCache = loadTaskCache();
    this.githubState = loadGitHubMonitorState();
  }

  private async initialize(): Promise<void> {
    const githubStatus = await fetchGitHubStatus();
    if (githubStatus.configured) {
      this.github.intervalMs = githubStatus.pollIntervalSeconds * 1000;
      this.github.disabled = false;
      this.github.status = "connecting";
    } else {
      this.github.status = "disabled";
      this.github.disabled = true;
    }

    this.linear.disabled = false;
    this.linear.status = "connecting";

    this.emitStatus();
    await this.runUnifiedPollCycle();
    this.scheduleNext();
  }

  private async manualRetry(
    integration: "linear" | "github" | "unified",
  ): Promise<void> {
    if (this.cycleInFlight) return;

    this.reloadPersistedState();

    if (integration === "linear" || integration === "unified") {
      this.linear.authFailed = false;
      this.linear.failureCount = 0;
      this.linear.disabled = false;
      this.linear.rateLimitResetAt = null;
      resetIntegrationLog("Linear");
    }

    if (integration === "github" || integration === "unified") {
      this.github.authFailed = false;
      this.github.failureCount = 0;
      this.github.disabled = false;
      this.github.rateLimitResetAt = null;
      resetIntegrationLog("GitHub");
    }

    this.clearUnifiedTimer();
    await reloadIntegrationEnv();

    const githubStatus = await fetchGitHubStatus();
    this.github.intervalMs = githubStatus.pollIntervalSeconds * 1000;
    this.github.disabled = !githubStatus.configured;
    if (!githubStatus.configured) {
      this.github.status = "disabled";
    }

    await this.runUnifiedPollCycle();
    this.scheduleNext();
    this.emitStatus();
  }

  private getUnifiedIntervalMs(): number {
    const intervals: number[] = [];
    if (!this.linear.disabled && !this.linear.authFailed) {
      intervals.push(this.linear.intervalMs);
    }
    if (!this.github.disabled && !this.github.authFailed) {
      intervals.push(this.github.intervalMs);
    }
    return intervals.length > 0 ? Math.max(...intervals) : 60_000;
  }

  private getRateLimitDelayMs(): number {
    const now = Date.now();
    const delays: number[] = [];
    if (this.github.rateLimitResetAt && this.github.rateLimitResetAt > now) {
      delays.push(this.github.rateLimitResetAt - now);
    }
    return delays.length > 0 ? Math.max(...delays) : 0;
  }

  private getUnifiedBackoffMs(): number {
    const baseInterval = this.getUnifiedIntervalMs();
    const failureCounts: number[] = [];
    if (!this.linear.disabled && !this.linear.authFailed) {
      failureCounts.push(this.linear.failureCount);
    }
    if (!this.github.disabled && !this.github.authFailed) {
      failureCounts.push(this.github.failureCount);
    }
    const maxFailures =
      failureCounts.length > 0 ? Math.max(...failureCounts) : 0;
    const backoff = getBackoffDelayMs(maxFailures, baseInterval);
    const rateLimitDelay = this.getRateLimitDelayMs();
    return Math.max(backoff, rateLimitDelay);
  }

  private scheduleNext(): void {
    this.clearUnifiedTimer();

    const linearActive = !this.linear.disabled && !this.linear.authFailed;
    const githubActive = !this.github.disabled && !this.github.authFailed;
    if (!linearActive && !githubActive) return;

    const delay = this.getUnifiedBackoffMs();

    this.unifiedTimerId = setTimeout(() => {
      void this.runUnifiedPollCycle().then(() => this.scheduleNext());
    }, delay);
  }

  private clearUnifiedTimer(): void {
    if (this.unifiedTimerId !== null) {
      clearTimeout(this.unifiedTimerId);
      this.unifiedTimerId = null;
    }
  }

  private async runUnifiedPollCycle(): Promise<void> {
    if (this.cycleInFlight) return;
    this.cycleInFlight = true;

    try {
      const linearChanges = this.linear.disabled || this.linear.authFailed
        ? []
        : await this.pollLinear();
      const githubActivities = this.github.disabled || this.github.authFailed
        ? []
        : await this.pollGitHub();

      this.logAuthWarnings();

      const events = createBriefingEvents({
        linearChanges,
        githubActivities,
      });

      this.presentEvents(events);
      this.emitStatus();
    } finally {
      this.cycleInFlight = false;
    }
  }

  private logAuthWarnings(): void {
    if (this.linear.authFailed && !this.announcedWarnings.has("linear-auth-failed")) {
      this.announcedWarnings.add("linear-auth-failed");
      this.linear.message = LINEAR_AUTH_WARNING;
      logOnce("linear-auth-warning", `[SUDA][Linear] ${LINEAR_AUTH_WARNING}`);
    }

    if (this.github.authFailed && !this.announcedWarnings.has("github-auth-failed")) {
      this.announcedWarnings.add("github-auth-failed");
      this.github.message = GITHUB_AUTH_WARNING;
      logOnce("github-auth-warning", `[SUDA][GitHub] ${GITHUB_AUTH_WARNING}`);
    }
  }

  private presentEvents(events: BriefingEvent[]): void {
    if (!shouldOpenTransmission(events) || !this.onTransmission) return;

    const briefing = buildCombinedBriefing(events);
    if (!briefing) return;

    const dedupKey =
      briefing.voiceMessage.trim().length > 0
        ? buildTransmissionDedupKey(events, briefing.voiceMessage)
        : buildTransmissionDedupKey(events, briefing.message);

    if (isDuplicateTransmission(dedupKey, this.presentedTransmissionIds)) {
      return;
    }

    if (briefing.overflowMessages.length > 0) {
      appendActivityHistory(briefing.overflowMessages);
    }

    const payload = createCombinedBriefingPayload(briefing, events, {
      voiceEnabled: true,
    });

    rememberTransmission(dedupKey, this.presentedTransmissionIds);
    this.onTransmission(payload);
  }

  private async pollLinear(): Promise<TaskChange[]> {
    if (this.linear.pollInFlight) return [];
    this.linear.pollInFlight = true;
    const previousStatus = this.linear.status;

    try {
      const result = await fetchLinearPoll();
      this.applyLinearResult(result.status, result.error?.message);

      if (result.status === "disabled") {
        this.linear.disabled = true;
        return [];
      }

      if (result.status === "connected" && result.data) {
        setCachedBriefing(result.data);
        const tasks = briefingToLinearTasks(result.data);
        const { changes, nextCache } = detectTaskChanges(this.taskCache, tasks);
        this.taskCache = nextCache;
        persistTaskCache(nextCache);
        return changes;
      }
      return [];
    } catch {
      this.applyLinearResult("temporarily_unavailable", "Linear poll failed");
      return [];
    } finally {
      this.linear.pollInFlight = false;
      logOnStateChange(
        "Linear",
        previousStatus,
        this.linear.status,
        `Status: ${this.linear.status}`,
      );
    }
  }

  private applyLinearResult(
    status: IntegrationStatus,
    message?: string,
  ): void {
    this.linear.status = status;
    if (message) {
      this.linear.message = message;
    }

    if (status === "connected") {
      this.linear.lastSuccessfulPollAt = new Date().toISOString();
      this.linear.failureCount = 0;
      this.linear.authFailed = false;
      this.linear.disabled = false;
      this.linear.rateLimitResetAt = null;
      return;
    }

    if (status === "authentication_failed") {
      this.linear.authFailed = true;
      logOnce(
        "linear-auth-failed",
        `[SUDA][Linear] Authentication failed: ${message ?? "unknown"}. Polling paused.`,
      );
      return;
    }

    if (status === "disabled") {
      this.linear.disabled = true;
      return;
    }

    if (status === "temporarily_unavailable") {
      this.linear.failureCount += 1;
    }
  }

  private applyGitHubResult(
    status: IntegrationStatus,
    message?: string,
    rateLimitResetAt?: number | null,
  ): void {
    this.github.status = status;
    if (message) {
      this.github.message = message;
    }

    if (status === "connected") {
      this.github.failureCount = 0;
      this.github.authFailed = false;
      this.github.rateLimitResetAt = null;
      return;
    }

    if (status === "authentication_failed") {
      this.github.authFailed = true;
      logOnce(
        "github-auth-failed",
        `[SUDA][GitHub] Authentication failed: ${message ?? "unknown"}. Polling paused.`,
      );
      return;
    }

    if (status === "disabled") {
      this.github.disabled = true;
      return;
    }

    if (status === "temporarily_unavailable") {
      this.github.failureCount += 1;
      if (rateLimitResetAt) {
        this.github.rateLimitResetAt = rateLimitResetAt;
      }
    }
  }

  private async pollGitHub(): Promise<GitHubActivity[]> {
    if (this.github.pollInFlight) return [];
    this.github.pollInFlight = true;
    const previousStatus = this.github.status;

    try {
      const result = await fetchGitHubPoll(this.githubState);
      const rateLimitResetAt = result.error?.rateLimitResetAt
        ? result.error.rateLimitResetAt
        : null;
      this.applyGitHubResult(
        result.status,
        result.error?.message,
        rateLimitResetAt,
      );

      if (result.status === "connected" && result.data) {
        const nextState = result.data.updatedState;
        if (!statesEqual(this.githubState, nextState)) {
          this.githubState = nextState;
          saveGitHubMonitorState(this.githubState);
        } else {
          this.githubState = nextState;
        }
        this.github.lastSuccessfulPollAt =
          result.data.updatedState.lastSuccessfulPollAt ?? null;
        return result.data.activities;
      }
      return [];
    } catch {
      this.applyGitHubResult("temporarily_unavailable", "GitHub poll failed");
      return [];
    } finally {
      this.github.pollInFlight = false;
      logOnStateChange(
        "GitHub",
        previousStatus,
        this.github.status,
        `Status: ${this.github.status}`,
      );
    }
  }

  private emitStatus(): void {
    this.onStatusChange?.(this.getIntegrationStatuses());
  }

  __getLinearRuntime() {
    return this.linear;
  }

  __getGitHubRuntime() {
    return this.github;
  }

  __getUnifiedTimerId() {
    return this.unifiedTimerId;
  }

  __getPresentedTransmissionIds() {
    return this.presentedTransmissionIds;
  }

  __resetForTests(): void {
    this.stop();
    this.started = false;
    this.linear = defaultRuntime(60_000);
    this.github = defaultRuntime(60_000);
    this.announcedWarnings.clear();
    this.presentedTransmissionIds.clear();
    this.taskCache = getInitialTaskCache();
    this.githubState = loadGitHubMonitorState();
  }
}

export const integrationMonitor = new IntegrationMonitorService();

export function getBackoffDelayMs(failureCount: number, intervalMs: number): number {
  if (failureCount === 0) return intervalMs;
  return BACKOFF_MS[Math.min(failureCount - 1, BACKOFF_MS.length - 1)];
}

export function __isMonitorStarted(): boolean {
  return (integrationMonitor as unknown as { started: boolean }).started;
}
