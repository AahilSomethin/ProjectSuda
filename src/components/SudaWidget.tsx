import { useCallback, useEffect, useMemo, useState } from "react";
import { config } from "../config";
import { usePanelReveal } from "../hooks/usePanelReveal";
import { useSettings } from "../hooks/useSettings";
import { useSudaBriefing } from "../hooks/useSudaBriefing";
import { useTransmission } from "../hooks/useTransmission";
import { getSudaActivityState, type TransmissionActivity } from "../lib/sudaState";
import {
  createBriefingErrorPayload,
  createBriefingPayload,
  createCheckingLinearPayload,
  createSummonedIdlePayload,
  createNewTasksPayload,
  getTransmissionAutoHideMs,
} from "../lib/transmissions";
import { setWindowMode } from "../lib/windowMode";
import {
  primeBrowserSpeechForFallback,
  unlockAudioPlayback,
} from "../services/voice";
import SettingsPanel from "./SettingsPanel";
import SudaControlMenu from "./SudaControlMenu";
import TransmissionPopup from "./TransmissionPopup";
import "./widget.css";

const SUDA_GIF_SRC = config.characterGifUrl || "/suda.gif";
const SUDA_IDLE_SRC = config.characterIdleImageUrl || "/suda-idle.png";

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
    loadBriefing,
    pollForUpdates,
    markTasksSeen,
  } = useSudaBriefing();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isManuallySummoned, setIsManuallySummoned] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sudaVisualState, setSudaVisualState] = useState<"idle" | "active">(
    "idle",
  );

  const hasActiveTransmission = transmission.phase !== "idle";
  const shouldShowPanel = hasActiveTransmission || isManuallySummoned;

  const handlePanelCloseComplete = useCallback(() => {
    dismissTransmission();
    setIsManuallySummoned(false);
  }, [dismissTransmission]);

  const {
    panelReveal,
    panelMounted,
    edgeExpanded,
    contentVisible,
    dismissPanel,
  } = usePanelReveal({
    shouldShowPanel,
    onCloseComplete: handlePanelCloseComplete,
  });

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
    void setWindowMode("compact");
    primeBrowserSpeechForFallback();
  }, []);

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

  const summonSuda = useCallback(() => {
    void unlockAudioPlayback();
    setIsManuallySummoned(true);
    if (!hasActiveTransmission) {
      showTransmission(createSummonedIdlePayload());
    }
  }, [hasActiveTransmission, showTransmission]);

  const dismissSuda = useCallback(() => {
    dismissPanel();
  }, [dismissPanel]);

  const handleAutoHide = useCallback(() => {
    if (isManuallySummoned) {
      showTransmission(createSummonedIdlePayload());
      return;
    }
    dismissPanel();
  }, [dismissPanel, isManuallySummoned, showTransmission]);

  const showCharacter =
    !settings.hideCharacter && (transmission.characterVisible ?? true);

  const panelClassName = [
    "suda-panel",
    panelReveal === "opening" ? "suda-panel--opening" : "",
    panelReveal === "open" ? "suda-panel--open" : "",
    panelReveal === "closing" ? "suda-panel--closing" : "",
    edgeExpanded ? "suda-panel--edges-expanded" : "",
    contentVisible ? "suda-panel--content-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="suda-widget">
      <SudaControlMenu
        panelVisible={panelMounted}
        briefingLoading={briefingLoading}
        settingsOpen={settingsOpen}
        onSummon={summonSuda}
        onDismiss={dismissSuda}
        onRefreshBriefing={refreshBriefing}
        onOpenSettings={() => {
          void unlockAudioPlayback();
          setSettingsOpen(true);
        }}
        onCloseSettings={() => setSettingsOpen(false)}
      />

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onUpdate={updateSetting}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {panelMounted && (
        <div className="suda-widget__inner">
          <div className={panelClassName}>
            <button
              type="button"
              className="suda-panel__dismiss"
              onClick={dismissSuda}
              aria-label="Dismiss SUDA"
            >
              ×
            </button>

            <div className="suda-panel__edge suda-panel__edge--top" aria-hidden="true" />

            <div className="suda-panel__content">
              <div className="suda-panel__visual-wrap">
                {showCharacter ? (
                  <div
                    className={`suda-panel__visual${sudaActivity.isSudaActive ? " suda-panel__visual--transmitting" : ""}`}
                    aria-hidden="true"
                  >
                    {characterImageSrc ? (
                      <img
                        className="suda-panel__visual-img"
                        src={characterImageSrc}
                        alt=""
                      />
                    ) : (
                      <span className="suda-panel__visual-fallback">S</span>
                    )}
                  </div>
                ) : (
                  <div
                    className="suda-panel__visual suda-panel__visual--compact"
                    aria-hidden="true"
                  >
                    ◈
                  </div>
                )}

                <div className="suda-panel__visual-shade" aria-hidden="true" />
                <span className="suda-panel__label">SUDA</span>
              </div>

              {panelReveal === "open" &&
                isExpanded &&
                transmission.phase !== "idle" && (
                  <TransmissionPopup
                    transmission={transmission}
                    disableText={settings.disableText}
                    muteVoice={settings.muteVoice}
                    onTransmissionActivityChange={
                      handleTransmissionActivityChange
                    }
                    autoHideMs={getTransmissionAutoHideMs(transmission)}
                    onAutoHide={handleAutoHide}
                    isBusy={sudaActivity.transmissionBusy}
                  />
                )}
            </div>

            <div className="suda-panel__edge suda-panel__edge--bottom" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}
