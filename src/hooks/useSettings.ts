import { useCallback, useEffect, useState } from "react";
import type { PersonalityMode, WidgetSettings } from "../types";

const STORAGE_KEY = "suda-settings";

const DEFAULT_SETTINGS: WidgetSettings = {
  muteVoice: false,
  disableText: false,
  hideCharacter: false,
  personality: "gentle",
};

function loadSettings(): WidgetSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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

export type { PersonalityMode, WidgetSettings };
