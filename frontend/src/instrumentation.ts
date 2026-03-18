/**
 * Next.js instrumentation hook.
 * Called once when the server starts. Used to initialize Sentry on the server side.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = async (
  err: { digest?: string } & Error,
  request: {
    path: string;
    method: string;
    headers: { [key: string]: string };
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource: string;
    revalidateReason: string | undefined;
    renderType: string;
  },
) => {
  // Dynamic import to avoid bundling Sentry when DSN isn't configured
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureRequestError(err, request, context);
  } catch {
    // Sentry not available — fall back to console
    console.error("[KhushFus] Request error:", err.message, request.path);
  }
};
