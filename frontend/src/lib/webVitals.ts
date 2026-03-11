/**
 * Web Vitals monitoring utility.
 *
 * Next.js automatically calls `reportWebVitals` when exported from _app or
 * layout, but since we use the App Router we wire this up via the
 * `useReportWebVitals` hook from `next/web-vitals` (or manually via the
 * `web-vitals` library).
 *
 * The metrics captured:
 *   CLS  — Cumulative Layout Shift
 *   FID  — First Input Delay
 *   INP  — Interaction to Next Paint (replaces FID in newer specs)
 *   LCP  — Largest Contentful Paint
 *   FCP  — First Contentful Paint
 *   TTFB — Time to First Byte
 */

export interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  delta: number;
  navigationType: string;
}

type MetricHandler = (metric: WebVitalMetric) => void;

const handlers: MetricHandler[] = [];

/**
 * Register a handler that receives every web-vital metric as it's reported.
 */
export function onWebVital(handler: MetricHandler) {
  handlers.push(handler);
}

/**
 * Default handler that logs metrics to the console in a structured format.
 * In production this could POST to an analytics endpoint instead.
 */
function defaultHandler(metric: WebVitalMetric) {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // In production, send to analytics endpoint if configured
    const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;
    if (endpoint) {
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
        id: metric.id,
        page: typeof window !== "undefined" ? window.location.pathname : "",
        timestamp: new Date().toISOString(),
      });
      // Use sendBeacon for reliability during page unload
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(endpoint, body);
      } else {
        fetch(endpoint, { method: "POST", body, keepalive: true }).catch(() => {});
      }
    }
  } else {
    // In development, log to console with color coding
    const color =
      metric.rating === "good"
        ? "color: #10b981"
        : metric.rating === "needs-improvement"
          ? "color: #f59e0b"
          : "color: #ef4444";

    console.log(
      `%c[Web Vital] ${metric.name}: ${metric.value.toFixed(2)} (${metric.rating})`,
      color,
    );
  }
}

/**
 * Called by Next.js or manually to report a web vital metric.
 */
export function reportWebVitals(metric: WebVitalMetric) {
  defaultHandler(metric);
  for (const handler of handlers) {
    try {
      handler(metric);
    } catch {
      // Swallow errors in user handlers to avoid breaking metrics collection
    }
  }
}

/**
 * Initialize web-vitals collection using the `web-vitals` library.
 * Call this once from a client component (e.g., WebVitalsReporter).
 */
export async function initWebVitals() {
  try {
    // Dynamically import web-vitals — it's an optional peer dep.
    // Next.js bundles a compatible version.
    const wv = await import("web-vitals");
    wv.onCLS(reportWebVitals as any);
    wv.onLCP(reportWebVitals as any);
    wv.onFCP(reportWebVitals as any);
    wv.onTTFB(reportWebVitals as any);
    if (wv.onINP) wv.onINP(reportWebVitals as any);
    // onFID removed in web-vitals v4 (replaced by INP)
    if ((wv as any).onFID) (wv as any).onFID(reportWebVitals as any);
  } catch {
    // web-vitals not available — silently skip
  }
}
