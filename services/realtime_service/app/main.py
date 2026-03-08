"""
Realtime/WebSocket Service — real-time mention feeds, dashboard updates, and alert
notifications via WebSocket and Server-Sent Events.

Responsibilities:
1. WebSocket endpoints for live mention feeds, dashboard counters, and alert notifications
2. SSE fallback endpoint for mention streams
3. Subscribes to Redis pub/sub channels per project (pattern: 'realtime:{project_id}')
4. Connection manager tracks active connections, handles disconnects gracefully
5. Heartbeat ping every 30 seconds to keep connections alive

Port: 8019

Integration:
- When the Query Service stores a new mention, it publishes to Redis pub/sub
  channel 'realtime:{project_id}' with the mention data as JSON.
- This service subscribes to those channels and fans out to all connected
  WebSocket/SSE clients for the matching project.
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from enum import Enum

import redis.asyncio as aioredis
from fastapi import APIRouter, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from shared.tracing import setup_tracing

setup_tracing("realtime")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

HEARTBEAT_INTERVAL = 30  # seconds
CHANNEL_PREFIX = "realtime"


# ============================================================
# Message Types
# ============================================================


class MessageType(str, Enum):
    MENTION = "mention"
    DASHBOARD = "dashboard"
    ALERT = "alert"
    HEARTBEAT = "heartbeat"
    CONNECTED = "connected"
    ERROR = "error"


class RealtimeMessage(BaseModel):
    type: str
    project_id: int
    data: dict
    timestamp: str


# ============================================================
# Connection Manager
# ============================================================


class ConnectionManager:
    """Manages WebSocket connections per project and message type."""

    def __init__(self):
        # {project_id: {channel_type: set(websocket)}}
        self._connections: dict[int, dict[str, set[WebSocket]]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, project_id: int, channel_type: str):
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            if project_id not in self._connections:
                self._connections[project_id] = {}
            if channel_type not in self._connections[project_id]:
                self._connections[project_id][channel_type] = set()
            self._connections[project_id][channel_type].add(websocket)

        logger.info(
            "WS connected: project=%d type=%s total=%d",
            project_id,
            channel_type,
            self.count(project_id, channel_type),
        )

        # Send connection confirmation
        await self._safe_send(
            websocket,
            {
                "type": MessageType.CONNECTED.value,
                "project_id": project_id,
                "channel": channel_type,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

    async def disconnect(self, websocket: WebSocket, project_id: int, channel_type: str):
        """Remove a WebSocket connection."""
        async with self._lock:
            if project_id in self._connections and channel_type in self._connections[project_id]:
                self._connections[project_id][channel_type].discard(websocket)
                # Clean up empty sets/dicts
                if not self._connections[project_id][channel_type]:
                    del self._connections[project_id][channel_type]
                if not self._connections[project_id]:
                    del self._connections[project_id]

        logger.info("WS disconnected: project=%d type=%s", project_id, channel_type)

    def count(self, project_id: int, channel_type: str) -> int:
        """Count active connections for a project and channel type."""
        return len(self._connections.get(project_id, {}).get(channel_type, set()))

    def total_connections(self) -> int:
        """Total number of active connections across all projects."""
        total = 0
        for project in self._connections.values():
            for conns in project.values():
                total += len(conns)
        return total

    def active_projects(self) -> set[int]:
        """Set of project IDs that have at least one active connection."""
        return set(self._connections.keys())

    async def broadcast(self, project_id: int, channel_type: str, message: dict):
        """Send a message to all connections for a project and channel type."""
        connections = self._connections.get(project_id, {}).get(channel_type, set()).copy()
        if not connections:
            return

        dead = []
        for ws in connections:
            success = await self._safe_send(ws, message)
            if not success:
                dead.append(ws)

        # Remove dead connections
        for ws in dead:
            await self.disconnect(ws, project_id, channel_type)

    async def broadcast_to_project(self, project_id: int, message: dict):
        """Send a message to ALL channel types for a given project."""
        channel_types = list(self._connections.get(project_id, {}).keys())
        for ct in channel_types:
            await self.broadcast(project_id, ct, message)

    async def send_heartbeat(self):
        """Send heartbeat ping to all connected clients."""
        heartbeat = {
            "type": MessageType.HEARTBEAT.value,
            "timestamp": datetime.utcnow().isoformat(),
        }
        all_projects = list(self._connections.keys())
        for pid in all_projects:
            channel_types = list(self._connections.get(pid, {}).keys())
            for ct in channel_types:
                await self.broadcast(pid, ct, heartbeat)

    @staticmethod
    async def _safe_send(websocket: WebSocket, data: dict) -> bool:
        """Send JSON data to a websocket, return False if connection is dead."""
        try:
            await websocket.send_json(data)
            return True
        except Exception:
            return False


# ============================================================
# SSE Connection Tracker
# ============================================================


class SSEManager:
    """Manages SSE client queues per project."""

    def __init__(self):
        # {project_id: set(asyncio.Queue)}
        self._clients: dict[int, set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, project_id: int) -> asyncio.Queue:
        """Create a new queue for an SSE client."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        async with self._lock:
            if project_id not in self._clients:
                self._clients[project_id] = set()
            self._clients[project_id].add(queue)
        return queue

    async def unsubscribe(self, project_id: int, queue: asyncio.Queue):
        """Remove an SSE client queue."""
        async with self._lock:
            if project_id in self._clients:
                self._clients[project_id].discard(queue)
                if not self._clients[project_id]:
                    del self._clients[project_id]

    async def publish(self, project_id: int, data: dict):
        """Push data to all SSE clients for a project."""
        clients = self._clients.get(project_id, set()).copy()
        for queue in clients:
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                # Drop oldest message if queue is full
                try:
                    queue.get_nowait()
                    queue.put_nowait(data)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    def active_projects(self) -> set[int]:
        return set(self._clients.keys())


