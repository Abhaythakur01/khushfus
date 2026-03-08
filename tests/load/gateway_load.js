import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
const loginDuration = new Trend('login_duration', true);
const mentionsDuration = new Trend('mentions_duration', true);
const searchDuration = new Trend('search_duration', true);
const errorRate = new Rate('errors');

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------
export const options = {
    stages: [
        { duration: '30s', target: 20 },  // ramp up
        { duration: '1m', target: 50 },   // sustain
        { duration: '30s', target: 100 }, // peak
        { duration: '30s', target: 0 },   // ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],  // 95th percentile under 500ms
        http_req_failed: ['rate<0.01'],    // less than 1% errors
        errors: ['rate<0.05'],             // custom error rate under 5%
    },
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'loadtest@khushfus.com';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'loadtest123';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const PROJECT_ID = __ENV.PROJECT_ID || '1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getAuthHeaders(token) {
    return {
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
    };
}

// Try to obtain a token via login; fall back to the env-provided token.
function authenticate() {
    if (AUTH_TOKEN) {
        return AUTH_TOKEN;
    }

    const payload = JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
    });

    const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
        headers: { 'Content-Type': 'application/json' },
    });

    loginDuration.add(res.timings.duration);

    if (res.status === 200) {
        try {
            const body = JSON.parse(res.body);
            return body.access_token || '';
        } catch (_) {
            return '';
        }
    }
    return '';
}

// ---------------------------------------------------------------------------
// Setup — runs once before all VUs
// ---------------------------------------------------------------------------
export function setup() {
    // Warm-up: hit health endpoint to make sure the gateway is reachable
    const healthRes = http.get(`${BASE_URL}/health`);
    if (healthRes.status !== 200) {
        console.warn(`Gateway health check returned ${healthRes.status} — tests may fail`);
    }

    // Obtain a token that VUs can reuse
    const token = authenticate();
    return { token };
}

// ---------------------------------------------------------------------------
// Default function — executed by every VU on every iteration
// ---------------------------------------------------------------------------
export default function (data) {
    const token = data.token;

    // 1. Health check --------------------------------------------------
    group('GET /health', () => {
        const res = http.get(`${BASE_URL}/health`);
        const ok = check(res, {
            'health status is 200': (r) => r.status === 200,
            'health response time < 200ms': (r) => r.timings.duration < 200,
        });
        errorRate.add(!ok);
    });

    sleep(0.5);

    // 2. Login ---------------------------------------------------------
    group('POST /api/v1/auth/login', () => {
        const payload = JSON.stringify({
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
        });

        const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
            headers: { 'Content-Type': 'application/json' },
        });

        loginDuration.add(res.timings.duration);

        const ok = check(res, {
            'login status is 200 or 401': (r) => r.status === 200 || r.status === 401,
            'login response time < 500ms': (r) => r.timings.duration < 500,
        });
        errorRate.add(!ok);
    });

    sleep(0.5);

    // 3. List projects (authenticated) ---------------------------------
    group('GET /api/v1/projects', () => {
        const res = http.get(`${BASE_URL}/api/v1/projects`, getAuthHeaders(token));

        const ok = check(res, {
            'projects status is 200 or 401': (r) => r.status === 200 || r.status === 401,
            'projects response time < 500ms': (r) => r.timings.duration < 500,
        });
        errorRate.add(!ok);
    });

    sleep(0.5);

    // 4. List mentions with pagination ---------------------------------
    group('GET /api/v1/mentions', () => {
        const url = `${BASE_URL}/api/v1/mentions?project_id=${PROJECT_ID}&page=1&page_size=20`;
        const res = http.get(url, getAuthHeaders(token));

        mentionsDuration.add(res.timings.duration);

        const ok = check(res, {
            'mentions status is 200 or 401': (r) => r.status === 200 || r.status === 401,
            'mentions response time < 500ms': (r) => r.timings.duration < 500,
        });
        errorRate.add(!ok);

        // Second page
        const url2 = `${BASE_URL}/api/v1/mentions?project_id=${PROJECT_ID}&page=2&page_size=20`;
        const res2 = http.get(url2, getAuthHeaders(token));
        mentionsDuration.add(res2.timings.duration);

        check(res2, {
            'mentions page 2 status is 200 or 401': (r) => r.status === 200 || r.status === 401,
        });
    });

    sleep(0.5);

    // 5. Full-text search ----------------------------------------------
    group('POST /api/v1/search', () => {
        const queries = ['brand sentiment', 'product feedback', 'customer support', 'competitor mention'];
        const query = queries[Math.floor(Math.random() * queries.length)];

        const payload = JSON.stringify({
            query: query,
            project_id: parseInt(PROJECT_ID),
            page: 1,
            page_size: 20,
        });

        const res = http.post(`${BASE_URL}/api/v1/search`, payload, getAuthHeaders(token));

        searchDuration.add(res.timings.duration);

        const ok = check(res, {
            'search status is 200 or 401 or 404': (r) =>
                r.status === 200 || r.status === 401 || r.status === 404,
            'search response time < 800ms': (r) => r.timings.duration < 800,
        });
        errorRate.add(!ok);
    });

    sleep(1);
}

// ---------------------------------------------------------------------------
// Teardown — runs once after all VUs finish
// ---------------------------------------------------------------------------
export function teardown(data) {
    console.log('Load test complete.');
}
