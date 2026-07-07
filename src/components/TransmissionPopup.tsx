import { useEffect, useMemo, useState } from "react";
import { config } from "../config";
import type { ActiveTransmission, TransmissionPhase } from "../types";

const LINES_PER_PAGE = 5;

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
}: {
  message: string;
  disableText: boolean;
  isStatus: boolean;
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

  if (disableText) {
    return (
      <p className="suda-popup__message" style={{ fontStyle: "italic" }}>
        [Text hidden]
      </p>
    );
  }

  const visibleChunk = chunks[currentPage] ?? chunks[0];

  return (
    <>
      <p
        className={`suda-popup__message${isStatus ? " suda-popup__message--status" : ""}`}
        aria-live="polite"
      >
        {visibleChunk}
      </p>
      {totalPages > 1 && (
        <div className="suda-popup__pager">
          <button
            type="button"
            className="suda-popup__pager-btn"
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => p - 1)}
            aria-label="Previous transmission"
          >
            ‹
          </button>
          <span className="suda-popup__pager-indicator">
            {currentPage + 1}/{totalPages}
          </span>
          <button
            type="button"
            className="suda-popup__pager-btn"
            disabled={currentPage === totalPages - 1}
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label="Next transmission"
          >
            ›
          </button>
        </div>
      )}
    </>
  );
}

export default function TransmissionPopup({
  transmission,
  disableText,
  onSummarizeTasks,
  tasksLoading,
}: TransmissionPopupProps) {
  const { phase, message, skipIntro, showActions } = transmission;

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
