import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_GITHUB_MONITOR_STATE,
  loadGitHubMonitorState,
} from "./githubMonitorState";

describe("githubMonitorState", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns defaults for invalid JSON", () => {
    storage.set("suda-github-monitor-state", "{not json");
    const state = loadGitHubMonitorState();
    expect(state.processedEventIds).toEqual([]);
    expect(state.baselineEstablished).toBe(false);
    expect(state.version).toBe(1);
  });

  it("caps oversized processed IDs on load", () => {
    const ids = Array.from({ length: 600 }, (_, i) => `id-${i}`);
    storage.set(
      "suda-github-monitor-state",
      JSON.stringify({
        processedEventIds: ids,
        branchHeads: {},
        baselineEstablished: true,
      }),
    );
    const state = loadGitHubMonitorState();
    expect(state.processedEventIds.length).toBe(500);
    expect(state.processedEventIds[0]).toBe("id-100");
  });

  it("migrates missing version field", () => {
    storage.set(
      "suda-github-monitor-state",
      JSON.stringify({
        processedEventIds: [],
        branchHeads: {},
        baselineEstablished: false,
        lastSuccessfulPollAt: null,
      }),
    );
    const state = loadGitHubMonitorState();
    expect(state.version).toBe(1);
  });

  it("exposes empty defaults", () => {
    expect(EMPTY_GITHUB_MONITOR_STATE.version).toBe(1);
  });
});
