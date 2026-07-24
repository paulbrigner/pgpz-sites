import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@pgpz/core"],
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
