/**
 * Structured logger for the frontend.
 *
 * In development, messages go to the browser console with timestamps and
 * context.  In production the same structured payloads could be shipped to an
 * external logging service (Datadog, Sentry, etc.) by swapping out the
 * transport.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  timestamp: string;
}

type LogTransport = (entry: LogEntry) => void;

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

const consoleTransport: LogTransport = (entry) => {
  const prefix = `[${entry.timestamp}]${entry.context ? ` [${entry.context}]` : ""}`;
  switch (entry.level) {
    case "debug":
      console.debug(prefix, entry.message, entry.data ?? "");
      break;
    case "info":
      console.info(prefix, entry.message, entry.data ?? "");
      break;
    case "warn":
      console.warn(prefix, entry.message, entry.data ?? "");
      break;
    case "error":
      console.error(prefix, entry.message, entry.data ?? "");
      break;
  }
};

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private transport: LogTransport;
  private minLevel: LogLevel;
  private context?: string;

  constructor(opts?: { transport?: LogTransport; minLevel?: LogLevel; context?: string }) {
    this.transport = opts?.transport ?? consoleTransport;
    this.minLevel =
      opts?.minLevel ?? (process.env.NODE_ENV === "production" ? "warn" : "debug");
    this.context = opts?.context;
  }

  /**
   * Create a child logger with a fixed context label.
   */
  child(context: string): Logger {
    return new Logger({
      transport: this.transport,
      minLevel: this.minLevel,
      context,
    });
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      data,
      timestamp: new Date().toISOString(),
    };

    this.transport(entry);
  }

  debug(message: string, data?: unknown) {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown) {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown) {
    this.log("warn", message, data);
  }

  error(message: string, data?: unknown) {
    this.log("error", message, data);
  }
}

/** Global logger instance. Use `logger.child("MyComponent")` for scoped logging. */
export const logger = new Logger();
