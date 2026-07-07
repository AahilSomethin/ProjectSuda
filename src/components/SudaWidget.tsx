import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow, currentMonitor, PhysicalPosition } from "@tauri-apps/api/window";
import { config } from "../config";
import { useSettings } from "../hooks/useSettings";
import { useTransmission } from "../hooks/useTransmission";
import {
  summarizeMeeting,
  summarizeTasks,
} from "../services/aiSummary";
import { fetchUpcomingMeetings } from "../services/googleCalendar";
import {
  fetchIncompleteLinearTasks,
  fetchNewLinearUpdates,
} from "../services/linear";
import SettingsPanel from "./SettingsPanel";
import TransmissionPopup from "./TransmissionPopup";
import "./widget.css";

const SEEN_TASKS_KEY = "suda-seen-task-ids";

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
    setIsExpanded,
    showTransmission,
    dismissTransmission,
  } = useTransmission(settings);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const pollInitializedRef = useRef(false);

  useEffect(() => {
    positionWindowRightMiddle();
  }, []);

  const handleSummarizeTasks = useCallback(async () => {
    setLoading("tasks");
    try {
      const tasks = await fetchIncompleteLinearTasks();
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

  const handleCheckMeetings = useCallback(async () => {
    setLoading("meetings");
    try {
      const meetings = await fetchUpcomingMeetings();
      if (meetings.length === 0) {
        showTransmission({
          title: "No Meetings",
          message: "No upcoming meetings on your calendar.",
          type: "meeting",
        });
        return;
      }

      const next = meetings[0];
      const summary = await summarizeMeeting(next, settings.personality);
      showTransmission({
        title: next.title,
        message: summary,
        type: "meeting",
      });
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
    } else {
      setIsExpanded(true);
    }
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
        {isExpanded && transmission.phase !== "idle" && (
          <TransmissionPopup
            transmission={transmission}
            disableText={settings.disableText}
            onClose={dismissTransmission}
          />
        )}

        {isExpanded && transmission.phase === "idle" && (
          <div className="suda-widget__actions">
            <div className="suda-widget__action-row">
              <button
                type="button"
                className="suda-btn"
                disabled={loading === "tasks"}
                onClick={handleSummarizeTasks}
              >
                {loading === "tasks" ? "Loading..." : "Summarize Tasks"}
              </button>
              <button
                type="button"
                className="suda-btn"
                disabled={loading === "meetings"}
                onClick={handleCheckMeetings}
              >
                {loading === "meetings" ? "Loading..." : "Check Meetings"}
              </button>
            </div>
          </div>
        )}

        <div style={{ position: "relative" }}>
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onUpdate={updateSetting}
              onClose={() => setSettingsOpen(false)}
            />
          )}

          {showCharacter ? (
            <button
              type="button"
              className={`suda-avatar${isExpanded ? " suda-avatar--active" : ""}`}
              onClick={handleAvatarClick}
              aria-label="SUDA companion"
            >
              {config.characterGifUrl ? (
                <img
                  className="suda-avatar__img"
                  src={config.characterGifUrl}
                  alt="SUDA"
                />
              ) : (
                <span className="suda-avatar__fallback">S</span>
              )}
              <span className="suda-avatar__pulse" />
            </button>
          ) : (
            <button
              type="button"
              className="suda-btn suda-btn--icon"
              onClick={handleCompanionClick}
              aria-label="Open SUDA panel"
            >
              ◈
            </button>
          )}

          <button
            type="button"
            className="suda-btn suda-btn--icon"
            style={
              showCharacter
                ? {
                    position: "absolute",
                    bottom: "-0.25rem",
                    left: "-0.25rem",
                  }
                : undefined
            }
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </div>
    </div>
  );
}
