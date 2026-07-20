import "server-only";

import {
  createXMonitorReadClient,
  type XMonitorFetch,
  type XMonitorReadClient,
} from "@pgpz/x-monitor-core/read-client";
import { isCommunityXMonitorEnabled } from "@/lib/x-monitor-public";

const CLIENT_ID_HEADER = "x-xmonitor-client-id";
const CLIENT_SECRET_HEADER = "x-xmonitor-client-secret";
const DEFAULT_TIMEOUT_MS = 10_000;

export type CommunityXMonitorConfiguration = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
};

export class CommunityXMonitorConfigurationError extends Error {
  constructor() {
    super("X Monitor is not configured");
    this.name = "CommunityXMonitorConfigurationError";
  }
}

export class CommunityXMonitorUpstreamPathError extends Error {
  constructor() {
    super("X Monitor upstream path is not allowed");
    this.name = "CommunityXMonitorUpstreamPathError";
  }
}

function boundedTimeout(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.min(30_000, Math.max(1_000, Math.trunc(parsed)));
}

export function readCommunityXMonitorConfiguration(
  environment: Record<string, string | undefined> = process.env,
): CommunityXMonitorConfiguration {
  const enabled = environment.NEXT_PUBLIC_XMONITOR_ENABLED?.trim().toLowerCase() === "true";
  const rawBaseUrl = environment.XMONITOR_READ_API_BASE_URL?.trim() || "";
  const clientId = environment.XMONITOR_READ_CLIENT_ID?.trim() || "";
  const clientSecret = environment.XMONITOR_READ_CLIENT_SECRET?.trim() || "";

  let parsedBaseUrl: URL | null = null;
  try {
    parsedBaseUrl = rawBaseUrl ? new URL(rawBaseUrl) : null;
  } catch {
    parsedBaseUrl = null;
  }
  const production = (environment.NODE_ENV || process.env.NODE_ENV) === "production";
  const developmentHttp = Boolean(
    !production &&
    parsedBaseUrl?.protocol === "http:" &&
    new Set(["localhost", "127.0.0.1", "::1"]).has(parsedBaseUrl.hostname),
  );

  if (
    !enabled ||
    !parsedBaseUrl ||
    (parsedBaseUrl.protocol !== "https:" && !developmentHttp) ||
    Boolean(parsedBaseUrl.username) ||
    Boolean(parsedBaseUrl.password) ||
    Boolean(parsedBaseUrl.search) ||
    Boolean(parsedBaseUrl.hash) ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(clientId) ||
    clientSecret.length < 32
  ) {
    throw new CommunityXMonitorConfigurationError();
  }

  return {
    baseUrl: rawBaseUrl.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    timeoutMs: boundedTimeout(environment.XMONITOR_READ_TIMEOUT_MS),
  };
}

function requestHeaders(configuration: CommunityXMonitorConfiguration): Headers {
  return new Headers({
    [CLIENT_ID_HEADER]: configuration.clientId,
    [CLIENT_SECRET_HEADER]: configuration.clientSecret,
  });
}

function timeoutFetch(timeoutMs: number): XMonitorFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createCommunityXMonitorClient(): XMonitorReadClient {
  const configuration = readCommunityXMonitorConfiguration();
  return createXMonitorReadClient({
    baseUrl: configuration.baseUrl,
    fetch: timeoutFetch(configuration.timeoutMs),
    headers: requestHeaders(configuration),
  });
}

export async function proxyCommunityXMonitorRead(
  upstreamPath: string,
  upstreamSearch = new URLSearchParams(),
): Promise<Response> {
  const configuration = readCommunityXMonitorConfiguration();
  const allowedPath =
    upstreamPath === "feed" ||
    upstreamPath === "author-locations" ||
    upstreamPath === "trends" ||
    upstreamPath === "window-summaries/latest" ||
    /^posts\/[0-9]{1,32}$/.test(upstreamPath);
  if (!allowedPath) throw new CommunityXMonitorUpstreamPathError();

  const upstreamUrl = new URL(
    `${configuration.baseUrl.replace(/\/+$/, "")}/${upstreamPath.replace(/^\/+/, "")}`,
  );
  upstreamUrl.search = upstreamSearch.toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: requestHeaders(configuration),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    return Response.json(
      { error: "X Monitor upstream redirect refused" },
      {
        status: 502,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
  });

  if (!upstream.ok) {
    const status = upstream.status === 404 ? 404 : 502;
    return Response.json(
      { error: status === 404 ? "X Monitor record not found" : "X Monitor upstream request failed" },
      { status, headers },
    );
  }

  try {
    const payload = await upstream.json();
    return Response.json(payload, { status: upstream.status, headers });
  } catch {
    return Response.json(
      { error: "X Monitor upstream returned an invalid response" },
      { status: 502, headers },
    );
  }
}

export function communityXMonitorEnabledForRequest(): boolean {
  return isCommunityXMonitorEnabled();
}
