import {
  detectTaskChanges,
  getInitialTaskCache,
  persistTaskCache,
  type TaskChange,
} from "../lib/taskChanges";
import type { TaskCacheState } from "../lib/taskCache";
import {
  buildCombinedBriefing,
  createBriefingEvents,
  type BriefingEvent,
} from "../lib/briefingCoordinator";
import {
  appendActivityHistory,
  loadGitHubMonitorState,
  saveGitHubMonitorState,
} from "../lib/githubMonitorState";
import { logOnce, logOnStateChange, resetIntegrationLog } from "../lib/integrationLog";
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
  timerId: ReturnType<typeof setTimeout> | null;
  pollInFlight: boolean;
  authFailed: boolean;
  disabled: boolean;
  intervalMs: number;
  message?: string;
}

function defaultRuntime(intervalMs: number): IntegrationRuntime {
  return {
    status: "disabled",
    lastSuccessfulPollAt: null,
    failureCount: 0,
    timerId: null,
    pollInFlight: false,
    authFailed: false,
    disabled: false,
    intervalMs,
  };
}

class IntegrationMonitorService {
  private started = false;
  private onTransmission: TransmissionHandler | null = null;
  private onStatusChange: StatusHandler | null = null;
  private linear = defaultRuntime(60_000);
  private github = defaultRuntime(60_000);
  private taskCache: TaskCacheState = getInitialTaskCache();
  private githubState: GitHubMonitorState = loadGitHubMonitorState();
  private announcedWarnings = new Set<string>();

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
    this.clearTimer("linear");
    this.clearTimer("github");
    this.started = false;
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

  async retryLinear(): Promise<void> {
    await this.manualRetry("linear");
  }

  async checkGitHubNow(): Promise<void> {
    await this.manualRetry("github");
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

    const linearKeyConfigured = await this.probeLinearConfigured();
    if (linearKeyConfigured) {
      this.linear.disabled = false;
      this.linear.status = "connecting";
    } else {
      this.linear.status = "disabled";
      this.linear.disabled = true;
    }

    this.emitStatus();
    await this.runLinearPollCycle();
    await this.runGitHubPollCycle();
    this.scheduleNext("linear");
    this.scheduleNext("github");
  }

  private async probeLinearConfigured(): Promise<boolean> {
    try {
      const result = await fetchLinearPoll();
      return result.status !== "disabled";
    } catch {
      return false;
    }
  }

  private async manualRetry(integration: "linear" | "github"): Promise<void> {
    const runtime = integration === "linear" ? this.linear : this.github;
    runtime.authFailed = false;
    runtime.failureCount = 0;
    runtime.disabled = false;
    resetIntegrationLog(integration);
    this.clearTimer(integration);
    await reloadIntegrationEnv();

    if (integration === "github") {
      const status = await fetchGitHubStatus();
      runtime.intervalMs = status.pollIntervalSeconds * 1000;
      runtime.disabled = !status.configured;
    }

    if (integration === "github") {
      const status = await fetchGitHubStatus();
      runtime.intervalMs = status.pollIntervalSeconds * 1000;
      runtime.disabled = !status.configured;
      await this.runGitHubPollCycle();
    } else {
      await this.runLinearPollCycle();
    }

    if (runtime.status === "connected") {
      this.scheduleNext(integration);
    }
    this.emitStatus();
  }

  private scheduleNext(integration: "linear" | "github"): void {
    const runtime = integration === "linear" ? this.linear : this.github;
    this.clearTimer(integration);

    if (runtime.disabled || runtime.authFailed) return;

    const delay =
      runtime.failureCount === 0
        ? runtime.intervalMs
        : BACKOFF_MS[Math.min(runtime.failureCount - 1, BACKOFF_MS.length - 1)];

    runtime.timerId = setTimeout(() => {
      const poll =
        integration === "linear"
          ? () => this.runLinearPollCycle()
          : () => this.runGitHubPollCycle();
      void poll().then(() => this.scheduleNext(integration));
    }, delay);
  }

  private clearTimer(integration: "linear" | "github"): void {
    const runtime = integration === "linear" ? this.linear : this.github;
    if (runtime.timerId !== null) {
      clearTimeout(runtime.timerId);
      runtime.timerId = null;
    }
  }

