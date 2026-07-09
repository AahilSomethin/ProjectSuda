import { useCallback, useEffect, useRef, useState } from "react";
import { cancelSpeech } from "../services/voice";
import { setWindowMode } from "../lib/windowMode";

export type PanelRevealPhase = "closed" | "opening" | "open" | "closing";

const OPEN_EDGE_EXPAND_MS = 120;
const OPEN_CONTENT_REVEAL_MS = 180;
const CLOSE_CONTENT_HIDE_MS = 120;
const CLOSE_EDGE_CONTRACT_MS = 120;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface UsePanelRevealOptions {
  shouldShowPanel: boolean;
  onCloseComplete: () => void;
}

export function usePanelReveal({
  shouldShowPanel,
  onCloseComplete,
}: UsePanelRevealOptions) {
  const [panelReveal, setPanelReveal] = useState<PanelRevealPhase>("closed");
  const [panelMounted, setPanelMounted] = useState(false);
  const [edgeExpanded, setEdgeExpanded] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onCloseCompleteRef = useRef(onCloseComplete);
  const closeGenerationRef = useRef(0);

  useEffect(() => {
    onCloseCompleteRef.current = onCloseComplete;
  }, [onCloseComplete]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const finishOpen = useCallback(() => {
    setPanelReveal("open");
    setContentVisible(true);
    setEdgeExpanded(true);
  }, []);

  const finishClose = useCallback((generation: number) => {
    if (generation !== closeGenerationRef.current) {
      return;
    }
    onCloseCompleteRef.current();
    setPanelMounted(false);
    setPanelReveal("closed");
    setEdgeExpanded(false);
    setContentVisible(false);
    void setWindowMode("compact");
  }, []);

  const startOpen = useCallback(() => {
    clearTimers();
    closeGenerationRef.current += 1;
    setPanelMounted(true);
    setPanelReveal("opening");
    setEdgeExpanded(false);
    setContentVisible(false);
    void setWindowMode("expanded");

    if (prefersReducedMotion()) {
      finishOpen();
      return;
    }

    schedule(() => setEdgeExpanded(true), OPEN_EDGE_EXPAND_MS);
    schedule(
      () => setContentVisible(true),
      OPEN_EDGE_EXPAND_MS + OPEN_CONTENT_REVEAL_MS,
    );
    schedule(
      () => finishOpen(),
      OPEN_EDGE_EXPAND_MS + OPEN_CONTENT_REVEAL_MS + 50,
    );
  }, [clearTimers, finishOpen, schedule]);

  const dismissPanel = useCallback(() => {
    if (!panelMounted || panelReveal === "closing") return;

    clearTimers();
    const generation = ++closeGenerationRef.current;
    cancelSpeech();
    setPanelReveal("closing");
    setContentVisible(false);

    if (prefersReducedMotion()) {
      finishClose(generation);
      return;
    }

    schedule(() => setEdgeExpanded(false), CLOSE_CONTENT_HIDE_MS);
    schedule(
      () => finishClose(generation),
      CLOSE_CONTENT_HIDE_MS + CLOSE_EDGE_CONTRACT_MS,
    );
  }, [clearTimers, finishClose, panelMounted, panelReveal, schedule]);

  useEffect(() => {
    if (!shouldShowPanel) return;

    if (panelReveal === "closing") {
      startOpen();
      return;
    }

    if (!panelMounted) {
      startOpen();
    }
  }, [shouldShowPanel, panelMounted, panelReveal, startOpen]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    panelReveal,
    panelMounted,
    edgeExpanded,
    contentVisible,
    dismissPanel,
  };
}
