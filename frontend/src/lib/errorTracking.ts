/**
 * Error tracking utility for KhushFus.
 *
 * In production, errors are reported to Sentry. In development, they are
 * logged to the console with structured context.
 */

import * as Sentry from "@sentry/nextjs";

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

    // Set user context for Sentry
    if (context?.userEmail) {
      Sentry.setUser({ email: context.userEmail });
    }

    // Report to Sentry in production
    Sentry.captureException(err, {
      extra: {
        page: context?.page,
        component: context?.component,
        ...context?.metadata,
      },
      tags: {
        component: context?.component,
        page: context?.page,
      },
    });

    // Always log locally for dev visibility
    if (process.env.NODE_ENV !== "production") {
      const structured: StructuredError = {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        context,
      };
      console.error("[KhushFus Error]", structured);
    }
  } catch {
    // reportError must never throw
    console.error("[KhushFus Error] Failed to report error:", error);
  }
}

/**
 * Set the current user context for all future error reports.
 */
export function setErrorUser(email: string | null): void {
  if (email) {
    Sentry.setUser({ email });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Add a breadcrumb for debugging error context.
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  Sentry.addBreadcrumb({
    message,
    data,
    level: "info",
  });
}
