import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
