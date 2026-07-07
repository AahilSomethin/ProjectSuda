// Voice reads the exact final message SUDA displays — it does not rewrite or summarize.
// The AI service (aiSummary.ts) decides what SUDA says; this module only speaks it.

let voiceMuted = false;

export function muteVoice(muted: boolean): void {
  voiceMuted = muted;
  if (muted && typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isVoiceMuted(): boolean {
  return voiceMuted;
}

// TODO: Integrate ElevenLabs TTS API for higher-quality voice output.
// When added, speak the exact `text` argument — do not modify it before playback.
// async function speakWithElevenLabs(text: string): Promise<void> { ... }

function speakWithBrowser(text: string): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

export async function speakText(text: string): Promise<void> {
  if (voiceMuted || !text.trim()) return;

  // MVP: speak the exact message via browser TTS
  speakWithBrowser(text);
}
