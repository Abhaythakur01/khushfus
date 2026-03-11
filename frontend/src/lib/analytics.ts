/**
 * Lightweight analytics utility (6.48).
 *
 * In production these functions would forward events to an analytics service
 * (e.g. PostHog, Mixpanel, Google Analytics). For now they log to the console
 * in development mode only, keeping the bundle impact near-zero.
 */

const isDev = process.env.NODE_ENV === "development";

/** Track a page view. Call on every route change. */
export function trackPageView(path: string): void {
  if (isDev) {
    console.debug("[analytics] page_view", path);
  }
  // Production: send to analytics service
  // e.g. posthog.capture('$pageview', { path });
}

/** Track a custom event with category, action, and optional label. */
export function trackEvent(
  category: string,
  action: string,
  label?: string,
): void {
  if (isDev) {
    console.debug("[analytics] event", { category, action, label });
  }
  // Production: send to analytics service
  // e.g. posthog.capture(action, { category, label });
}
