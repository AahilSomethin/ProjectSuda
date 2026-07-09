import { useCallback, useEffect, useState } from "react";
import type { WidgetSettings } from "../types";

const STORAGE_KEY = "suda-settings";

const DEFAULT_SETTINGS: WidgetSettings = {
  muteVoice: false,
  disableText: false,
  hideCharacter: false,
};

function loadSettings(): WidgetSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<WidgetSettings>;
    return {
      muteVoice: parsed.muteVoice ?? DEFAULT_SETTINGS.muteVoice,
      disableText: parsed.disableText ?? DEFAULT_SETTINGS.disableText,
      hideCharacter: parsed.hideCharacter ?? DEFAULT_SETTINGS.hideCharacter,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: WidgetSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useSettings() {
  const [settings, setSettings] = useState<WidgetSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSetting = useCallback(
    <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  return { settings, updateSetting };
}

export type { WidgetSettings };
