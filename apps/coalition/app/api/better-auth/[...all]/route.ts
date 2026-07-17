import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/better-auth";
import { withTrustedBetterAuthRequestIp } from "@/lib/better-auth-client-ip";

export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

const withTrustedClientIp = (handler: (request: Request) => Promise<Response>) =>
  (request: Request) => handler(withTrustedBetterAuthRequestIp(request));

export const GET = withTrustedClientIp(handlers.GET);
export const POST = withTrustedClientIp(handlers.POST);
export const PATCH = withTrustedClientIp(handlers.PATCH);
export const PUT = withTrustedClientIp(handlers.PUT);
export const DELETE = withTrustedClientIp(handlers.DELETE);
