import { useEffect, useState } from "react";
import { cancelSpeech, speakText } from "../services/voice";

export function useChunkVoice(
  text: string,
  enabled: boolean,
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

    speakText(text, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => {
        setIsSpeaking(false);
        setVoiceDone(true);
      },
    });

    return () => {
      cancelSpeech();
      setIsSpeaking(false);
      setVoiceDone(true);
    };
  }, [text, enabled]);

  return { isSpeaking, voiceDone };
}
