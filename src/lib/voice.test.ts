import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetSpokenVoiceKeysForTests,
  canInvokeElevenLabs,
  hasSpokenVoiceKey,
  rememberSpokenVoiceKey,
} from "../services/voice";

describe("voice", () => {
  beforeEach(() => {
    __resetSpokenVoiceKeysForTests();
  });

  it("blocks idle payloads from ElevenLabs", () => {
    expect(
      canInvokeElevenLabs({
        kind: "idle",
        voiceEnabled: true,
        voiceMessage: "Hello",
        muted: false,
      }),
    ).toBe(false);
  });

  it("blocks empty voice messages", () => {
    expect(
      canInvokeElevenLabs({
        kind: "meaningful-activity",
        voiceEnabled: true,
        voiceMessage: "   ",
        muted: false,
      }),
    ).toBe(false);
  });

  it("deduplicates spoken voice keys", () => {
    rememberSpokenVoiceKey("tx-1");
    expect(hasSpokenVoiceKey("tx-1")).toBe(true);
    expect(hasSpokenVoiceKey("tx-2")).toBe(false);
  });
});
