import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from "react";

import { config } from "../config";

import { useChunkVoice } from "../hooks/useChunkVoice";

import { useTypewriterText } from "../hooks/useTypewriterText";

import type { ActiveTransmission, TransmissionPhase } from "../types";
import type { TransmissionActivity } from "../lib/sudaState";

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
  fallbackVoice: boolean;
  onTransmissionActivityChange?: (activity: TransmissionActivity) => void;
  autoHideMs?: number;
  onAutoHide?: () => void;
  isBusy?: boolean;
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
        <div className="suda-popup__gif-fallback">Paste GIF URL in .env</div>
      )}
      <span className="suda-popup__loading">Incoming transmission...</span>
    </div>
  );
}

function MessagePhase({
  message,
  voiceMessage,
  disableText,
  isStatus,
  voiceEnabled,
  muteVoice,
  fallbackVoice,
  onTransmissionActivityChange,
  onMessageCompleteChange,
}: {
  message: string;
  voiceMessage?: string;
  disableText: boolean;
  isStatus: boolean;
  voiceEnabled: boolean;
  muteVoice: boolean;
  fallbackVoice: boolean;
  onTransmissionActivityChange?: (activity: TransmissionActivity) => void;
  onMessageCompleteChange?: (complete: boolean) => void;
}) {
  const displayChunks = useMemo(() => chunkMessage(message), [message]);
  const voiceChunks = useMemo(
    () => chunkMessage(voiceMessage ?? message),
    [voiceMessage, message],
  );
  const [currentPage, setCurrentPage] = useState(0);
  const totalPages = displayChunks.length;

  useEffect(() => {
    setCurrentPage(0);
  }, [message, voiceMessage]);

  useEffect(() => {
    if (currentPage > totalPages - 1) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [currentPage, totalPages]);

  const visibleChunk = displayChunks[currentPage] ?? displayChunks[0];
  const voiceActive = voiceEnabled && !muteVoice;
  const voiceChunkForPage =
    voiceMessage && currentPage > 0
      ? ""
      : (voiceChunks[currentPage] ?? voiceChunks[0] ?? "");
  const shouldPlayVoice = voiceActive && voiceChunkForPage.trim().length > 0;

  const { displayedText, isTyping, isComplete } = useTypewriterText(
    visibleChunk,
    !disableText,
    { voiceActive: shouldPlayVoice },
  );

  const { isSpeaking, voiceDone } = useChunkVoice(
    voiceChunkForPage,
    shouldPlayVoice,
    fallbackVoice,
    {
      dedupKey: voiceChunkForPage
        ? `${voiceChunkForPage}:${currentPage}`
        : undefined,
      kind: voiceEnabled ? "meaningful-activity" : "status",
      voiceEnabled,
    },
  );

  useEffect(() => {
    onTransmissionActivityChange?.({ isTyping, isSpeaking });
  }, [isTyping, isSpeaking, onTransmissionActivityChange]);

  const typewriterComplete = disableText || isComplete;
  const voiceDisabledOrMuted = !shouldPlayVoice;
  const pageComplete =
    typewriterComplete && (voiceDisabledOrMuted || voiceDone);
  const allPagesComplete = pageComplete && currentPage >= totalPages - 1;

  useEffect(() => {
    onMessageCompleteChange?.(allPagesComplete);
  }, [allPagesComplete, onMessageCompleteChange]);

  const canAdvance =
    totalPages > 1 &&
    currentPage < totalPages - 1 &&
    pageComplete &&
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
  fallbackVoice,
  onTransmissionActivityChange,
  autoHideMs,
  onAutoHide,
  isBusy = false,
}: TransmissionPopupProps) {
  const { phase, message, voiceMessage, skipIntro, voiceEnabled } =
    transmission;

  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [messageComplete, setMessageComplete] = useState(false);
  const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoHideTimer = useCallback(() => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  }, []);

  const handleMessageCompleteChange = useCallback((complete: boolean) => {
    setMessageComplete(complete);
  }, []);

  useEffect(() => {
    setMessageComplete(false);
    clearAutoHideTimer();
  }, [message, phase, clearAutoHideTimer]);

  useEffect(() => {
    if (phase !== "intro") return;
    onTransmissionActivityChange?.({ isTyping: false, isSpeaking: false });
  }, [phase, onTransmissionActivityChange]);

  const isFinished = phase === "message" && messageComplete;
  const shouldPauseAutoHide =
    isBusy || isHovered || isFocused || phase === "intro";

  useEffect(() => {
    clearAutoHideTimer();

    if (!autoHideMs || !onAutoHide || !isFinished || shouldPauseAutoHide) {
      return;
    }

    autoHideTimerRef.current = setTimeout(() => {
      onAutoHide();
    }, autoHideMs);

    return clearAutoHideTimer;
  }, [
    autoHideMs,
    onAutoHide,
    isFinished,
    shouldPauseAutoHide,
    clearAutoHideTimer,
  ]);

  useEffect(() => clearAutoHideTimer, [clearAutoHideTimer]);

  const handleBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        event.currentTarget.contains(nextTarget)
      ) {
        return;
      }
    setIsFocused(false);
  }, []);

  if (phase === "idle") return null;

  const isStatus = skipIntro ?? false;

  return (
    <div
      className={`suda-popup suda-popup--embedded${isStatus ? " suda-popup--status" : ""}`}
      role="region"
      aria-label="SUDA transmission"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={handleBlurCapture}
    >
      <div className="suda-popup__body">
        {phase === "intro" ? (
          <IntroPhase />
        ) : (
          <MessagePhase
            message={message}
            voiceMessage={voiceMessage}
            disableText={disableText}
            isStatus={isStatus}
            voiceEnabled={voiceEnabled ?? false}
            muteVoice={muteVoice}
            fallbackVoice={fallbackVoice}
            onTransmissionActivityChange={onTransmissionActivityChange}
            onMessageCompleteChange={handleMessageCompleteChange}
          />
        )}
      </div>
    </div>
  );
}

export type { TransmissionPhase };
