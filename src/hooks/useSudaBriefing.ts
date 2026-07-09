import { useCallback, useEffect, useRef, useState } from "react";
import {
  BriefingError,
  fetchLinearBriefing,
  getCachedBriefing,
} from "../services/briefing";
import { fetchNewLinearUpdates } from "../services/linear";
import { SUDA_MESSAGES } from "../lib/transmissions";
import type { LinearBriefingResponse, LinearTask } from "../types";

const SEEN_TASKS_KEY = "suda-seen-task-ids";

export interface BriefingLoadResult {
  briefing: LinearBriefingResponse | null;
  error: string | null;
}

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

export function useSudaBriefing() {
  const [briefing, setBriefing] = useState<LinearBriefingResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const seenIdsRef = useRef<Set<string>>(loadSeenIds());
  const pollInitializedRef = useRef(false);
  const briefingRequestRef = useRef(0);

  const markTasksSeen = useCallback((taskIds: string[]) => {
    for (const id of taskIds) {
      seenIdsRef.current.add(id);
    }
    saveSeenIds(seenIdsRef.current);
  }, []);

  const loadBriefing = useCallback(async (): Promise<BriefingLoadResult> => {
    const requestId = ++briefingRequestRef.current;
    setBriefingLoading(true);
    setBriefingError(null);

    try {
      const result = await fetchLinearBriefing();
      if (requestId !== briefingRequestRef.current) {
        return { briefing: result, error: null };
      }

      setBriefing(result);
      markTasksSeen(result.rawTasks.map((task) => task.identifier));
      return { briefing: result, error: null };
    } catch (error) {
      const message =
        error instanceof BriefingError
          ? error.message
          : SUDA_MESSAGES.briefingError;

      if (requestId === briefingRequestRef.current) {
        setBriefingError(message);
      }

      return { briefing: null, error: message };
    } finally {
      if (requestId === briefingRequestRef.current) {
        setBriefingLoading(false);
      }
    }
  }, [markTasksSeen]);

  const pollForUpdates = useCallback(async (): Promise<LinearTask[]> => {
    try {
      const updates = await fetchNewLinearUpdates(seenIdsRef.current, true);
      const cached = getCachedBriefing();
      if (cached) {
        setBriefing(cached);
      }
      return updates;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  useEffect(() => {
    if (!pollInitializedRef.current) {
      pollInitializedRef.current = true;
      if (briefing) {
        markTasksSeen(briefing.rawTasks.map((task) => task.identifier));
      }
    }
  }, [briefing, markTasksSeen]);

  const getLatestBriefing = useCallback(
    () => getCachedBriefing() ?? briefing,
    [briefing],
  );

  return {
    briefingLoading,
    briefingError,
    loadBriefing,
    pollForUpdates,
    markTasksSeen,
    getLatestBriefing,
  };
}
