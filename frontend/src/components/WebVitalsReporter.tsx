"use client";

import { useEffect } from "react";
import { initWebVitals } from "@/lib/webVitals";

/**
 * Client component that initializes web-vitals metric collection on mount.
 * Renders nothing visible — purely a side-effect component.
 */
export function WebVitalsReporter() {
  useEffect(() => {
    initWebVitals();
  }, []);

  return null;
}
