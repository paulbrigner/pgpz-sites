import path from "node:path";
import type { NextConfig } from "next";

// Container-friendly build knob: NEXT_BUILD_CPUS caps the number of Next
// build workers (defaults to all CPUs). Useful on hosts whose cgroup memory
// limit is much smaller than the machine's physical RAM, where the default
// per-worker V8 heap can exhaust the cgroup and get the build SIGKILLed.
const buildCpus = process.env.NEXT_BUILD_CPUS
  ? Number(process.env.NEXT_BUILD_CPUS)
  : undefined;
const isDevelopment = process.env.NODE_ENV === "development";

const DNS_SAFE_BUCKET = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const AWS_REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;

export function boardStagingUploadOrigin(
  bucketValue: string | undefined,
  regionValue: string | undefined,
): string | null {
  const bucket = bucketValue?.trim() || "";
  if (!bucket) return null;
  const region = regionValue?.trim() || "";
  if (!DNS_SAFE_BUCKET.test(bucket)) {
    throw new Error("BOARD_DOCUMENTS_STAGING_BUCKET must be a DNS-safe bucket name");
  }
  if (!AWS_REGION.test(region)) {
    throw new Error("REGION_AWS must be a valid AWS region when Board S3 uploads are enabled");
  }
  return `https://${bucket}.s3.${region}.amazonaws.com`;
}

export function buildBoardContentSecurityPolicy(input: {
  isDevelopment: boolean;
  stagingUploadOrigin: string | null;
}): string {
  const connectSources = ["'self'", ...(input.stagingUploadOrigin ? [input.stagingUploadOrigin] : [])];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "font-src 'self' data:",
    input.isDevelopment ? "form-action 'self'" : "form-action 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    input.isDevelopment
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const stagingUploadOrigin = boardStagingUploadOrigin(
  process.env.BOARD_DOCUMENTS_STAGING_BUCKET,
  process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1",
);
const contentSecurityPolicy = buildBoardContentSecurityPolicy({
  isDevelopment,
  stagingUploadOrigin,
});

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
  reactStrictMode: true,
  ...(buildCpus ? { experimental: { cpus: buildCpus } } : {}),
  transpilePackages: ["@pgpz/core", "@pgpz/ui", "@pgpz/auth-dynamodb"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" }
        ]
      }
    ];
  }
};

export default nextConfig;
