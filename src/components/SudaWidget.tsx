import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow, currentMonitor, PhysicalPosition } from "@tauri-apps/api/window";
import { config } from "../config";
import { useSettings } from "../hooks/useSettings";
import { useTransmission } from "../hooks/useTransmission";
import { summarizeTasks } from "../services/aiSummary";
import {
  fetchIncompleteLinearTasks,
  fetchNewLinearUpdates,
} from "../services/linear";
import SettingsPanel from "./SettingsPanel";
import TransmissionPopup from "./TransmissionPopup";
import "./widget.css";

const SEEN_TASKS_KEY = "suda-seen-task-ids";

const IDLE_MESSAGE = "SUDA online. No active transmission.";
const EMPTY_TASKS_MESSAGE = "All clear. No incomplete Linear tasks found.";

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

export default function SudaWidget() {
  const { settings, updateSetting } = useSettings();
  const {
    transmission,
    isExpanded,
    showTransmission,
    dismissTransmission,
  } = useTransmission(settings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const pollInitializedRef = useRef(false);

  const isTransmitting =
    transmission.phase === "intro" ||
    (transmission.phase === "message" && !transmission.skipIntro);

  useEffect(() => {
    positionWindowRightMiddle();
  }, []);

  const handleSummarizeTasks = useCallback(async () => {
    setLoading("tasks");
    try {
      const tasks = await fetchIncompleteLinearTasks();

      if (tasks.length === 0) {
        showTransmission({
          title: "Tasks",
          message: EMPTY_TASKS_MESSAGE,
          type: "task",
          skipIntro: true,
          voiceEnabled: false,
        });
        return;
      }

      const summary = await summarizeTasks(tasks, settings.personality);
      showTransmission({
        title: "Task Summary",
        message: summary,
        type: "task",
      });
      tasks.forEach((t) => seenIdsRef.current.add(t.id));
      saveSeenIds(seenIdsRef.current);
    } finally {
      setLoading(null);
    }
  }, [settings.personality, showTransmission]);

  const pollForUpdates = useCallback(async () => {
    const updates = await fetchNewLinearUpdates(seenIdsRef.current);
    if (updates.length === 0) return;

    const summary = await summarizeTasks(updates, settings.personality);
    showTransmission({
      title: "New Transmission",
      message: summary,
      type: "update",
    });

    updates.forEach((t) => seenIdsRef.current.add(t.id));
    saveSeenIds(seenIdsRef.current);
  }, [settings.personality, showTransmission]);

  useEffect(() => {
    if (!pollInitializedRef.current) {
      pollInitializedRef.current = true;
      fetchIncompleteLinearTasks().then((tasks) => {
        tasks.forEach((t) => seenIdsRef.current.add(t.id));
        saveSeenIds(seenIdsRef.current);
      });
    }

    const interval = setInterval(pollForUpdates, config.linearPollIntervalMs);
    return () => clearInterval(interval);
  }, [pollForUpdates]);

  const showCharacter =
    !settings.hideCharacter &&
    (transmission.characterVisible ?? true);

  const handleAvatarClick = () => {
    if (isExpanded) {
      dismissTransmission();
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
                onSummarizeTasks={handleSummarizeTasks}
                tasksLoading={loading === "tasks"}
              />
            )}
          </div>

          <div className="suda-panel__edge suda-panel__edge--bottom" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
