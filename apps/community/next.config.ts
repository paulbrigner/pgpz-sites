import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@napi-rs/**/*"],
  },
};

export default nextConfig;
