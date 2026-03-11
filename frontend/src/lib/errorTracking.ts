/**
 * Error tracking utility for KhushFus.
 *
 * Currently logs structured error data to the console.
 * TODO: Replace with Sentry integration for production error tracking.
 *       Install @sentry/nextjs, call Sentry.init() in instrumentation.ts,
 *       and replace the console.error call below with Sentry.captureException().
 */

export interface ErrorContext {
  /** The page/route where the error occurred */
  page?: string;
  /** The component name that threw */
  component?: string;
  /** Authenticated user email (never send passwords) */
  userEmail?: string;
  /** Arbitrary key-value metadata */
  metadata?: Record<string, unknown>;
}

interface StructuredError {
  message: string;
  stack?: string;
  timestamp: string;
  context?: ErrorContext;
}

/**
 * Report an error with optional context.
 * Safe to call from anywhere — never throws.
 */
export function reportError(error: unknown, context?: ErrorContext): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));

    const structured: StructuredError = {
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
      context,
    };

    // TODO: Replace with Sentry.captureException(err, { extra: context })
    console.error("[KhushFus Error]", structured);
  } catch {
    // reportError must never throw
    console.error("[KhushFus Error] Failed to report error:", error);
  }
}
