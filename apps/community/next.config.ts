import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@pgpz/core", "@pgpz/x-monitor-core", "@pgpz/zec-shelf"],
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
    ];
  },
};

export default nextConfig;
