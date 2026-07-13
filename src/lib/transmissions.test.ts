import { describe, expect, it } from "vitest";
import {
  createCombinedBriefingPayload,
  createCheckingLinearPayload,
  createSummonedIdlePayload,
} from "./transmissions";
import type { BriefingEvent } from "./briefingCoordinator";

describe("transmissions", () => {
  it("marks combined updates as meaningful activity", () => {
    const events: BriefingEvent[] = [
      {
        kind: "github",
        priority: 2,
        activity: {
          id: "p1",
          type: "push",
          repository: "suda",
          branch: "main",
          actor: "Aahil",
          commitCount: 1,
          commitMessages: [],
          forced: false,
          occurredAt: "2026-07-13T10:00:00Z",
        },
      },
    ];

    const payload = createCombinedBriefingPayload(
      {
        title: "SUDA",
        message: "SUDA update:\n• One commit was pushed to suda.",
        voiceMessage: "One commit was pushed to suda.",
        overflowMessages: [],
      },
      events,
    );

    expect(payload.kind).toBe("meaningful-activity");
    expect(payload.voiceEnabled).toBe(true);
    expect(payload.transmissionId).toBeTruthy();
  });

  it("idle and status payloads never enable voice", () => {
    expect(createSummonedIdlePayload().kind).toBe("idle");
    expect(createSummonedIdlePayload().voiceEnabled).toBe(false);
    expect(createCheckingLinearPayload().kind).toBe("status");
    expect(createCheckingLinearPayload().voiceEnabled).toBe(false);
  });
});
