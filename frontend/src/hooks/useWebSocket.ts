"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// 6.13 — WebSocket real-time updates hook
// ---------------------------------------------------------------------------

export type ConnectionState = "connecting" | "connected" | "disconnected" | "reconnecting";

interface UseWebSocketResult {
  /** The most recently received message (parsed JSON). */
  lastMessage: unknown;
  /** Whether the socket is currently connected. */
  isConnected: boolean;
  /** Whether the socket is currently attempting to reconnect. */
  isReconnecting: boolean;
  /** Detailed connection state. */
  connectionState: ConnectionState;
}

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8019";
const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

/**
 * Connect to the realtime service WebSocket for a given project.
 *
 * Features:
 *  - Auto-reconnect with exponential backoff (capped at 30 s)
 *  - Heartbeat ping every 30 s to keep the connection alive
 *  - Connection state tracking
 *  - Graceful cleanup on unmount or project change
 */
export function useWebSocket(projectId: number | null): UseWebSocketResult {
  const [lastMessage, setLastMessage] = useState<unknown>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY_MS);
  const mountedRef = useRef(true);

  const clearTimers = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!projectId || typeof window === "undefined") return;

    // Get JWT from localStorage for auth.
    const token = localStorage.getItem("khushfus_token");
    if (!token) return;

    const url = `${WS_BASE}/ws/mentions/${projectId}?token=${encodeURIComponent(token)}`;

    setConnectionState("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setConnectionState("disconnected");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) {
        ws.close();
        return;
      }
      setConnectionState("connected");
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;

      // Start heartbeat.
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(event.data);
        // Ignore pong heartbeat responses.
        if (parsed?.type === "pong") return;
        setLastMessage(parsed);
      } catch {
        // Non-JSON message — store raw.
        setLastMessage(event.data);
      }
    };

    ws.onclose = () => {
      clearTimers();
      if (!mountedRef.current) return;
      setConnectionState("reconnecting");

      // Schedule reconnect with exponential backoff.
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = () => {
      // The close handler will fire after this, handling reconnection.
      if (ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    };
  }, [projectId, clearTimers]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on intentional close.
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionState("disconnected");
    };
  }, [connect, clearTimers]);

  return {
    lastMessage,
    isConnected: connectionState === "connected",
    isReconnecting: connectionState === "reconnecting",
    connectionState,
  };
}
