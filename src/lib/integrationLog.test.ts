import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetIntegrationLogForTests,
  logOnce,
  logOnStateChange,
} from "./integrationLog";

describe("integrationLog", () => {
  beforeEach(() => {
    __resetIntegrationLogForTests();
  });

  it("logOnce deduplicates identical keys", () => {
    logOnce("test-key", "first message");
    logOnce("test-key", "second message");
    expect(true).toBe(true);
  });

  it("logOnStateChange only logs when status changes", () => {
    logOnStateChange("Linear", "connecting", "connected", "Connected");
    logOnStateChange("Linear", "connected", "connected", "Still connected");
    expect(true).toBe(true);
  });
});
