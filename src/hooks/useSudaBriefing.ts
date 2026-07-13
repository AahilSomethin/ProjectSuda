import { useCallback, useEffect, useRef, useState } from "react";
import {
  markBaselineFromTasks,
} from "../lib/taskChanges";
import type { TaskCacheState } from "../lib/taskCache";
import { getInitialTaskCache } from "../lib/taskChanges";
import { devLog } from "../lib/devLog";
import {
  BriefingError,
  evaluateStartupImportance,
  fetchLinearPoll,
  getCachedBriefing,
} from "../services/briefing";
import { SUDA_MESSAGES } from "../lib/transmissions";
import type { LinearBriefingResponse } from "../types";

export interface BriefingLoadResult {
  briefing: LinearBriefingResponse | null;
  error: string | null;
}

export function useSudaBriefing() {
  const [briefing, setBriefing] = useState<LinearBriefingResponse | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const cacheRef = useRef<TaskCacheState>(getInitialTaskCache());
  const briefingRequestRef = useRef(0);
  const startupHandledRef = useRef(false);

  const loadBriefing = useCallback(async (): Promise<BriefingLoadResult> => {
    const requestId = ++briefingRequestRef.current;
    setBriefingLoading(true);
    setBriefingError(null);

    try {
      const result = await fetchLinearPoll();
      if (requestId !== briefingRequestRef.current) {
        return { briefing: result.data ?? null, error: null };
      }

      if (result.status === "connected" && result.data) {
        setBriefing(result.data);
        return { briefing: result.data, error: null };
      }

      const message =
        result.error?.message ??
        (result.status === "disabled"
          ? "LINEAR_API_KEY is not set"
          : SUDA_MESSAGES.briefingError);

      if (requestId === briefingRequestRef.current) {
        setBriefingError(message);
      }

      return { briefing: null, error: message };
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
  }, []);

  const establishBaseline = useCallback((tasks: import("../types").LinearTask[]) => {
    cacheRef.current = markBaselineFromTasks(cacheRef.current, tasks);
    devLog("[SUDA] task cache baseline established", tasks.length);
  }, []);

  useEffect(() => {
    void loadBriefing();
  }, [loadBriefing]);

  const getLatestBriefing = useCallback(
    () => getCachedBriefing() ?? briefing,
    [briefing],
  );

  return {
    briefing,
    briefingLoading,
    briefingError,
    loadBriefing,
    establishBaseline,
    evaluateStartupImportance,
    startupHandledRef,
    getLatestBriefing,
  };
}
