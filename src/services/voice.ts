// Voice reads the exact chunk SUDA displays — it does not rewrite or summarize.
// ElevenLabs TTS is routed through a Tauri command so the API key stays server-side.

import { invoke } from "@tauri-apps/api/core";

let voiceMuted = false;
let speakGeneration = 0;
let activeCancel: (() => void) | null = null;
let configMissingWarningShown = false;
let diagnosticsLogged = false;
let lastVoiceProvider: "elevenlabs" | "browser" | null = null;
let audioPlaybackUnlocked = false;

// Minimal silent WAV — primes WebView autoplay during a user gesture.
const SILENT_AUDIO_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

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

let browserVoicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function loadBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechAvailable()) {
    return Promise.resolve([]);
  }

  if (browserVoicesPromise) {
    return browserVoicesPromise;
  }

  browserVoicesPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const finish = () => {
      const voices = synth.getVoices();
      resolve(voices);
      return voices.length > 0;
    };

    if (finish()) return;

    const onVoicesChanged = () => {
      if (finish()) {
        synth.removeEventListener("voiceschanged", onVoicesChanged);
      }
    };

    synth.addEventListener("voiceschanged", onVoicesChanged);
    synth.getVoices();

    window.setTimeout(() => {
      synth.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(synth.getVoices());
    }, 1500);
  });

  return browserVoicesPromise;
}

function pickBrowserVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;

  const english = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith("en"),
  );
  const pool = english.length > 0 ? english : voices;

  return (
    pool.find(
      (voice) => voice.lang.toLowerCase() === "en-us" && voice.localService,
    ) ??
    pool.find((voice) => voice.localService) ??
    pool[0] ??
    voices[0]
  );
}

function primeBrowserSpeech(): void {
  if (!isSpeechAvailable()) return;

  const synth = window.speechSynthesis;
  if (synth.paused) {
    synth.resume();
  }

  void loadBrowserVoices();
}

/** Preload system voices so the browser fallback is ready when ElevenLabs fails. */
export function primeBrowserSpeechForFallback(): void {
  primeBrowserSpeech();
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

  const voices = await loadBrowserVoices();

  console.info("[SUDA] Voice debug status", {
    tauriInvokeAvailable,
    elevenLabsConfigured,
    speechSynthesisAvailable: isSpeechAvailable(),
    browserVoicesAvailable: voices.length,
    browserVoiceSelected: pickBrowserVoice(voices)?.name ?? null,
    audioPlaybackUnlocked,
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

/**
 * Call during a user gesture (click/tap) so later async TTS playback is allowed.
 * WebView blocks audio.play() after ElevenLabs network latency without this.
 */
export async function unlockAudioPlayback(): Promise<boolean> {
  if (audioPlaybackUnlocked || typeof Audio === "undefined") {
    return audioPlaybackUnlocked;
  }

  const audio = new Audio(SILENT_AUDIO_DATA_URI);
  audio.volume = 0.001;

  try {
    await audio.play();
    audio.pause();
    audio.src = "";
    audioPlaybackUnlocked = true;
    primeBrowserSpeech();

    if (isDev()) {
      console.info("[SUDA] Audio playback unlocked");
    }

    return true;
  } catch (error) {
    if (isDev()) {
      const reason =
        error instanceof Error ? error.message : "autoplay blocked";
      console.warn(`[SUDA] Audio unlock failed: ${reason}`);
    }
    return false;
  }
}

export function isAudioPlaybackUnlocked(): boolean {
  return audioPlaybackUnlocked;
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
    if (isDev()) {
      console.warn("[SUDA] Browser speechSynthesis is not available");
    }
    callbacks?.onEnd?.();
    return;
  }

  if (generation !== undefined && generation !== speakGeneration) {
    return;
  }

  void (async () => {
    if (!audioPlaybackUnlocked) {
      await unlockAudioPlayback();
    }

    if (generation !== undefined && generation !== speakGeneration) {
      return;
    }

    const voices = await loadBrowserVoices();
    if (generation !== undefined && generation !== speakGeneration) {
      return;
    }

    logVoiceProvider("browser");

    if (isDev()) {
      const selected = pickBrowserVoice(voices);
      console.info("[SUDA] Browser voice fallback", {
        voicesAvailable: voices.length,
        selectedVoice: selected?.name ?? "default",
        selectedLang: selected?.lang ?? "default",
      });
    }

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
    utterance.volume = 1;

    const selectedVoice = pickBrowserVoice(voices);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    utterance.onstart = () => {
      if (!settled && generation === speakGeneration) {
        callbacks?.onStart?.();
      }
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (isDev()) {
        console.warn(
          `[SUDA] Browser speechSynthesis error: ${event.error || "unknown"}`,
        );
      }
      finish();
    };

    activeCancel = () => {
      settled = true;
      window.speechSynthesis.cancel();
      activeCancel = null;
    };

    const synth = window.speechSynthesis;
    synth.cancel();

    // WebView/Chromium often drops speak() if called immediately after cancel().
    window.setTimeout(() => {
      if (generation !== undefined && generation !== speakGeneration) {
        return;
      }
      if (settled) return;

      if (synth.paused) {
        synth.resume();
      }

      synth.speak(utterance);
    }, 50);
  })();
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

  if (!audioPlaybackUnlocked) {
    await unlockAudioPlayback();
  }

  if (settled) {
    return true;
  }

  try {
    await audio.play();
  } catch (error) {
    if (generation !== undefined && generation !== speakGeneration) {
      return true;
    }

    const reason =
      error instanceof Error ? error.message : "Audio playback failed";
    const hint = reason.toLowerCase().includes("notallowed")
      ? " — click SUDA once to allow audio"
      : "";
    logElevenLabsFailure(`Audio playback failed: ${reason}${hint}`);
    speakWithBrowser(text, callbacks, generation);
    return true;
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
