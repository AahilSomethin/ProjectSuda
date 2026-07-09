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

  onRefreshBriefing?: () => void;

  briefingLoading?: boolean;

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

  voiceMessage,

  disableText,

  isStatus,

  voiceEnabled,

  muteVoice,

}: {

  message: string;

  voiceMessage?: string;

  disableText: boolean;

  isStatus: boolean;

  voiceEnabled: boolean;

  muteVoice: boolean;

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



  const { voiceDone } = useChunkVoice(voiceChunkForPage, shouldPlayVoice);



  const typewriterComplete = disableText || isComplete;

  const voiceDisabledOrMuted = !shouldPlayVoice;

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

  onRefreshBriefing,

  briefingLoading,

}: TransmissionPopupProps) {

  const { phase, message, voiceMessage, skipIntro, showActions, voiceEnabled } =

    transmission;



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

            voiceMessage={voiceMessage}

            disableText={disableText}

            isStatus={isStatus}

            voiceEnabled={voiceEnabled ?? false}

            muteVoice={muteVoice}

          />

        )}

      </div>

      {showActions && onRefreshBriefing && (

        <div className="suda-popup__footer">

          <button

            type="button"

            className="suda-btn"

            disabled={briefingLoading}

            onClick={onRefreshBriefing}

          >

            {briefingLoading ? "Checking Linear…" : "Refresh Briefing"}

          </button>

        </div>

      )}

    </div>

  );

}



export type { TransmissionPhase };


