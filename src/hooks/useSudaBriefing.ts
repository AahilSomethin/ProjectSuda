import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectTaskChanges,
  getInitialTaskCache,
  markBaselineFromTasks,
  persistTaskCache,
} from "../lib/taskChanges";
import type { TaskCacheState } from "../lib/taskCache";
import type { TaskChange } from "../lib/taskChanges";
import { devLog } from "../lib/devLog";
import {
  BriefingError,
  evaluateStartupImportance,
  fetchLinearBriefing,
  getCachedBriefing,
} from "../services/briefing";
import { fetchIncompleteLinearTasks } from "../services/linear";
import { SUDA_MESSAGES } from "../lib/transmissions";
import type { LinearBriefingResponse, LinearTask } from "../types";

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
      const result = await fetchLinearBriefing();
      if (requestId !== briefingRequestRef.current) {
        return { briefing: result, error: null };
      }

      setBriefing(result);
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
  }, []);

  const establishBaseline = useCallback((tasks: LinearTask[]) => {
    cacheRef.current = markBaselineFromTasks(cacheRef.current, tasks);
    devLog("[SUDA] task cache baseline established", tasks.length);
  }, []);

  const pollForChanges = useCallback(async (): Promise<TaskChange[]> => {
    try {
      devLog("[SUDA] polling Linear tasks");
      const tasks = await fetchIncompleteLinearTasks(true);
      const cached = getCachedBriefing();
      if (cached) {
        setBriefing(cached);
      }

      const { changes, nextCache } = detectTaskChanges(
        cacheRef.current,
        tasks,
      );
      cacheRef.current = nextCache;
      persistTaskCache(nextCache);

      if (changes.length === 0) {
        devLog("[SUDA] no changes");
        return [];
      }

      if (changes.some((change) => change.kind === "new")) {
        devLog("[SUDA] new task detected");
      } else {
        devLog("[SUDA] task update detected");
      }

      return changes;
    } catch {
      devLog("[SUDA] poll failed");
      return [];
    }
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
    pollForChanges,
    establishBaseline,
    evaluateStartupImportance,
    startupHandledRef,
    getLatestBriefing,
  };
}
