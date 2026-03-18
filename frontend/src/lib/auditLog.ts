/**
 * Client-side audit logging for compliance (GDPR, SOC2).
 *
 * Tracks user actions and sends them to the backend audit service.
 * All events include: who, what, when, and context. Sensitive data
 * (passwords, tokens) is never included — only action metadata.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.register"
  | "auth.password_reset_request"
  | "auth.password_reset_complete"
  | "project.create"
  | "project.update"
  | "project.delete"
  | "project.archive"
  | "report.generate"
  | "report.download"
  | "alert.create"
  | "alert.delete"
  | "apikey.create"
  | "apikey.revoke"
  | "member.invite"
  | "member.remove"
  | "settings.update"
  | "export.request"
  | "post.create"
  | "post.delete";

interface AuditEvent {
  action: AuditAction;
  resource_type?: string;
  resource_id?: string | number;
  metadata?: Record<string, unknown>;
}

interface QueuedEvent extends AuditEvent {
  timestamp: string;
  page: string;
}

// ---------------------------------------------------------------------------
// Batched queue — flush every 5s or when 10 events accumulate
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 10;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("khushfus_token") || sessionStorage.getItem("khushfus_token");
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;

  const batch = [...queue];
  queue = [];

  const token = getToken();
  if (!token) return; // Not authenticated — skip

  try {
    await fetch(`${API_BASE}/api/v1/audit/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ events: batch }),
      // Fire-and-forget: don't block the UI on audit logging
      keepalive: true,
    });
  } catch {
    // Audit logging should never break the app.
    // Re-queue failed events (with a cap to prevent memory leaks).
    if (queue.length < 100) {
      queue.unshift(...batch);
    }
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

// Flush on page unload
if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flush();
    }
  });
  window.addEventListener("beforeunload", () => flush());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Log an auditable user action. Non-blocking, batched.
 *
 * @example
 * audit({ action: "project.create", resource_type: "project", resource_id: 42 });
 */
export function audit(event: AuditEvent): void {
  const queued: QueuedEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    page: typeof window !== "undefined" ? window.location.pathname : "",
  };

  queue.push(queued);

  if (queue.length >= FLUSH_THRESHOLD) {
    flush();
  } else {
    scheduleFlush();
  }
}

/**
 * Force-flush all queued audit events (e.g., before logout).
 */
export async function flushAuditLog(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}
