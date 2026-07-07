import { config } from "../config";

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

async function speakWithElevenLabs(_text: string): Promise<void> {
  // TODO: Integrate ElevenLabs TTS API
  // const response = await fetch(
  //   `https://api.elevenlabs.io/v1/text-to-speech/${config.elevenLabsVoiceId}`,
  //   {
  //     method: "POST",
  //     headers: {
  //       "xi-api-key": config.elevenLabsApiKey,
  //       "Content-Type": "application/json",
  //     },
  //     body: JSON.stringify({ text, model_id: "eleven_monolingual_v1" }),
  //   },
  // );
  // const audioBlob = await response.blob();
  // const audio = new Audio(URL.createObjectURL(audioBlob));
  // await audio.play();
  throw new Error("ElevenLabs API not yet implemented");
}

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

  if (config.elevenLabsApiKey && config.elevenLabsVoiceId) {
    try {
      await speakWithElevenLabs(text);
      return;
    } catch {
      // Fall through to browser TTS
    }
  }

  speakWithBrowser(text);
}
