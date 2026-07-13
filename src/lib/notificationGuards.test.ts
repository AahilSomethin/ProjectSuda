import { describe, expect, it } from "vitest";
import {
  buildTransmissionDedupKey,
  canInvokeVoice,
  hasMeaningfulActivity,
  isDuplicateTransmission,
  rememberTransmission,
  shouldOpenTransmission,
} from "./notificationGuards";
import type { BriefingEvent } from "./briefingCoordinator";
import type { WidgetSettings } from "../types";

const settings: WidgetSettings = {
  muteVoice: false,
  fallbackVoice: false,
  disableText: false,
  hideCharacter: false,
};

describe("notificationGuards", () => {
  it("hasMeaningfulActivity is false for empty events", () => {
    expect(hasMeaningfulActivity([])).toBe(false);
    expect(shouldOpenTransmission([])).toBe(false);
  });

  it("builds stable dedup keys", () => {
    const events: BriefingEvent[] = [
      {
        kind: "linear",
        priority: 4,
        change: {
          kind: "updated",
          task: {
            id: "ENG-1",
            linearId: "u1",
            title: "Task",
            status: "Done",
            updatedAt: "2026-07-13T10:00:00Z",
          },
          changes: ["status updated"],
        },
      },
    ];
    const key = buildTransmissionDedupKey(events, "ENG-1 moved to Done.");
    expect(key).toContain("linear:ENG-1");
    expect(isDuplicateTransmission(key, new Set())).toBe(false);
    const seen = new Set<string>();
    rememberTransmission(key, seen);
    expect(isDuplicateTransmission(key, seen)).toBe(true);
  });

  it("canInvokeVoice requires meaningful activity", () => {
    expect(
      canInvokeVoice(
        {
          title: "SUDA",
          message: "idle",
          type: "info",
          kind: "idle",
          voiceEnabled: true,
          voiceMessage: "hello",
        },
        settings,
      ),
    ).toBe(false);

    expect(
      canInvokeVoice(
        {
          title: "SUDA",
          message: "update",
          type: "update",
          kind: "meaningful-activity",
          voiceEnabled: true,
          voiceMessage: "Task updated.",
        },
        settings,
      ),
    ).toBe(true);
  });

  it("canInvokeVoice is false when muted", () => {
    expect(
      canInvokeVoice(
        {
          title: "SUDA",
          message: "update",
          type: "update",
          kind: "meaningful-activity",
          voiceEnabled: true,
          voiceMessage: "Task updated.",
        },
        { ...settings, muteVoice: true },
      ),
    ).toBe(false);
  });
});
