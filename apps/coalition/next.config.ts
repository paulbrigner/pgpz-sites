import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@pgpz/access-log", "@pgpz/core", "@pgpz/email-admin-ui", "@pgpz/email-domain", "@pgpz/email-runtime", "@pgpz/public-files", "@pgpz/signup-notifications", "@pgpz/ui"],
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
