import { getCurrentWindow } from "@tauri-apps/api/window";
import { PERSONALITY_MODES } from "../types";
import type { WidgetSettings } from "../types";

interface SettingsPanelProps {
  settings: WidgetSettings;
  onUpdate: <K extends keyof WidgetSettings>(
    key: K,
    value: WidgetSettings[K],
  ) => void;
  onClose: () => void;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <div className="suda-settings__row">
      <span className="suda-settings__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`suda-toggle${checked ? " suda-toggle--on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="suda-toggle__knob" />
      </button>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  async function handleExit() {
    await getCurrentWindow().close();
  }

  return (
    <div className="suda-settings" role="dialog" aria-label="Settings">
      <div className="suda-settings__header">
        <h3 className="suda-settings__title">Settings</h3>
        <button
          className="suda-popup__close"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </div>

      <div className="suda-settings__body">
        <Toggle
          label="Mute voice"
          checked={settings.muteVoice}
          onChange={(v) => onUpdate("muteVoice", v)}
        />
        <Toggle
          label="Disable text"
          checked={settings.disableText}
          onChange={(v) => onUpdate("disableText", v)}
        />
        <Toggle
          label="Hide character"
          checked={settings.hideCharacter}
          onChange={(v) => onUpdate("hideCharacter", v)}
        />

        <div className="suda-settings__row">
          <span className="suda-settings__label">Personality</span>
          <select
            className="suda-settings__select"
            value={settings.personality}
            onChange={(e) =>
              onUpdate(
                "personality",
                e.target.value as WidgetSettings["personality"],
              )
            }
          >
            {PERSONALITY_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="suda-settings__footer">
        <button
          type="button"
          className="suda-btn suda-btn--danger"
          style={{ width: "100%" }}
          onClick={handleExit}
        >
          Exit widget
        </button>
      </div>
    </div>
  );
}
