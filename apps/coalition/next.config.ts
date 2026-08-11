import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  transpilePackages: ["@pgpz/access-log", "@pgpz/core", "@pgpz/email-admin-ui", "@pgpz/email-domain", "@pgpz/email-runtime", "@pgpz/member-directory", "@pgpz/public-files", "@pgpz/signup-notifications", "@pgpz/ui"],
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        source: "/members/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
