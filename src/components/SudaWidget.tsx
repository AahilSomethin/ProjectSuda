import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow, currentMonitor, PhysicalPosition } from "@tauri-apps/api/window";
import { config } from "../config";
import { useSettings } from "../hooks/useSettings";
import { useTransmission } from "../hooks/useTransmission";
import {
  BriefingError,
  fetchLinearBriefing,
  formatBriefingMessage,
  formatBriefingVoiceText,
  formatNewTasksUpdate,
  getCachedBriefing,
} from "../services/briefing";
import { fetchNewLinearUpdates } from "../services/linear";
import type { LinearBriefingResponse } from "../types";
import SettingsPanel from "./SettingsPanel";
import TransmissionPopup from "./TransmissionPopup";
import "./widget.css";

const SEEN_TASKS_KEY = "suda-seen-task-ids";

const IDLE_MESSAGE = "SUDA online. No active transmission.";
const CHECKING_LINEAR_MESSAGE = "Checking Linear…";
const BRIEFING_ERROR_MESSAGE =
  "Failed to load Linear briefing: I couldn't reach Linear right now. Check your connection and LINEAR_API_KEY, then try again.";

function loadSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_TASKS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  sessionStorage.setItem(SEEN_TASKS_KEY, JSON.stringify([...ids]));
}

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

function showBriefingTransmission(
  briefing: LinearBriefingResponse,
  showTransmission: ReturnType<typeof useTransmission>["showTransmission"],
  options?: { voiceEnabled?: boolean; skipIntro?: boolean },
) {
  const voiceEnabled = options?.voiceEnabled ?? true;
  const skipIntro = options?.skipIntro ?? false;

  showTransmission({
    title: "Morning Briefing",
    message: formatBriefingMessage(briefing),
    voiceMessage: formatBriefingVoiceText(briefing),
    type: "briefing",
    skipIntro,
    voiceEnabled,
    showActions: true,
  });
}

export default function SudaWidget() {
  const { settings, updateSetting } = useSettings();
  const {
    transmission,
    isExpanded,
    showTransmission,
    dismissTransmission,
  } = useTransmission(settings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [briefing, setBriefing] = useState<LinearBriefingResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const pollInitializedRef = useRef(false);
  const briefingRequestRef = useRef(0);

  const isTransmitting =
    transmission.phase === "intro" ||
    (transmission.phase === "message" && !transmission.skipIntro);

  const loadBriefing = useCallback(
    async (options?: { showPopup?: boolean; voiceEnabled?: boolean }) => {
      const requestId = ++briefingRequestRef.current;
      setBriefingLoading(true);
      setBriefingError(null);

      if (options?.showPopup) {
        showTransmission({
          title: "Morning Briefing",
          message: CHECKING_LINEAR_MESSAGE,
          type: "briefing",
          skipIntro: true,
          voiceEnabled: false,
          showActions: true,
        });
      }

      try {
        const result = await fetchLinearBriefing();
        if (requestId !== briefingRequestRef.current) return result;

        setBriefing(result);
        result.rawTasks.forEach((task) => seenIdsRef.current.add(task.identifier));
        saveSeenIds(seenIdsRef.current);

        if (options?.showPopup) {
          showBriefingTransmission(result, showTransmission, {
            voiceEnabled: options.voiceEnabled ?? !settings.muteVoice,
            skipIntro: true,
          });
        }

        return result;
      } catch (error) {
        if (requestId !== briefingRequestRef.current) return null;

        const message =
          error instanceof BriefingError
            ? error.message
            : BRIEFING_ERROR_MESSAGE;
        setBriefingError(message);

        if (options?.showPopup) {
          showTransmission({
            title: "Morning Briefing",
            message: message,
            type: "briefing",
            skipIntro: true,
            voiceEnabled: false,
            showActions: true,
          });
        }

        return null;
      } finally {
        if (requestId === briefingRequestRef.current) {
          setBriefingLoading(false);
        }
      }
    },
    [settings.muteVoice, showTransmission],
  );

  useEffect(() => {
    positionWindowRightMiddle();
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const handleRefreshBriefing = useCallback(async () => {
    await loadBriefing({
      showPopup: true,
      voiceEnabled: !settings.muteVoice,
    });
  }, [loadBriefing, settings.muteVoice]);

  const pollForUpdates = useCallback(async () => {
    try {
      const updates = await fetchNewLinearUpdates(seenIdsRef.current, true);
      const cached = getCachedBriefing();
      if (cached) {
        setBriefing(cached);
      }
      if (updates.length === 0) return;

      showTransmission({
        title: "New Transmission",
        message: formatNewTasksUpdate(updates),
        type: "update",
      });

      updates.forEach((t) => seenIdsRef.current.add(t.id));
      saveSeenIds(seenIdsRef.current);
    } catch {
      // Polling should stay quiet when Linear is unavailable.
    }
  }, [showTransmission]);

  useEffect(() => {
    if (!pollInitializedRef.current) {
      pollInitializedRef.current = true;
      if (briefing) {
        briefing.rawTasks.forEach((task) => seenIdsRef.current.add(task.identifier));
        saveSeenIds(seenIdsRef.current);
      }
    }

    const interval = setInterval(pollForUpdates, config.linearPollIntervalMs);
    return () => clearInterval(interval);
  }, [pollForUpdates, briefing]);

  const showCharacter =
    !settings.hideCharacter &&
    (transmission.characterVisible ?? true);

  const handleAvatarClick = () => {
    if (isExpanded) {
      dismissTransmission();
      return;
    }

    if (briefingLoading) {
      showTransmission({
        title: "Morning Briefing",
        message: CHECKING_LINEAR_MESSAGE,
        type: "briefing",
        skipIntro: true,
        voiceEnabled: false,
        showActions: true,
      });
      return;
    }

    if (briefingError) {
      showTransmission({
        title: "Morning Briefing",
        message: briefingError,
        type: "briefing",
        skipIntro: true,
        voiceEnabled: false,
        showActions: true,
      });
      return;
    }

    const latestBriefing = getCachedBriefing() ?? briefing;

    if (latestBriefing) {
      showBriefingTransmission(latestBriefing, showTransmission, {
        voiceEnabled: !settings.muteVoice,
        skipIntro: true,
      });
      return;
    }

    showTransmission({
      title: "SUDA",
      message: IDLE_MESSAGE,
      type: "info",
      skipIntro: true,
      voiceEnabled: false,
      showActions: true,
    });
  };

  const handleCompanionClick = () => {
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
                  className={`suda-panel__visual${isTransmitting ? " suda-panel__visual--transmitting" : ""}`}
                  onClick={handleAvatarClick}
                  aria-label="SUDA companion"
                >
                  {config.characterGifUrl ? (
                    <img
                      className="suda-panel__visual-img"
                      src={config.characterGifUrl}
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
                onClick={() => setSettingsOpen((v) => !v)}
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
                onRefreshBriefing={handleRefreshBriefing}
                briefingLoading={briefingLoading}
              />
            )}
          </div>

          <div className="suda-panel__edge suda-panel__edge--bottom" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
