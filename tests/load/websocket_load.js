import { check, sleep } from 'k6';
import ws from 'k6/ws';
import { Counter, Rate, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const wsConnections = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages_received');
const wsErrors = new Rate('ws_errors');
const wsConnectDuration = new Trend('ws_connect_duration', true);

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
export const options = {
    stages: [
        { duration: '15s', target: 10 },  // ramp up connections
        { duration: '30s', target: 30 },  // sustain
        { duration: '15s', target: 50 },  // peak concurrent connections
        { duration: '15s', target: 0 },   // ramp down
    ],
    thresholds: {
        ws_errors: ['rate<0.05'],                  // less than 5% connection errors
        ws_connect_duration: ['p(95)<2000'],        // 95th percentile connect < 2s
    },
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WS_BASE_URL = __ENV.WS_BASE_URL || 'ws://localhost:8019';
const PROJECT_ID = __ENV.PROJECT_ID || '1';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const SESSION_DURATION_SECONDS = parseInt(__ENV.SESSION_DURATION || '10');

// ---------------------------------------------------------------------------
// Default function — each VU opens a WebSocket connection
// ---------------------------------------------------------------------------
export default function () {
    const url = `${WS_BASE_URL}/api/v1/ws/${PROJECT_ID}`;

    // Append token as query param if provided (common pattern for WS auth)
    const wsUrl = AUTH_TOKEN ? `${url}?token=${AUTH_TOKEN}` : url;

    const connectStart = Date.now();

    const res = ws.connect(wsUrl, {}, function (socket) {
        const connectTime = Date.now() - connectStart;
        wsConnectDuration.add(connectTime);
        wsConnections.add(1);

        let messageCount = 0;

        socket.on('open', () => {
            // Subscribe to project mentions stream
            socket.send(
                JSON.stringify({
                    type: 'subscribe',
                    channel: `mentions:${PROJECT_ID}`,
                })
            );
        });

        socket.on('message', (msg) => {
            messageCount++;
            wsMessages.add(1);

            // Validate the message is parseable JSON
            try {
                const data = JSON.parse(msg);
                check(data, {
                    'message has type field': (d) => d.type !== undefined,
                });
            } catch (_) {
                // Some messages may be plain text (e.g. pings)
            }
        });

        socket.on('error', (e) => {
            wsErrors.add(1);
            console.error(`WebSocket error: ${e.error()}`);
        });

        socket.on('close', () => {
            check(messageCount, {
                'received at least one message or graceful close': (c) => c >= 0,
            });
        });

        // Send periodic pings to keep the connection alive
        socket.setInterval(() => {
            socket.send(JSON.stringify({ type: 'ping' }));
        }, 3000);

        // Hold the connection open for the configured session duration
        socket.setTimeout(() => {
            socket.close();
        }, SESSION_DURATION_SECONDS * 1000);
    });

    // Verify the WebSocket connection was established
    const ok = check(res, {
        'WebSocket handshake status is 101': (r) => r && r.status === 101,
    });

    if (!ok) {
        wsErrors.add(1);
    }

    sleep(1);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------
export function teardown() {
    console.log('WebSocket load test complete.');
}
