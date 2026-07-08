import { useEffect, useMemo, useState } from "react";
import { config } from "../config";
import { useChunkVoice } from "../hooks/useChunkVoice";
import { useTypewriterText } from "../hooks/useTypewriterText";
import type { ActiveTransmission, TransmissionPhase } from "../types";

const LINES_PER_PAGE = 5;
const AUTO_ADVANCE_DELAY_MS = 800;

function chunkMessage(message: string): string[] {
  const lines = message.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  if (lines.length === 0) return [""];

  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    chunks.push(lines.slice(i, i + LINES_PER_PAGE).join("\n"));
  }
  return chunks;
}

interface TransmissionPopupProps {
  transmission: ActiveTransmission;
  disableText: boolean;
  muteVoice: boolean;
  onSummarizeTasks?: () => void;
  tasksLoading?: boolean;
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
  voiceEnabled,
  muteVoice,
}: {
  message: string;
  disableText: boolean;
  isStatus: boolean;
  voiceEnabled: boolean;
  muteVoice: boolean;
}) {
  const chunks = useMemo(() => chunkMessage(message), [message]);
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = chunks.length;

  useEffect(() => {
    setCurrentPage(0);
  }, [message]);

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const visibleChunk = chunks[currentPage] ?? chunks[0];
  const voiceActive = voiceEnabled && !muteVoice;

  const { displayedText, isTyping, isComplete } = useTypewriterText(
    visibleChunk,
    !disableText,
    { voiceActive },
  );

  const { voiceDone } = useChunkVoice(visibleChunk, voiceActive);

  const typewriterComplete = disableText || isComplete;
  const voiceDisabledOrMuted = !voiceActive;
  const canAdvance =
    totalPages > 1 &&
    currentPage < totalPages - 1 &&
    typewriterComplete &&
    (voiceDisabledOrMuted || voiceDone);

  useEffect(() => {
    if (!canAdvance) return;

    const timeoutId = window.setTimeout(() => {
      setCurrentPage((p) => p + 1);
    }, AUTO_ADVANCE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [canAdvance, currentPage, message]);

  if (disableText) {
    return (
      <p className="suda-popup__message" style={{ fontStyle: "italic" }}>
        [Text hidden]
      </p>
    );
  }

  return (
    <p
      className={`suda-popup__message${isStatus ? " suda-popup__message--status" : ""}${isTyping ? " suda-popup__message--typing" : ""}`}
      aria-live="polite"
    >
      {displayedText}
    </p>
  );
}

export default function TransmissionPopup({
  transmission,
  disableText,
  muteVoice,
  onSummarizeTasks,
  tasksLoading,
}: TransmissionPopupProps) {
  const { phase, message, skipIntro, showActions, voiceEnabled } = transmission;

  if (phase === "idle") return null;

  const isStatus = skipIntro ?? false;

  return (
    <div
      className={`suda-popup suda-popup--embedded${isStatus ? " suda-popup--status" : ""}`}
      role="region"
      aria-label="SUDA transmission"
    >
      <div className="suda-popup__body">
        {phase === "intro" ? (
          <IntroPhase />
        ) : (
          <MessagePhase
            message={message}
            disableText={disableText}
            isStatus={isStatus}
            voiceEnabled={voiceEnabled ?? false}
            muteVoice={muteVoice}
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
