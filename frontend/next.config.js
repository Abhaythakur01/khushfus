/** @type {import('next').NextConfig} */

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

/**
 * Content Security Policy directives.
 * - 'self' allows same-origin resources
 * - API_DOMAIN allows XHR/fetch to the backend
 * - 'unsafe-inline' for styles is required by Tailwind's runtime + Next.js
 *   style injection. In production, consider switching to nonce-based CSP.
 * - No 'unsafe-eval' — keeps the JS eval surface locked down.
 */
const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  "default-src 'self'",
  // Dev mode needs 'unsafe-eval' + 'unsafe-inline' for Next.js hot reload / React Refresh
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self'",
  // Tailwind and Next.js inject <style> tags at runtime
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${API_DOMAIN} wss: ws:`,
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
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);
