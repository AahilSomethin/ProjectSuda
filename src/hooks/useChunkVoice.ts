import { useEffect, useState } from "react";
import { cancelSpeech, speakText } from "../services/voice";

export function useChunkVoice(
  text: string,
  enabled: boolean,
): {
  isVoicePlaying: boolean;
  voiceDone: boolean;
} {
  const [isVoicePlaying, setIsVoicePlaying] = useState(false);
  const [voiceDone, setVoiceDone] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      cancelSpeech();
      setIsVoicePlaying(false);
      setVoiceDone(true);
      return;
    }

    setIsVoicePlaying(false);
    setVoiceDone(false);

    speakText(text, {
      onStart: () => setIsVoicePlaying(true),
      onEnd: () => {
        setIsVoicePlaying(false);
        setVoiceDone(true);
      },
    });

    return () => cancelSpeech();
  }, [text, enabled]);

  return { isVoicePlaying, voiceDone };
}
