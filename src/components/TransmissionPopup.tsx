import { config } from "../config";
import type { ActiveTransmission, TransmissionPhase } from "../types";

interface TransmissionPopupProps {
  transmission: ActiveTransmission;
  disableText: boolean;
  onClose: () => void;
  onSummarizeTasks?: () => void;
  tasksLoading?: boolean;
}

function TypeBadge({ type }: { type: ActiveTransmission["type"] }) {
  return <span className="suda-popup__badge">{type}</span>;
}

function IntroPhase() {
  return (
    <div className="suda-popup__intro">
      {config.characterGifUrl ? (
        <img
          className="suda-popup__gif"
          src={config.characterGifUrl}
          alt="Incoming transmission"
        />
      ) : (
        <div className="suda-popup__gif-fallback">
          Paste GIF URL in .env
        </div>
      )}
      <span className="suda-popup__loading">Incoming transmission...</span>
    </div>
  );
}

function MessagePhase({
  message,
  disableText,
  isStatus,
}: {
  message: string;
  disableText: boolean;
  isStatus: boolean;
}) {
  if (disableText) {
    return (
      <p className="suda-popup__message" style={{ fontStyle: "italic" }}>
        [Text hidden]
      </p>
    );
  }

  return (
    <p
      className={`suda-popup__message${isStatus ? " suda-popup__message--status" : ""}`}
    >
      {message}
    </p>
  );
}

export default function TransmissionPopup({
  transmission,
  disableText,
  onClose,
  onSummarizeTasks,
  tasksLoading,
}: TransmissionPopupProps) {
  const { phase, title, message, type, skipIntro, showActions } = transmission;

  if (phase === "idle") return null;

  const isStatus = skipIntro ?? false;

  return (
    <div
      className={`suda-popup suda-popup--embedded${isStatus ? " suda-popup--status" : ""}`}
      role="dialog"
      aria-label={title}
    >
      <div className="suda-popup__header">
        <h2 className="suda-popup__title">{title}</h2>
        {!isStatus && <TypeBadge type={type} />}
        <button
          className="suda-popup__close"
          onClick={onClose}
          aria-label="Close transmission"
        >
          ×
        </button>
      </div>
      <div className="suda-popup__body">
        {phase === "intro" ? (
          <IntroPhase />
        ) : (
          <MessagePhase
            message={message}
            disableText={disableText}
            isStatus={isStatus}
          />
        )}
      </div>
      {showActions && onSummarizeTasks && (
        <div className="suda-popup__footer">
          <button
            type="button"
            className="suda-btn"
            disabled={tasksLoading}
            onClick={onSummarizeTasks}
          >
            {tasksLoading ? "Loading..." : "Summarize Tasks"}
          </button>
        </div>
      )}
    </div>
  );
}

export type { TransmissionPhase };
