import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { cancelSpeech, muteVoice } from "../services/voice";
import type {
  ActiveTransmission,
  TransmissionPayload,
  WidgetSettings,
} from "../types";

const IDLE_TRANSMISSION: ActiveTransmission = {
  phase: "idle",
  title: "",
  message: "",
  type: "info",
};

export function useTransmission(settings: WidgetSettings) {
  const [transmission, setTransmission] =
    useState<ActiveTransmission>(IDLE_TRANSMISSION);
  const [isExpanded, setIsExpanded] = useState(false);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    muteVoice(settings.muteVoice);
  }, [settings.muteVoice]);

  const clearIntroTimer = useCallback(() => {
    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
  }, []);

  const dismissTransmission = useCallback(() => {
    clearIntroTimer();
    cancelSpeech();
    setTransmission(IDLE_TRANSMISSION);
    setIsExpanded(false);
  }, [clearIntroTimer]);

  const showTransmission = useCallback(
    (payload: TransmissionPayload) => {
      clearIntroTimer();
      cancelSpeech();

      const skipIntro = payload.skipIntro ?? false;
      const voiceEnabled = payload.voiceEnabled ?? !skipIntro;

      const active: ActiveTransmission = {
        ...payload,
        skipIntro,
        voiceEnabled,
        characterVisible: payload.characterVisible ?? true,
        showActions: payload.showActions ?? false,
        phase: skipIntro ? "message" : "intro",
      };

      setTransmission(active);
      setIsExpanded(true);

      if (skipIntro) return;

      introTimerRef.current = setTimeout(() => {
        setTransmission((prev) => {
          if (prev.phase !== "intro") return prev;
          return { ...prev, phase: "message" };
        });
      }, config.transmissionIntroMs);
    },
    [clearIntroTimer],
  );

  useEffect(() => {
    return () => clearIntroTimer();
  }, [clearIntroTimer]);

  return {
    transmission,
    isExpanded,
    setIsExpanded,
    showTransmission,
    dismissTransmission,
  };
}
