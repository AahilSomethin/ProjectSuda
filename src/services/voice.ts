// Voice reads the exact chunk SUDA displays — it does not rewrite or summarize.
// The AI service (aiSummary.ts) decides what SUDA says; this module only speaks it.

let voiceMuted = false;
let activeCancel: (() => void) | null = null;

export interface VoiceCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
}

export function muteVoice(muted: boolean): void {
  voiceMuted = muted;
  if (muted) {
    cancelSpeech();
  }
}

export function isVoiceMuted(): boolean {
  return voiceMuted;
}

export function cancelSpeech(): void {
  if (activeCancel) {
    activeCancel();
    activeCancel = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function isSpeechAvailable(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

// TODO: Integrate ElevenLabs TTS API for higher-quality voice output.
// When added, speak the exact `text` argument — do not modify it before playback.
// async function speakWithElevenLabs(text: string, callbacks?: VoiceCallbacks): Promise<void> { ... }

function speakWithBrowser(text: string, callbacks?: VoiceCallbacks): void {
  if (!isSpeechAvailable()) {
    callbacks?.onEnd?.();
    return;
  }

  cancelSpeech();

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    activeCancel = null;
    callbacks?.onEnd?.();
  };

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;

  utterance.onstart = () => {
    if (!settled) callbacks?.onStart?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  activeCancel = () => {
    settled = true;
    activeCancel = null;
  };

  window.speechSynthesis.speak(utterance);
}

export function speakText(text: string, callbacks?: VoiceCallbacks): void {
  if (voiceMuted || !text.trim()) {
    callbacks?.onEnd?.();
    return;
  }

  speakWithBrowser(text, callbacks);
}