  private async runLinearPollCycle(): Promise<void> {
    if (this.linear.disabled || this.linear.authFailed) return;

    const linearChanges = await this.pollLinear();
    const warnings: Array<{ message: string; key: string }> = [];

    if (this.linear.authFailed && !this.announcedWarnings.has("linear-auth-failed")) {
      this.announcedWarnings.add("linear-auth-failed");
      warnings.push({ message: LINEAR_AUTH_WARNING, key: "linear-auth-failed" });
      logOnce("linear-auth-warning", `[SUDA][Linear] ${LINEAR_AUTH_WARNING}`);
    }

    const events = createBriefingEvents({
      linearChanges,
      integrationWarnings: warnings,
    });

    this.presentEvents(events);
    this.emitStatus();
  }

  private async runGitHubPollCycle(): Promise<void> {
    if (this.github.disabled || this.github.authFailed) return;

    const githubActivities = await this.pollGitHub();
    const warnings: Array<{ message: string; key: string }> = [];

    if (this.github.authFailed && !this.announcedWarnings.has("github-auth-failed")) {
      this.announcedWarnings.add("github-auth-failed");
      warnings.push({ message: GITHUB_AUTH_WARNING, key: "github-auth-failed" });
      logOnce("github-auth-warning", `[SUDA][GitHub] ${GITHUB_AUTH_WARNING}`);
    }

    const events = createBriefingEvents({
      githubActivities,
      integrationWarnings: warnings,
    });

    this.presentEvents(events);
    this.emitStatus();
  }

  private presentEvents(events: BriefingEvent[]): void {
    if (events.length === 0 || !this.onTransmission) return;

    const briefing = buildCombinedBriefing(events);
    if (!briefing) return;

    if (briefing.overflowMessages.length > 0) {
      appendActivityHistory(briefing.overflowMessages);
    }

    this.onTransmission(createCombinedBriefingPayload(briefing));
  }

  private async pollLinear(): Promise<TaskChange[]> {
    if (this.linear.pollInFlight) return [];
    this.linear.pollInFlight = true;
    const previousStatus = this.linear.status;

    try {
      const result = await fetchLinearPoll();
      this.applyLinearResult(result.status, result.error?.message);

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
    this.linear.message = message;

    if (status === "connected") {
      this.linear.lastSuccessfulPollAt = new Date().toISOString();
      this.linear.failureCount = 0;
      this.linear.authFailed = false;
      return;
    }

    if (status === "authentication_failed") {
      this.linear.authFailed = true;
      this.clearTimer("linear");
      logOnce(
        "linear-auth-failed",
        `[SUDA][Linear] Authentication failed: ${message ?? "unknown"}. Polling paused.`,
      );
      return;
    }

    if (status === "disabled") {
      this.linear.disabled = true;
      this.clearTimer("linear");
      return;
    }

    if (status === "temporarily_unavailable") {
      this.linear.failureCount += 1;
    }
  }

  private async pollGitHub(): Promise<GitHubActivity[]> {
    if (this.github.pollInFlight) return [];
    this.github.pollInFlight = true;
    const previousStatus = this.github.status;

    try {
      const result = await fetchGitHubPoll(this.githubState);
      this.applyGitHubResult(result.status, result.error?.message);

      if (result.status === "connected" && result.data) {
        this.githubState = result.data.updatedState;
        saveGitHubMonitorState(this.githubState);
        this.github.lastSuccessfulPollAt =
          result.data.updatedState.lastSuccessfulPollAt;
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

  private applyGitHubResult(
    status: IntegrationStatus,
    message?: string,
  ): void {
    this.github.status = status;
    this.github.message = message;

    if (status === "connected") {
      this.github.failureCount = 0;
      this.github.authFailed = false;
      return;
    }

    if (status === "authentication_failed") {
      this.github.authFailed = true;
      this.clearTimer("github");
      logOnce(
        "github-auth-failed",
        `[SUDA][GitHub] Authentication failed: ${message ?? "unknown"}. Polling paused.`,
      );
      return;
    }

    if (status === "disabled") {
      this.github.disabled = true;
      this.clearTimer("github");
      return;
    }

    if (status === "temporarily_unavailable") {
      this.github.failureCount += 1;
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

  __resetForTests(): void {
    this.stop();
    this.started = false;
    this.linear = defaultRuntime(60_000);
    this.github = defaultRuntime(60_000);
    this.announcedWarnings.clear();
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
