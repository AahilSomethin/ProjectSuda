import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBackoffDelayMs,
  integrationMonitor,
  __isMonitorStarted,
} from "../services/integrationMonitor";
import type { TaskChange } from "../lib/taskChanges";

const mockFetchLinearPoll = vi.fn();
const mockFetchGitHubPoll = vi.fn();
const mockFetchGitHubStatus = vi.fn();
const mockReloadIntegrationEnv = vi.fn();
const mockDetectTaskChanges = vi.fn();

vi.mock("../lib/taskChanges", () => ({
  detectTaskChanges: (...args: unknown[]) => mockDetectTaskChanges(...args),
  getInitialTaskCache: vi.fn(() => ({
    baselineEstablished: true,
    snapshots: {},
  })),
  persistTaskCache: vi.fn(),
  markBaselineFromTasks: vi.fn((cache) => cache),
}));

vi.mock("../services/briefing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/briefing")>();
  return {
    ...actual,
    fetchLinearPoll: (...args: unknown[]) => mockFetchLinearPoll(...args),
    setCachedBriefing: vi.fn(),
    briefingToLinearTasks: vi.fn(() => []),
  };
});

vi.mock("../services/github", () => ({
  fetchGitHubPoll: (...args: unknown[]) => mockFetchGitHubPoll(...args),
  fetchGitHubStatus: (...args: unknown[]) => mockFetchGitHubStatus(...args),
  reloadIntegrationEnv: (...args: unknown[]) => mockReloadIntegrationEnv(...args),
}));

const connectedLinear = {
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
};

describe("integrationMonitor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    integrationMonitor.__resetForTests();
    mockDetectTaskChanges.mockReturnValue({
      changes: [],
      nextCache: { baselineEstablished: true, snapshots: {} },
    });
    mockFetchLinearPoll.mockResolvedValue(connectedLinear);
    mockFetchGitHubStatus.mockResolvedValue({
      configured: true,
      repositories: ["suda"],
      pollIntervalSeconds: 60,
      notifyPullRequests: true,
    });
    mockFetchGitHubPoll.mockResolvedValue({
      status: "connected",
      data: {
        activities: [],
        updatedState: {
          processedEventIds: [],
          branchHeads: {},
          prSnapshots: {},
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

    integrationMonitor.start(() => {});
    await vi.runOnlyPendingTimersAsync();

    const linear = integrationMonitor.__getLinearRuntime();
    expect(linear.authFailed).toBe(true);
  });

  it("does not open transmissions for auth failures", async () => {
    mockFetchLinearPoll.mockResolvedValue({
      status: "authentication_failed",
      error: { httpStatus: 401, message: "401 Unauthorized" },
    });

    const transmissions: string[] = [];
    integrationMonitor.start((payload) => {
      transmissions.push(payload.message);
    });

    await vi.runOnlyPendingTimersAsync();
    expect(transmissions).toHaveLength(0);
  });

  it("does not open transmissions when polls return no activity", async () => {
    const transmissions: string[] = [];
    integrationMonitor.start((payload) => {
      transmissions.push(payload.message);
    });

    await vi.runOnlyPendingTimersAsync();
    expect(transmissions).toHaveLength(0);
  });

  it("opens one combined transmission for linear and github activity", async () => {
    const linearChange: TaskChange = {
      kind: "updated",
      task: {
        id: "MIND-42",
        linearId: "uuid",
        title: "Task",
        status: "Done",
        updatedAt: "2026-07-13T10:00:00Z",
      },
      changes: ["status updated"],
    };

    mockDetectTaskChanges.mockReturnValue({
      changes: [linearChange],
      nextCache: { baselineEstablished: true, snapshots: {} },
    });
    mockFetchGitHubPoll.mockResolvedValue({
      status: "connected",
      data: {
        activities: [
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
        ],
        updatedState: {
          processedEventIds: ["p1"],
          branchHeads: {},
          prSnapshots: {},
          lastSuccessfulPollAt: "2026-07-13T10:00:00Z",
          baselineEstablished: true,
        },
        pollIntervalSeconds: 60,
      },
    });

    const transmissions: string[] = [];
    integrationMonitor.start((payload) => {
      transmissions.push(payload.message);
    });

    await vi.runOnlyPendingTimersAsync();
    expect(transmissions.length).toBeGreaterThanOrEqual(1);
    expect(transmissions[0]).toContain("SUDA update:");
    expect(transmissions[0]).toContain("MIND-42 moved to Done");
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
    expect(integrationMonitor.__getUnifiedTimerId()).not.toBeNull();
  });

  it("manual retry clears auth failure lock", async () => {
    mockFetchLinearPoll.mockResolvedValue({
      status: "authentication_failed",
      error: { httpStatus: 401, message: "401 Unauthorized" },
    });

    integrationMonitor.start(() => {});
    await vi.runOnlyPendingTimersAsync();
    expect(integrationMonitor.__getLinearRuntime().authFailed).toBe(true);

    mockFetchLinearPoll.mockResolvedValue(connectedLinear);
    await integrationMonitor.retryLinear();
    expect(integrationMonitor.__getLinearRuntime().authFailed).toBe(false);
    expect(integrationMonitor.__getLinearRuntime().status).toBe("connected");
  });
});
