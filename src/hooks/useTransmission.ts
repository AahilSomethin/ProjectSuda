import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "../config";
import { muteVoice, speakText } from "../services/voice";
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
    setTransmission(IDLE_TRANSMISSION);
    setIsExpanded(false);
  }, [clearIntroTimer]);

  const showTransmission = useCallback(
    (payload: TransmissionPayload) => {
      clearIntroTimer();

      const active: ActiveTransmission = {
        ...payload,
        voiceEnabled: payload.voiceEnabled ?? true,
        characterVisible: payload.characterVisible ?? true,
        phase: "intro",
      };

      setTransmission(active);
      setIsExpanded(true);

      introTimerRef.current = setTimeout(() => {
        setTransmission((prev) => {
          if (prev.phase !== "intro") return prev;
          return { ...prev, phase: "message" };
        });

        if (active.voiceEnabled && !settings.muteVoice) {
          speakText(active.message);
        }
      }, config.transmissionIntroMs);
    },
    [clearIntroTimer, settings.muteVoice],
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
