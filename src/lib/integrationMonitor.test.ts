import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBackoffDelayMs,
  integrationMonitor,
  __isMonitorStarted,
} from "../services/integrationMonitor";

const mockFetchLinearPoll = vi.fn();
const mockFetchGitHubPoll = vi.fn();
const mockFetchGitHubStatus = vi.fn();
const mockReloadIntegrationEnv = vi.fn();

vi.mock("../lib/taskChanges", () => ({
  detectTaskChanges: vi.fn(() => ({
    changes: [],
    nextCache: { baselineEstablished: true, snapshots: {} },
  })),
  getInitialTaskCache: vi.fn(() => ({
    baselineEstablished: true,
    snapshots: {},
  })),
  persistTaskCache: vi.fn(),
  markBaselineFromTasks: vi.fn((cache) => cache),
}));

vi.mock("../services/briefing", () => ({
  fetchLinearPoll: (...args: unknown[]) => mockFetchLinearPoll(...args),
  setCachedBriefing: vi.fn(),
  briefingToLinearTasks: vi.fn(() => []),
}));

vi.mock("../services/github", () => ({
  fetchGitHubPoll: (...args: unknown[]) => mockFetchGitHubPoll(...args),
  fetchGitHubStatus: (...args: unknown[]) => mockFetchGitHubStatus(...args),
  reloadIntegrationEnv: (...args: unknown[]) => mockReloadIntegrationEnv(...args),
}));

describe("integrationMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    integrationMonitor.__resetForTests();
    mockFetchLinearPoll.mockResolvedValue({
      status: "connected",
      data: {
        source: "linear",
        generatedAt: "2026-07-13T10:00:00Z",
        taskCount: 0,
        summary: "clear",
        focusTasks: [],
        warnings: [],
        firstAction: "",
        stats: {
          urgentOrHigh: 0,
          dueToday: 0,
          dueThisWeek: 0,
          overdue: 0,
          noDueDate: 0,
        },
        rawTasks: [],
      },
    });
    mockFetchGitHubStatus.mockResolvedValue({
      configured: true,
      repositories: ["suda"],
      pollIntervalSeconds: 60,
      notifyPullRequests: false,
    });
    mockFetchGitHubPoll.mockResolvedValue({
      status: "connected",
      data: {
        activities: [],
        updatedState: {
          processedEventIds: [],
          branchHeads: {},
          lastSuccessfulPollAt: null,
          baselineEstablished: false,
        },
        pollIntervalSeconds: 60,
      },
    });
    mockReloadIntegrationEnv.mockResolvedValue(undefined);
  });

  afterEach(() => {
    integrationMonitor.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("stops linear polling after 401", async () => {
    mockFetchLinearPoll.mockResolvedValue({
      status: "authentication_failed",
      error: { httpStatus: 401, message: "401 Unauthorized" },
    });

    const transmissions: string[] = [];
    integrationMonitor.start((payload) => {
      transmissions.push(payload.message);
    });

    await vi.runOnlyPendingTimersAsync();

    const linear = integrationMonitor.__getLinearRuntime();
    expect(linear.authFailed).toBe(true);
    expect(linear.timerId).toBeNull();
  });

  it("shows only one linear authentication warning", async () => {
    mockFetchLinearPoll.mockResolvedValue({
      status: "authentication_failed",
      error: { httpStatus: 401, message: "401 Unauthorized" },
    });

    const transmissions: string[] = [];
    integrationMonitor.start((payload) => {
      transmissions.push(payload.message);
    });

    await vi.runOnlyPendingTimersAsync();
    await integrationMonitor.retryLinear();
    await vi.runOnlyPendingTimersAsync();

    const authWarnings = transmissions.filter((message) =>
      message.includes("Linear authentication is unavailable"),
    );
    expect(authWarnings.length).toBe(1);
  });

  it("continues github polling when linear is disabled by auth failure", async () => {
    mockFetchLinearPoll.mockResolvedValue({
      status: "authentication_failed",
      error: { httpStatus: 401, message: "401 Unauthorized" },
    });

    integrationMonitor.start(() => {});
    await vi.runOnlyPendingTimersAsync();

    mockFetchGitHubPoll.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetchGitHubPoll).toHaveBeenCalled();
  });

  it("uses backoff for temporary errors", () => {
    expect(getBackoffDelayMs(1, 60_000)).toBe(60_000);
    expect(getBackoffDelayMs(2, 60_000)).toBe(5 * 60_000);
    expect(getBackoffDelayMs(4, 60_000)).toBe(15 * 60_000);
    expect(getBackoffDelayMs(0, 60_000)).toBe(60_000);
  });

  it("does not create duplicate intervals on second start call", async () => {
    integrationMonitor.start(() => {});
    integrationMonitor.start(() => {});
    await vi.runOnlyPendingTimersAsync();
    expect(__isMonitorStarted()).toBe(true);
    const linear = integrationMonitor.__getLinearRuntime();
    expect(linear.timerId).not.toBeNull();
  });

  it("manual retry clears auth failure lock", async () => {
    mockFetchLinearPoll.mockResolvedValue({
      status: "authentication_failed",
      error: { httpStatus: 401, message: "401 Unauthorized" },
    });

    integrationMonitor.start(() => {});
    await vi.runOnlyPendingTimersAsync();
    expect(integrationMonitor.__getLinearRuntime().authFailed).toBe(true);

    mockFetchLinearPoll.mockResolvedValue({
      status: "connected",
      data: {
        source: "linear",
        generatedAt: "2026-07-13T10:00:00Z",
        taskCount: 0,
        summary: "clear",
        focusTasks: [],
        warnings: [],
        firstAction: "",
        stats: {
          urgentOrHigh: 0,
          dueToday: 0,
          dueThisWeek: 0,
          overdue: 0,
          noDueDate: 0,
        },
        rawTasks: [],
      },
    });

    await integrationMonitor.retryLinear();
    expect(integrationMonitor.__getLinearRuntime().authFailed).toBe(false);
    expect(integrationMonitor.__getLinearRuntime().status).toBe("connected");
  });
});
