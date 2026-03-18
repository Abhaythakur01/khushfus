/** @type {import('next').NextConfig} */

const { withSentryConfig } = require("@sentry/nextjs");

// ---------------------------------------------------------------------------
// 6.37 — Bundle analysis (run with ANALYZE=true npm run build)
// ---------------------------------------------------------------------------

let withBundleAnalyzer;
try {
  withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
  });
} catch {
  // @next/bundle-analyzer not installed — skip silently
  withBundleAnalyzer = (config) => config;
}

// ---------------------------------------------------------------------------
// 6.2 + 6.18 — Comprehensive security headers
// ---------------------------------------------------------------------------

const API_DOMAIN = process.env.NEXT_PUBLIC_API_URL
  ? new URL(process.env.NEXT_PUBLIC_API_URL).origin
  : "http://localhost:8000";

const SENTRY_DOMAIN = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? (() => { try { return new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin; } catch { return ""; } })()
  : "";

/**
 * Content Security Policy directives.
 */
const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${API_DOMAIN} ${SENTRY_DOMAIN} wss: ws:`.trim(),
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // HSTS — only enable in production (behind TLS)
  ...(process.env.NODE_ENV === "production"
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

// Apply bundle analyzer
const configWithAnalyzer = withBundleAnalyzer(nextConfig);

// Apply Sentry (only uploads sourcemaps in production builds with DSN set)
module.exports = withSentryConfig(configWithAnalyzer, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI, // Suppress logs in local dev
  widenClientFileUpload: true,
  disableLogger: true,
  // Automatically tree-shake Sentry logger statements
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludePerformanceMonitoring: false,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
  },
});
