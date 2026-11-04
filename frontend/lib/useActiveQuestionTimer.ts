"use client";

import { useCallback, useEffect, useRef } from "react";

/** Measures answer time without counting time while the page is hidden or the device is locked. */
export function useActiveQuestionTimer() {
  const elapsedRef = useRef(0);
  const activeSinceRef = useRef<number | null>(null);

  const start = useCallback(() => {
    elapsedRef.current = 0;
    activeSinceRef.current = document.visibilityState === "visible" ? performance.now() : null;
  }, []);

  const elapsedMs = useCallback(() => {
    const activeTime = activeSinceRef.current === null ? 0 : performance.now() - activeSinceRef.current;
    return Math.max(0, Math.round(elapsedRef.current + activeTime));
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        if (activeSinceRef.current !== null) {
          elapsedRef.current += performance.now() - activeSinceRef.current;
          activeSinceRef.current = null;
        }
        return;
      }
      if (activeSinceRef.current === null) activeSinceRef.current = performance.now();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return { start, elapsedMs };
}
