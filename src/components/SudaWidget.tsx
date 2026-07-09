import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow, currentMonitor, PhysicalPosition } from "@tauri-apps/api/window";
import { config } from "../config";
import { useSettings } from "../hooks/useSettings";
import { useSudaBriefing } from "../hooks/useSudaBriefing";
import { useTransmission } from "../hooks/useTransmission";
import { getSudaActivityState, type TransmissionActivity } from "../lib/sudaState";
import {
  primeBrowserSpeechForFallback,
  unlockAudioPlayback,
} from "../services/voice";
import {
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

const SUDA_GIF_SRC = config.characterGifUrl || "/suda.gif";
const SUDA_IDLE_SRC = config.characterIdleImageUrl || "/suda-idle.png";

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
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sudaVisualState, setSudaVisualState] = useState<"idle" | "active">(
    "idle",
  );

  const sudaActivity = useMemo(
    () =>
      getSudaActivityState({
        briefingLoading,
        transmissionPhase: transmission.phase,
        isTyping,
        isSpeaking,
      }),
    [briefingLoading, transmission.phase, isTyping, isSpeaking],
  );

  useEffect(() => {
    setSudaVisualState(sudaActivity.isSudaActive ? "active" : "idle");
  }, [sudaActivity.isSudaActive]);

  const characterImageSrc =
    sudaVisualState === "active" ? SUDA_GIF_SRC : SUDA_IDLE_SRC;

  const handleTransmissionActivityChange = useCallback(
    (activity: TransmissionActivity) => {
      setIsTyping(activity.isTyping);
      setIsSpeaking(activity.isSpeaking);
    },
    [],
  );

  useEffect(() => {
    if (transmission.phase === "idle") {
      setIsTyping(false);
      setIsSpeaking(false);
    }
  }, [transmission.phase]);

  useEffect(() => {
    positionWindowRightMiddle();
    primeBrowserSpeechForFallback();
  }, []);

  const showBriefing = useCallback(
    (voiceEnabled = !settings.muteVoice) => {
      const latest = getLatestBriefing();
      if (!latest) return false;
      showTransmission(createBriefingPayload(latest, { voiceEnabled }));
      return true;
    },
    [getLatestBriefing, settings.muteVoice, showTransmission],
  );

  const refreshBriefing = useCallback(async () => {
    void unlockAudioPlayback();
    showTransmission(createCheckingLinearPayload());
    const { briefing: result, error } = await loadBriefing();
    if (result) {
      showTransmission(
        createBriefingPayload(result, {
          voiceEnabled: !settings.muteVoice,
        }),
      );
      return;
    }
    if (error) {
      showTransmission(createBriefingErrorPayload(error));
    }
  }, [loadBriefing, settings.muteVoice, showTransmission]);

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
                onTransmissionActivityChange={handleTransmissionActivityChange}
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
