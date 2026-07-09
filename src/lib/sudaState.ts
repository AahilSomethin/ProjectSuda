import type { TransmissionPhase } from "../types";

export interface SudaActivityInput {
  briefingLoading: boolean;
  transmissionPhase: TransmissionPhase;
  /** True while typewriter or voice is active in the popup */
  transmissionActivity: boolean;
}

export interface SudaActivityState {
  transmissionOpen: boolean;
  isIntro: boolean;
  isTypingOrSpeaking: boolean;
  isSudaActive: boolean;
  shouldUseAnimatedGif: boolean;
  transmissionBusy: boolean;
}

export function getSudaActivityState(
  input: SudaActivityInput,
): SudaActivityState {
  const transmissionOpen = input.transmissionPhase !== "idle";
  const isIntro = input.transmissionPhase === "intro";
  const isTypingOrSpeaking = input.transmissionActivity;
  const isSudaActive =
    input.briefingLoading || isIntro || isTypingOrSpeaking;

  return {
    transmissionOpen,
    isIntro,
    isTypingOrSpeaking,
    isSudaActive,
    shouldUseAnimatedGif: isSudaActive,
    transmissionBusy: input.briefingLoading || isIntro || isTypingOrSpeaking,
  };
}
