import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Only enable in production (no noise during local dev)
  enabled: process.env.NODE_ENV === "production",

  // Performance: sample 20% of transactions in prod
  tracesSampleRate: 0.2,

  // Session Replay: capture 10% of sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Filter noisy errors
  ignoreErrors: [
    // Browser extensions
    "ResizeObserver loop",
    // Network blips users recover from
    "Failed to fetch",
    "Load failed",
    "NetworkError",
    // User navigating away
    "AbortError",
    // Non-actionable
    "ChunkLoadError",
  ],

  beforeSend(event) {
    // Strip PII from URLs (e.g., tokens in query strings)
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url);
        url.searchParams.delete("token");
        url.searchParams.delete("code");
        event.request.url = url.toString();
      } catch {
        // ignore malformed URLs
      }
    }
    return event;
  },

  // Tag every event with the app version for release tracking
  release: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
  environment: process.env.NODE_ENV,
});
