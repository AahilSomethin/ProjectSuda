import { config } from "../config";
import type { ActiveTransmission, TransmissionPhase } from "../types";

interface TransmissionPopupProps {
  transmission: ActiveTransmission;
  disableText: boolean;
  onClose: () => void;
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
}: {
  message: string;
  disableText: boolean;
}) {
  if (disableText) {
    return (
      <p className="suda-popup__message" style={{ fontStyle: "italic" }}>
        [Text hidden]
      </p>
    );
  }

  return <p className="suda-popup__message">{message}</p>;
}

export default function TransmissionPopup({
  transmission,
  disableText,
  onClose,
}: TransmissionPopupProps) {
  const { phase, title, message, type } = transmission;

  if (phase === "idle") return null;

  return (
    <div className="suda-popup" role="dialog" aria-label={title}>
      <div className="suda-popup__header">
        <h2 className="suda-popup__title">{title}</h2>
        <TypeBadge type={type} />
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
          <MessagePhase message={message} disableText={disableText} />
        )}
      </div>
    </div>
  );
}

export type { TransmissionPhase };
