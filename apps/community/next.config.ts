import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@pgpz/zec-shelf"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.microlink.io" },
    ],
  },
};

export default nextConfig;
