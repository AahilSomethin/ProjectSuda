import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWindow, currentMonitor, PhysicalPosition } from "@tauri-apps/api/window";
import { config } from "../config";
import { useSettings } from "../hooks/useSettings";
import { useSudaBriefing } from "../hooks/useSudaBriefing";
import { useTransmission } from "../hooks/useTransmission";
import { getSudaActivityState } from "../lib/sudaState";
import { getBriefingVoiceFingerprint } from "../services/briefing";
import {
  primeBrowserSpeechForFallback,
  resetLastSpokenText,
  unlockAudioPlayback,
} from "../services/voice";import {
  createBriefingErrorPayload,
  createBriefingPayload,
  createCheckingLinearPayload,
  createIdlePayload,
  createNewTasksPayload,
  getTransmissionAutoHideMs,
} from "../lib/transmissions";
import SettingsPanel from "./SettingsPanel";
import TransmissionPopup from "./TransmissionPopup";
import "./widget.css";
import type { LinearBriefingResponse } from "../types";
async function positionWindowRightMiddle(): Promise<void> {
  try {
    const appWindow = getCurrentWindow();
    const monitor = await currentMonitor();
    if (!monitor) return;

    const size = await appWindow.innerSize();
    const { workArea } = monitor;
    const x = workArea.position.x + workArea.size.width - size.width;
    const y =
      workArea.position.y +
      Math.floor((workArea.size.height - size.height) / 2);

    await appWindow.setPosition(new PhysicalPosition(x, y));
  } catch {
    // Not running in Tauri (e.g. browser preview) — skip positioning
  }
}

export default function SudaWidget() {
  const { settings, updateSetting } = useSettings();
  const {
    transmission,
    isExpanded,
    showTransmission,
    dismissTransmission,
  } = useTransmission(settings);

  const {
    briefingLoading,
    briefingError,
    loadBriefing,
    pollForUpdates,
    markTasksSeen,
    getLatestBriefing,
  } = useSudaBriefing();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transmissionActivity, setTransmissionActivity] = useState(false);
  const lastBriefingFingerprintRef = useRef<string | null>(null);
  const sudaActivity = useMemo(
    () =>
      getSudaActivityState({
        briefingLoading,
        transmissionPhase: transmission.phase,
        transmissionActivity,
      }),
    [briefingLoading, transmission.phase, transmissionActivity],
  );

  const characterImageSrc = useMemo(() => {
    const activeSrc = config.characterGifUrl || config.characterIdleImageUrl;
    const idleSrc = config.characterIdleImageUrl || config.characterGifUrl;
    return sudaActivity.shouldUseAnimatedGif ? activeSrc : idleSrc;
  }, [sudaActivity.shouldUseAnimatedGif]);

  const handleMessageActivityChange = useCallback((active: boolean) => {
    setTransmissionActivity(active);
  }, []);

  useEffect(() => {
    if (transmission.phase === "idle") {
      setTransmissionActivity(false);
    }
  }, [transmission.phase]);

  useEffect(() => {
    positionWindowRightMiddle();
    primeBrowserSpeechForFallback();
  }, []);

  const showBriefingTransmission = useCallback(
    (briefing: LinearBriefingResponse, options: { allowVoice: boolean }) => {
      const fingerprint = getBriefingVoiceFingerprint(briefing);
      const meaningfulChange = fingerprint !== lastBriefingFingerprintRef.current;

      if (meaningfulChange) {
        lastBriefingFingerprintRef.current = fingerprint;
        resetLastSpokenText();
      }

      const voiceEnabled =
        options.allowVoice && !settings.muteVoice && meaningfulChange;

      showTransmission(createBriefingPayload(briefing, { voiceEnabled }));
    },
    [settings.muteVoice, showTransmission],
  );

  const showBriefing = useCallback(() => {
    const latest = getLatestBriefing();
    if (!latest) return false;
    showBriefingTransmission(latest, { allowVoice: true });
    return true;
  }, [getLatestBriefing, showBriefingTransmission]);

  const refreshBriefing = useCallback(async () => {
    void unlockAudioPlayback();
    showTransmission(createCheckingLinearPayload());
    const { briefing: result, error } = await loadBriefing();
    if (result) {
      showBriefingTransmission(result, { allowVoice: true });
      return;
    }
    if (error) {
      showTransmission(createBriefingErrorPayload(error));
    }
  }, [loadBriefing, showBriefingTransmission, showTransmission]);
  useEffect(() => {
    const interval = setInterval(async () => {
      const updates = await pollForUpdates();
      if (updates.length === 0) return;
      showTransmission(createNewTasksPayload(updates));
      markTasksSeen(updates.map((task) => task.id));
    }, config.linearPollIntervalMs);

    return () => clearInterval(interval);
  }, [markTasksSeen, pollForUpdates, showTransmission]);

  const showCharacter =
    !settings.hideCharacter &&
    (transmission.characterVisible ?? true);

  const handleAvatarClick = () => {
    void unlockAudioPlayback();

    if (isExpanded) {
      dismissTransmission();
      return;
    }

    if (briefingLoading) {
      showTransmission(createCheckingLinearPayload());
      return;
    }

    if (briefingError) {
      showTransmission(createBriefingErrorPayload(briefingError));
      return;
    }

    if (showBriefing()) return;

    showTransmission(createIdlePayload());
  };

  const handleCompanionClick = () => {
    void unlockAudioPlayback();

    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    handleAvatarClick();
  };

  return (
    <div className="suda-widget">
      <div className="suda-widget__inner">
        <div className="suda-panel">
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onUpdate={updateSetting}
              onClose={() => setSettingsOpen(false)}
            />
          )}

          <div className="suda-panel__edge suda-panel__edge--top" aria-hidden="true" />

          <div className="suda-panel__content">
            <div className="suda-panel__visual-wrap">
              {showCharacter ? (
                <button
                  type="button"
                  className={`suda-panel__visual${sudaActivity.isSudaActive ? " suda-panel__visual--transmitting" : ""}`}
                  onClick={handleAvatarClick}
                  aria-label="SUDA companion"
                >
                  {characterImageSrc ? (
                    <img
                      className="suda-panel__visual-img"
                      src={characterImageSrc}
                      alt="SUDA"
                    />
                  ) : (
                    <span className="suda-panel__visual-fallback">S</span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="suda-panel__visual suda-panel__visual--compact"
                  onClick={handleCompanionClick}
                  aria-label="Open SUDA panel"
                >
                  ◈
                </button>
              )}

              <div className="suda-panel__visual-shade" aria-hidden="true" />
              <span className="suda-panel__label">SUDA</span>

              <button
                type="button"
                className="suda-panel__settings"
                onClick={() => {
                  void unlockAudioPlayback();
                  setSettingsOpen((v) => !v);
                }}
                aria-label="Settings"
              >
                ⚙
              </button>
            </div>

            {isExpanded && transmission.phase !== "idle" && (
              <TransmissionPopup
                transmission={transmission}
                disableText={settings.disableText}
                muteVoice={settings.muteVoice}
                onRefreshBriefing={refreshBriefing}
                briefingLoading={briefingLoading}
                onMessageActivityChange={handleMessageActivityChange}
                autoHideMs={getTransmissionAutoHideMs(transmission)}
                onAutoHide={dismissTransmission}
                isBusy={sudaActivity.transmissionBusy}
              />
            )}
          </div>

          <div className="suda-panel__edge suda-panel__edge--bottom" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
