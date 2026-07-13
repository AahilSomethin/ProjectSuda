import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { config } from "../config";
import { usePanelReveal } from "../hooks/usePanelReveal";
import { useSettings } from "../hooks/useSettings";
import { useSudaBriefing } from "../hooks/useSudaBriefing";
import { useTransmission } from "../hooks/useTransmission";
import { devLog } from "../lib/devLog";
import { getSudaActivityState, type TransmissionActivity } from "../lib/sudaState";
import {
  createSummonedIdlePayload,
  getTransmissionAutoHideMs,
} from "../lib/transmissions";
import { setSettingsOverlay, setWindowMode } from "../lib/windowMode";
import type { IntegrationViewStatus, TransmissionPayload } from "../types";
import { briefingToLinearTasks } from "../services/briefing";
import { integrationMonitor } from "../services/integrationMonitor";
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
    briefing,
    briefingLoading,
    startupHandledRef,
  } = useSudaBriefing();

  const [integrationStatuses, setIntegrationStatuses] = useState<
    IntegrationViewStatus[]
  >(() => integrationMonitor.getIntegrationStatuses());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isManuallySummoned, setIsManuallySummoned] = useState(false);
  const pendingSettingsOpenRef = useRef(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [sudaVisualState, setSudaVisualState] = useState<"idle" | "active">(
    "idle",
  );

  const hasActiveTransmission = transmission.phase !== "idle";
  const sudaPanelIntent = hasActiveTransmission || isManuallySummoned;
  const shouldShowPanel = !settingsOpen && sudaPanelIntent;

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
  }, []);

  const handlePanelCloseComplete = useCallback(() => {
    setIsManuallySummoned(false);
    dismissTransmission();
    if (pendingSettingsOpenRef.current) {
      pendingSettingsOpenRef.current = false;
      setSettingsOpen(true);
    }
  }, [dismissTransmission]);

  const presentTransmission = useCallback(
    (payload: TransmissionPayload) => {
      pendingSettingsOpenRef.current = false;
      setSettingsOpen(false);
      const voiceEnabled =
        payload.voiceEnabled === true && !settings.muteVoice;
      showTransmission({
        ...payload,
        voiceEnabled,
      });
    },
    [settings.muteVoice, showTransmission],
  );

  useEffect(() => {
    integrationMonitor.start(
      (payload) => {
        presentTransmission(payload);
        devLog("[SUDA] transmission opened");
      },
      (statuses) => setIntegrationStatuses(statuses),
    );
  }, [presentTransmission]);

  const {
    panelReveal,
    panelMounted,
    edgeExpanded,
    contentVisible,
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

  useEffect(() => {
    if (panelMounted) return;

    if (settingsOpen) {
      void setSettingsOverlay(true);
    } else {
      void setSettingsOverlay(false);
    }
  }, [panelMounted, settingsOpen]);

  useEffect(() => {
    if (!settingsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (settingsRef.current?.contains(target)) return;
      if (document.querySelector(".suda-control")?.contains(target)) return;
      closeSettings();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSettings();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSettings, settingsOpen]);

  useEffect(() => {
    if (!briefing || startupHandledRef.current) return;

    startupHandledRef.current = true;
    const tasks = briefingToLinearTasks(briefing);
    integrationMonitor.establishBaselineFromTasks(tasks);
    devLog("[SUDA] startup baseline established — no transmission");
  }, [briefing, startupHandledRef]);

  const refreshBriefing = useCallback(async () => {
    void unlockAudioPlayback();
    await integrationMonitor.refreshIntegrations();
  }, []);

  const handleRetryLinear = useCallback(() => {
    void integrationMonitor.retryLinear();
  }, []);

  const handleCheckGitHub = useCallback(() => {
    void integrationMonitor.checkGitHubNow();
  }, []);

  const summonSuda = useCallback(() => {
    void unlockAudioPlayback();
    pendingSettingsOpenRef.current = false;
    setSettingsOpen(false);
    setIsManuallySummoned(true);
    if (!hasActiveTransmission) {
      presentTransmission(createSummonedIdlePayload());
    }
  }, [hasActiveTransmission, presentTransmission]);

  const dismissSuda = useCallback(() => {
    pendingSettingsOpenRef.current = false;
    setIsManuallySummoned(false);
    dismissTransmission();
  }, [dismissTransmission]);

  const openSettingsFromFab = useCallback(() => {
    void unlockAudioPlayback();
    if (sudaPanelIntent) {
      pendingSettingsOpenRef.current = true;
      setIsManuallySummoned(false);
      dismissTransmission();
      return;
    }
    setSettingsOpen(true);
  }, [dismissTransmission, sudaPanelIntent]);

  const handleAutoHide = useCallback(() => {
    if (isManuallySummoned) {
      presentTransmission(createSummonedIdlePayload());
      return;
    }
    dismissTransmission();
  }, [dismissTransmission, isManuallySummoned, presentTransmission]);

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

  const widgetClassName = [
    "suda-widget",
    panelMounted ? "suda-widget--expanded" : "suda-widget--compact",
  ].join(" ");

  return (
    <div className={widgetClassName}>
      <SudaControlMenu
        panelVisible={panelMounted}
        briefingLoading={briefingLoading}
        settingsOpen={settingsOpen}
        onSummon={summonSuda}
        onDismiss={dismissSuda}
        onRefreshBriefing={refreshBriefing}
        onOpenSettings={openSettingsFromFab}
        onCloseSettings={closeSettings}
      />

      {settingsOpen && (
        <div ref={settingsRef} className="suda-settings-wrap">
          <SettingsPanel
            settings={settings}
            integrationStatuses={integrationStatuses}
            onRetryLinear={handleRetryLinear}
            onCheckGitHub={handleCheckGitHub}
            onUpdate={updateSetting}
            onClose={closeSettings}
          />
        </div>
      )}

      {panelMounted && !settingsOpen && (
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
                !settingsOpen &&
                isExpanded &&
                transmission.phase !== "idle" && (
                  <TransmissionPopup
                    transmission={transmission}
                    disableText={settings.disableText}
                    muteVoice={settings.muteVoice}
                    fallbackVoice={settings.fallbackVoice}
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