# ============================================================
# Global Instances
# ============================================================

manager = ConnectionManager()
sse_manager = SSEManager()


# ============================================================
# Redis Pub/Sub Subscriber
# ============================================================


async def redis_subscriber(redis_url: str):
    """Subscribe to Redis pub/sub channels and fan out messages to WebSocket/SSE clients.

    Dynamically subscribes to channels for projects that have active connections.
    Resubscribes periodically to pick up new projects.
    """
    redis_conn = aioredis.from_url(redis_url, decode_responses=True)
    pubsub = redis_conn.pubsub()

    # Subscribe to pattern to catch all project channels
    await pubsub.psubscribe(f"{CHANNEL_PREFIX}:*")
    logger.info("Redis subscriber listening on pattern '%s:*'", CHANNEL_PREFIX)

    try:
        while True:
            try:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    await asyncio.sleep(0.01)
                    continue

                if message["type"] not in ("pmessage", "message"):
                    continue

                channel = message.get("channel", "")
                raw_data = message.get("data", "{}")

                # Parse project_id from channel name 'realtime:{project_id}'
                try:
                    project_id = int(channel.split(":")[-1])
                except (ValueError, IndexError):
                    logger.warning("Could not parse project_id from channel: %s", channel)
                    continue

                # Parse the message data
                try:
                    data = json.loads(raw_data) if isinstance(raw_data, str) else raw_data
                except json.JSONDecodeError:
                    data = {"raw": raw_data}

                msg_type = data.get("type", MessageType.MENTION.value)
                timestamp = data.get("timestamp", datetime.utcnow().isoformat())

                envelope = {
                    "type": msg_type,
                    "project_id": project_id,
                    "data": data,
                    "timestamp": timestamp,
                }

                # Route to appropriate channel type based on message type
                if msg_type == MessageType.ALERT.value:
                    await manager.broadcast(project_id, "alerts", envelope)
                elif msg_type == MessageType.DASHBOARD.value:
                    await manager.broadcast(project_id, "dashboard", envelope)
                else:
                    # Default: broadcast to mentions channel
                    await manager.broadcast(project_id, "mentions", envelope)
                    # Also update dashboard with incremental counters
                    dashboard_update = {
                        "type": MessageType.DASHBOARD.value,
                        "project_id": project_id,
                        "data": _extract_dashboard_data(data),
                        "timestamp": timestamp,
                    }
                    await manager.broadcast(project_id, "dashboard", dashboard_update)

                # Also push to SSE clients
                await sse_manager.publish(project_id, envelope)

            except aioredis.ConnectionError:
                logger.error("Redis connection lost, reconnecting in 2s...")
                await asyncio.sleep(2)
                try:
                    await pubsub.punsubscribe()
                except Exception:
                    pass
                redis_conn = aioredis.from_url(redis_url, decode_responses=True)
                pubsub = redis_conn.pubsub()
                await pubsub.psubscribe(f"{CHANNEL_PREFIX}:*")
            except Exception as e:
                logger.error("Redis subscriber error: %s", e)
                await asyncio.sleep(0.5)
    finally:
        await pubsub.punsubscribe()
        await redis_conn.aclose()


