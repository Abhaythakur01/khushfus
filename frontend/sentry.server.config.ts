import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.2,
  release: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
  environment: process.env.NODE_ENV,
});
