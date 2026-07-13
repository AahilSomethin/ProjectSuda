import { useEffect, useState } from "react";
import { cancelSpeech, speakText } from "../services/voice";
import type { TransmissionKind } from "../types";

export function useChunkVoice(
  text: string,
  enabled: boolean,
  fallbackVoice: boolean,
  options?: {
    dedupKey?: string;
    kind?: TransmissionKind;
    voiceEnabled?: boolean;
  },
): {
  isSpeaking: boolean;
  voiceDone: boolean;
} {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceDone, setVoiceDone] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      cancelSpeech();
      setIsSpeaking(false);
      setVoiceDone(true);
      return;
    }

    setIsSpeaking(false);
    setVoiceDone(false);

    speakText(
      text,
      {
        onStart: () => setIsSpeaking(true),
        onEnd: () => {
          setIsSpeaking(false);
          setVoiceDone(true);
        },
      },
      {
        fallbackVoice,
        dedupKey: options?.dedupKey,
        kind: options?.kind ?? "meaningful-activity",
        voiceEnabled: options?.voiceEnabled ?? true,
      },
    );

    return () => {
      cancelSpeech();
      setIsSpeaking(false);
      setVoiceDone(true);
    };
  }, [
    text,
    enabled,
    fallbackVoice,
    options?.dedupKey,
    options?.kind,
    options?.voiceEnabled,
  ]);

  return { isSpeaking, voiceDone };
}