def _extract_dashboard_data(mention_data: dict) -> dict:
    """Extract dashboard-relevant counters from a mention event."""
    return {
        "event": "new_mention",
        "sentiment": mention_data.get("sentiment", "neutral"),
        "platform": mention_data.get("platform", "other"),
        "reach": int(mention_data.get("reach", 0)),
        "likes": int(mention_data.get("likes", 0)),
        "shares": int(mention_data.get("shares", 0)),
        "author_followers": int(mention_data.get("author_followers", 0)),
    }


# ============================================================
# Heartbeat Task
# ============================================================


async def heartbeat_loop():
    """Send periodic heartbeat pings to all connected clients."""
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        try:
            total = manager.total_connections()
            if total > 0:
                await manager.send_heartbeat()
                logger.debug("Heartbeat sent to %d connections", total)
        except Exception as e:
            logger.error("Heartbeat error: %s", e)


# ============================================================
# FastAPI Application
# ============================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start background tasks
    subscriber_task = asyncio.create_task(redis_subscriber(REDIS_URL))
    heartbeat_task = asyncio.create_task(heartbeat_loop())

    logger.info("Realtime service started")

    yield

    subscriber_task.cancel()
    heartbeat_task.cancel()
    try:
        await subscriber_task
    except asyncio.CancelledError:
        pass
    try:
        await heartbeat_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="KhushFus Realtime/WebSocket Service",
    description="Real-time mention feeds, dashboard updates, and alert notifications",
    version="0.1.0",
    contact={"name": "KhushFus Engineering", "email": "engineering@khushfus.io"},
    license_info={"name": "Proprietary"},
    openapi_tags=[
        {"name": "WebSocket", "description": "WebSocket endpoints for live data streams."},
        {"name": "SSE", "description": "Server-Sent Events fallback endpoint."},
        {"name": "Stats", "description": "Connection statistics."},
        {"name": "Publish", "description": "Internal message publishing for testing."},
        {"name": "Health", "description": "Service health check."},
    ],
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    from prometheus_fastapi_instrumentator import Instrumentator

    Instrumentator().instrument(app).expose(app)
except ImportError:
    pass

v1_router = APIRouter(prefix="/api/v1")


# ============================================================
# Health
# ============================================================


@app.get(
    "/health",
    tags=["Health"],
    summary="Realtime health check",
    description="Returns the health status of the Realtime service including active connection and project counts.",
)
async def health():
    from shared.health import check_redis

    redis_check = await check_redis(REDIS_URL)
    all_up = redis_check.get("status") == "up"
    return {
        "status": "ok" if all_up else "degraded",
        "service": "realtime-service",
        "version": "0.1.0",
        "active_connections": manager.total_connections(),
        "active_projects": len(manager.active_projects()),
        "dependencies": {"redis": redis_check},
    }


# ============================================================
# WebSocket Endpoints
# ============================================================


@v1_router.websocket("/ws/mentions/{project_id}")
async def ws_mentions(websocket: WebSocket, project_id: int):
    """Real-time mention feed. Pushes new mentions as they arrive for the project."""
    await manager.connect(websocket, project_id, "mentions")
    try:
        while True:
            # Keep the connection alive by reading (client can send ping/pong)
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_INTERVAL + 10)
                # Client can send filter updates as JSON
                try:
                    client_msg = json.loads(data)
                    if client_msg.get("type") == "ping":
                        await manager._safe_send(
                            websocket,
                            {
                                "type": "pong",
                                "timestamp": datetime.utcnow().isoformat(),
                            },
                        )
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                # No message from client; send a server-side ping
                alive = await manager._safe_send(
                    websocket,
                    {
                        "type": MessageType.HEARTBEAT.value,
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )
                if not alive:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("WS mentions error project=%d: %s", project_id, e)
    finally:
        await manager.disconnect(websocket, project_id, "mentions")


@v1_router.websocket("/ws/dashboard/{project_id}")
async def ws_dashboard(websocket: WebSocket, project_id: int):
    """Real-time dashboard updates: mention counts, sentiment counters, engagement."""
    await manager.connect(websocket, project_id, "dashboard")
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_INTERVAL + 10)
                try:
                    client_msg = json.loads(data)
                    if client_msg.get("type") == "ping":
                        await manager._safe_send(
                            websocket,
                            {
                                "type": "pong",
                                "timestamp": datetime.utcnow().isoformat(),
                            },
                        )
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                alive = await manager._safe_send(
                    websocket,
                    {
                        "type": MessageType.HEARTBEAT.value,
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )
                if not alive:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("WS dashboard error project=%d: %s", project_id, e)
    finally:
        await manager.disconnect(websocket, project_id, "dashboard")


@v1_router.websocket("/ws/alerts/{project_id}")
async def ws_alerts(websocket: WebSocket, project_id: int):
    """Real-time alert notifications for a project."""
    await manager.connect(websocket, project_id, "alerts")
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=HEARTBEAT_INTERVAL + 10)
                try:
                    client_msg = json.loads(data)
                    if client_msg.get("type") == "ping":
                        await manager._safe_send(
                            websocket,
                            {
                                "type": "pong",
                                "timestamp": datetime.utcnow().isoformat(),
                            },
                        )
                    elif client_msg.get("type") == "ack":
                        # Client acknowledges an alert
                        logger.info(
                            "Alert acknowledged: project=%d alert=%s",
                            project_id,
                            client_msg.get("alert_id"),
                        )
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                alive = await manager._safe_send(
                    websocket,
                    {
                        "type": MessageType.HEARTBEAT.value,
                        "timestamp": datetime.utcnow().isoformat(),
                    },
                )
                if not alive:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error("WS alerts error project=%d: %s", project_id, e)
    finally:
        await manager.disconnect(websocket, project_id, "alerts")


