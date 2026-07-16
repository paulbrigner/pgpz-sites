import { isIP } from "node:net";

export const BETTER_AUTH_CLIENT_IP_HEADER = "x-pgpz-cloudfront-viewer-ip";

export function cloudFrontViewerIp(value: string | null | undefined): string | null {
  if (!value || value !== value.trim() || value.includes(",")) return null;
  const address = value;

  const separator = address.lastIndexOf(":");
  if (separator <= 0 || separator === address.length - 1) return null;

  const rawIp = address.slice(0, separator);
  const ip = rawIp.startsWith("[") && rawIp.endsWith("]")
    ? rawIp.slice(1, -1)
    : rawIp;
  const portText = address.slice(separator + 1);
  if (!/^\d{1,5}$/.test(portText)) return null;
  const port = Number(portText);

  if (!Number.isInteger(port) || port < 1 || port > 65_535 || !isIP(ip)) {
    return null;
  }

  return ip;
}

export function withTrustedBetterAuthClientIp(headers: Headers): Headers {
  const viewerIp = cloudFrontViewerIp(headers.get("cloudfront-viewer-address"));
  const suppliedTrustedHeader = headers.has(BETTER_AUTH_CLIENT_IP_HEADER);

  if (!viewerIp && !suppliedTrustedHeader) return headers;

  const trustedHeaders = new Headers(headers);
  trustedHeaders.delete(BETTER_AUTH_CLIENT_IP_HEADER);
  if (viewerIp) trustedHeaders.set(BETTER_AUTH_CLIENT_IP_HEADER, viewerIp);
  return trustedHeaders;
}

export function withTrustedBetterAuthRequestIp(request: Request): Request {
  const trustedHeaders = withTrustedBetterAuthClientIp(request.headers);
  if (trustedHeaders === request.headers) return request;
  return new Request(request, { headers: trustedHeaders });
}
