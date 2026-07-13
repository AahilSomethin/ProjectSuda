import { getCurrentWindow } from "@tauri-apps/api/window";
import type { IntegrationStatus, IntegrationViewStatus, WidgetSettings } from "../types";
import { formatTimeInMaldives } from "../lib/timezone";

interface SettingsPanelProps {
  settings: WidgetSettings;
  integrationStatuses: IntegrationViewStatus[];
  onRetryLinear: () => void;
  onCheckGitHub: () => void;
  onUpdate: <K extends keyof WidgetSettings>(
    key: K,
    value: WidgetSettings[K],
  ) => void;
  onClose: () => void;
  className?: string;
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

function formatIntegrationStatus(status: IntegrationStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "disabled":
      return "Disabled";
    case "temporarily_unavailable":
      return "Temporarily unavailable";
    case "authentication_failed":
      return "Authentication failed";
  }
}

function formatLastChecked(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return formatTimeInMaldives(new Date(iso));
  } catch {
    return null;
  }
}

function IntegrationSection({
  title,
  status,
  lastChecked,
  actionLabel,
  onAction,
  showAction,
}: {
  title: string;
  status: IntegrationViewStatus;
  lastChecked: string | null;
  actionLabel: string;
  onAction: () => void;
  showAction: boolean;
}) {
  return (
    <div className="suda-settings__integration">
      <div className="suda-settings__integration-header">
        <span className="suda-settings__integration-title">{title}</span>
      </div>
      <p className="suda-settings__integration-status">
        Status: {formatIntegrationStatus(status.status)}
      </p>
      {lastChecked && (
        <p className="suda-settings__integration-meta">
          Last checked: {lastChecked}
        </p>
      )}
      {showAction && (
        <button
          type="button"
          className="suda-btn suda-btn--secondary suda-btn--block"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function SettingsPanel({
  settings,
  integrationStatuses,
  onRetryLinear,
  onCheckGitHub,
  onUpdate,
  onClose,
  className,
}: SettingsPanelProps) {
  async function handleExit() {
    await getCurrentWindow().close();
  }

  const linear =
    integrationStatuses.find((item) => item.name === "linear") ?? {
      name: "linear" as const,
      status: "disabled" as const,
      lastSuccessfulPollAt: null,
    };
  const github =
    integrationStatuses.find((item) => item.name === "github") ?? {
      name: "github" as const,
      status: "disabled" as const,
      lastSuccessfulPollAt: null,
    };

  return (
    <div
      className={`suda-settings suda-settings--fab${className ? ` ${className}` : ""}`}
      role="dialog"
      aria-label="Settings"
    >
      <div className="suda-settings__header">
        <div className="suda-settings__heading">
          <h3 className="suda-settings__title">Settings</h3>
          <p className="suda-settings__subtitle">Companion preferences</p>
        </div>
        <button
          type="button"
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
          label="Browser voice fallback"
          checked={settings.fallbackVoice}
          onChange={(v) => onUpdate("fallbackVoice", v)}
        />
        <Toggle
          label="Hide text"
          checked={settings.disableText}
          onChange={(v) => onUpdate("disableText", v)}
        />
        <Toggle
          label="Hide character"
          checked={settings.hideCharacter}
          onChange={(v) => onUpdate("hideCharacter", v)}
        />

        <div className="suda-settings__section">
          <h4 className="suda-settings__section-title">Integrations</h4>
          <IntegrationSection
            title="Linear"
            status={linear}
            lastChecked={formatLastChecked(linear.lastSuccessfulPollAt)}
            actionLabel="Retry connection"
            onAction={onRetryLinear}
            showAction={
              linear.status === "authentication_failed" ||
              linear.status === "temporarily_unavailable"
            }
          />
          <IntegrationSection
            title="GitHub"
            status={github}
            lastChecked={formatLastChecked(github.lastSuccessfulPollAt)}
            actionLabel="Check now"
            onAction={onCheckGitHub}
            showAction={github.status !== "disabled"}
          />
        </div>
      </div>

      <div className="suda-settings__footer">
        <button
          type="button"
          className="suda-btn suda-btn--danger suda-btn--block"
          onClick={handleExit}
        >
          Exit widget
        </button>
      </div>
    </div>
  );
}
