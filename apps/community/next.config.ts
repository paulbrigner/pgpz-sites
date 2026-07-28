import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@pgpz/core", "@pgpz/ui", "@pgpz/x-monitor-core", "@pgpz/zec-shelf"],
  serverExternalPackages: ["pdfkit"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.microlink.io" },
    ],
  },
  async headers() {
    return [
      {
        source: "/x-monitor/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      {
        source: "/zec-shelf/how-zcash-works.html",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
