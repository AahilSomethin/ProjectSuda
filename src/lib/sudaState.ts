import type { TransmissionPhase } from "../types";

export interface TransmissionActivity {
  isTyping: boolean;
  isSpeaking: boolean;
}

export interface SudaActivityInput {
  briefingLoading: boolean;
  transmissionPhase: TransmissionPhase;
  isTyping: boolean;
  isSpeaking: boolean;
}

export interface SudaActivityState {
  transmissionOpen: boolean;
  isIntro: boolean;
  isTyping: boolean;
  isSpeaking: boolean;
  isSudaActive: boolean;
  shouldUseAnimatedGif: boolean;
  transmissionBusy: boolean;
}

export function getSudaActivityState(
  input: SudaActivityInput,
): SudaActivityState {
  const transmissionOpen = input.transmissionPhase !== "idle";
  const isIntro = input.transmissionPhase === "intro";
  const isSudaActive =
    input.briefingLoading ||
    isIntro ||
    input.isTyping ||
    input.isSpeaking;

  return {
    transmissionOpen,
    isIntro,
    isTyping: input.isTyping,
    isSpeaking: input.isSpeaking,
    isSudaActive,
    shouldUseAnimatedGif: isSudaActive,
    transmissionBusy:
      input.briefingLoading || isIntro || input.isTyping || input.isSpeaking,
  };
}
