// Voice reads the exact chunk SUDA displays — it does not rewrite or summarize.
// ElevenLabs TTS is routed through a Tauri command so the API key stays server-side.

import { invoke } from "@tauri-apps/api/core";

let voiceMuted = false;
let speakGeneration = 0;
let activeCancel: (() => void) | null = null;
let configMissingWarningShown = false;
let diagnosticsLogged = false;
let lastVoiceProvider: "elevenlabs" | "browser" | null = null;

export interface VoiceCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
}

interface TtsResponse {
  audioBase64: string;
  voiceId: string;
  modelId: string;
}

function isDev(): boolean {
  return import.meta.env.DEV;
}

function isTauriInvokeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isSpeechAvailable(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

function logElevenLabsFailure(reason: string, dedupe = false): void {
  if (!isDev()) return;
  if (dedupe && configMissingWarningShown) return;
  if (dedupe) configMissingWarningShown = true;

  console.warn(
    `[SUDA] ElevenLabs failed, using browser speechSynthesis fallback. Reason: ${reason}`,
  );
}

function logVoiceProvider(provider: "elevenlabs" | "browser"): void {
  if (!isDev()) return;

  lastVoiceProvider = provider;

  if (provider === "elevenlabs") {
    console.info("[SUDA] Voice provider: ElevenLabs");
    return;
  }

  console.warn("[SUDA] Voice provider: browser speechSynthesis fallback");
}

async function logVoiceDiagnostics(): Promise<void> {
  if (!isDev() || diagnosticsLogged) return;
  diagnosticsLogged = true;

  const tauriInvokeAvailable = isTauriInvokeAvailable();
  let elevenLabsConfigured = false;

  if (tauriInvokeAvailable) {
    try {
      elevenLabsConfigured = await invoke<boolean>("elevenlabs_configured");
    } catch {
      elevenLabsConfigured = false;
    }
  }

  console.info("[SUDA] Voice diagnostics", {
    tauriInvokeAvailable,
    elevenLabsConfigured,
    speechSynthesisAvailable: isSpeechAvailable(),
    lastVoiceProvider,
  });
}

export async function debugVoiceStatus(): Promise<void> {
  const tauriInvokeAvailable = isTauriInvokeAvailable();
  let elevenLabsConfigured = false;

  if (tauriInvokeAvailable) {
    try {
      elevenLabsConfigured = await invoke<boolean>("elevenlabs_configured");
    } catch {
      elevenLabsConfigured = false;
    }
  }

  console.info("[SUDA] Voice debug status", {
    tauriInvokeAvailable,
    elevenLabsConfigured,
    speechSynthesisAvailable: isSpeechAvailable(),
    lastVoiceProvider,
    fallbackUsed: lastVoiceProvider === "browser",
  });
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
  speakGeneration += 1;

  if (activeCancel) {
    activeCancel();
    activeCancel = null;
  }

  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakWithBrowser(
  text: string,
  callbacks?: VoiceCallbacks,
  generation?: number,
): void {
  if (!isSpeechAvailable()) {
    callbacks?.onEnd?.();
    return;
  }

  if (generation !== undefined && generation !== speakGeneration) {
    return;
  }

  logVoiceProvider("browser");

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
    if (!settled && generation === speakGeneration) {
      callbacks?.onStart?.();
    }
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  activeCancel = () => {
    settled = true;
    activeCancel = null;
  };

  window.speechSynthesis.speak(utterance);
}

async function isElevenLabsConfigured(): Promise<boolean> {
  try {
    return await invoke<boolean>("elevenlabs_configured");
  } catch {
    return false;
  }
}

async function speakWithElevenLabs(
  text: string,
  callbacks?: VoiceCallbacks,
  generation?: number,
): Promise<boolean> {
  if (generation !== undefined && generation !== speakGeneration) {
    return true;
  }

  const configured = await isElevenLabsConfigured();
  if (!configured) {
    logElevenLabsFailure(
      "ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID missing",
      true,
    );
    return false;
  }

  if (generation !== undefined && generation !== speakGeneration) {
    return true;
  }

  let result: TtsResponse;
  try {
    result = await invoke<TtsResponse>("elevenlabs_tts", { text });
  } catch (error) {
    if (generation !== undefined && generation !== speakGeneration) {
      return true;
    }

    const reason =
      error instanceof Error ? error.message : "ElevenLabs request failed";
    logElevenLabsFailure(reason);
    return false;
  }

  if (generation !== undefined && generation !== speakGeneration) {
    return true;
  }

  const binary = atob(result.audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: "audio/mpeg" });
  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    URL.revokeObjectURL(objectUrl);
    activeCancel = null;
    callbacks?.onEnd?.();
  };

  audio.addEventListener("playing", () => {
    if (!settled && generation === speakGeneration) {
      callbacks?.onStart?.();
    }
  });
  audio.addEventListener("ended", finish);
  audio.addEventListener("error", () => {
    if (generation !== undefined && generation !== speakGeneration) return;
    if (settled) return;

    settled = true;
    URL.revokeObjectURL(objectUrl);
    activeCancel = null;

    logElevenLabsFailure("Audio playback failed: audio element error");
    speakWithBrowser(text, callbacks, generation);
  });

  activeCancel = () => {
    settled = true;
    audio.pause();
    audio.src = "";
    URL.revokeObjectURL(objectUrl);
    activeCancel = null;
  };

  try {
    await audio.play();
  } catch (error) {
    if (generation !== undefined && generation !== speakGeneration) {
      return true;
    }

    const reason =
      error instanceof Error ? error.message : "Audio playback failed";
    logElevenLabsFailure(`Audio playback failed: ${reason}`);
    return false;
  }

  if (generation !== undefined && generation !== speakGeneration) {
    return true;
  }

  if (isDev()) {
    console.info(
      `[SUDA] ElevenLabs playback voice_id=${result.voiceId} model_id=${result.modelId}`,
    );
  }

  logVoiceProvider("elevenlabs");
  return true;
}

export function speakText(text: string, callbacks?: VoiceCallbacks): void {
  if (voiceMuted || !text.trim()) {
    callbacks?.onEnd?.();
    return;
  }

  void logVoiceDiagnostics();

  cancelSpeech();
  const generation = speakGeneration;

  void (async () => {
    const usedElevenLabs = await speakWithElevenLabs(text, callbacks, generation);
    if (generation !== speakGeneration) return;
    if (!usedElevenLabs) {
      speakWithBrowser(text, callbacks, generation);
    }
  })();
}