# ============================================================
# SSE Fallback Endpoint
# ============================================================


@v1_router.get(
    "/sse/mentions/{project_id}",
    tags=["SSE"],
    summary="SSE mention stream",
    description="SSE stream of new mentions for a project. Fallback for non-WebSocket clients.",
)
async def sse_mentions(project_id: int):
    """Server-Sent Events stream of new mentions for a project.

    Fallback for clients that cannot use WebSocket (e.g., behind certain proxies).
    """

    async def event_generator():
        queue = await sse_manager.subscribe(project_id)
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                    yield f"event: mention\ndata: {json.dumps(data, default=str)}\n\n"
                except asyncio.TimeoutError:
                    # Send SSE comment as keepalive
                    yield f": heartbeat {datetime.utcnow().isoformat()}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await sse_manager.unsubscribe(project_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================
# Stats Endpoint
# ============================================================


@v1_router.get(
    "/stats",
    tags=["Stats"],
    summary="Connection statistics",
    description="Return current WebSocket and SSE connection statistics per project.",
)
async def connection_stats():
    """Return current connection statistics."""
    active = manager.active_projects()
    stats = {}
    for pid in active:
        project_conns = manager._connections.get(pid, {})
        stats[str(pid)] = {ct: len(conns) for ct, conns in project_conns.items()}

    return {
        "total_ws_connections": manager.total_connections(),
        "total_sse_projects": len(sse_manager.active_projects()),
        "active_projects": sorted(active),
        "per_project": stats,
    }


# ============================================================
# Publish Endpoint (internal, for testing or direct integration)
# ============================================================


@v1_router.post(
    "/publish/{project_id}",
    tags=["Publish"],
    summary="Publish a message",
    description="Directly publish a message to connected WebSocket and SSE clients for testing or internal use.",
)
async def publish_message(project_id: int, payload: dict):
    """Directly publish a message to connected clients (for testing/internal use).

    In production, messages come through Redis pub/sub from the Query Service.
    """
    timestamp = datetime.utcnow().isoformat()
    msg_type = payload.get("type", MessageType.MENTION.value)

    envelope = {
        "type": msg_type,
        "project_id": project_id,
        "data": payload,
        "timestamp": timestamp,
    }

    if msg_type == MessageType.ALERT.value:
        await manager.broadcast(project_id, "alerts", envelope)
    elif msg_type == MessageType.DASHBOARD.value:
        await manager.broadcast(project_id, "dashboard", envelope)
    else:
        await manager.broadcast(project_id, "mentions", envelope)
        dashboard_update = {
            "type": MessageType.DASHBOARD.value,
            "project_id": project_id,
            "data": _extract_dashboard_data(payload),
            "timestamp": timestamp,
        }
        await manager.broadcast(project_id, "dashboard", dashboard_update)

    await sse_manager.publish(project_id, envelope)

    return {
        "status": "published",
        "project_id": project_id,
        "type": msg_type,
        "ws_clients_reached": manager.count(project_id, "mentions")
        + manager.count(project_id, "dashboard")
        + manager.count(project_id, "alerts"),
    }


app.include_router(v1_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8019)
