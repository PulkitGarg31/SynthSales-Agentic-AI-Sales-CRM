import type { NextConfig } from "next";

// Security response headers applied to every route. The CSP intentionally sets
// only directives that cannot break the SPA's own scripts/styles/fetches
// (frame-ancestors, base-uri, object-src, form-action) — enough to close
// clickjacking, base-tag injection, object embedding and form hijacking. A
// script-src/connect-src lock-down needs a per-request nonce (Next middleware)
// and end-to-end testing; it's tracked as a follow-up, not shipped untested.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  // Emit a minimal self-contained server (.next/standalone/server.js) for a lean
  // production Docker image — see Dockerfile. Next.js 16 traces only the files
  // each route needs, so node_modules isn't shipped wholesale.
  output: "standalone",
  // Don't advertise the framework/version.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
