import { BOARD_CANONICAL_URL } from "@/config/site";

/**
 * Resolves an attacker-influenced post-login callback into a canonical
 * application-local path, or "/" when it is not provably local.
 *
 * The sign-in form receives `callbackUrl` from the query string and would feed
 * it to next/navigation's router.push after a successful sign-in. Without
 * validation that is an open redirect plus, in some router versions, a
 * `javascript:` execution primitive in the authenticated origin. This module
 * rejects:
 *
 * - absolute URLs (any scheme, including javascript:/data: and same-origin
 *   absolute URLs — the portal supplies callbacks as local paths only)
 * - protocol-relative URLs (`//host`), backslash-host forms (`/\host`)
 * - path forms that decode to a protocol-relative or host-prefixed path
 * - control characters
 *
 * Only local paths that parse as same-origin against the canonical Board
 * origin are returned. This module is deliberately client-safe (no
 * server-only import).
 */
export function resolveSafeCallbackUrl(
  value: string | null | undefined,
  baseOrigin: string = BOARD_CANONICAL_URL,
): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) return "/";
  if (!candidate.startsWith("/")) return "/";
  // Bare protocol-relative and backslash-host prefixes, before URL parsing
  // normalizes them away (e.g. //host or /\host).
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return "/";
  if (/[\u0000-\u001F\u007F]/.test(candidate)) return "/";

  let base: URL;
  let parsed: URL;
  try {
    base = new URL(baseOrigin);
    parsed = new URL(candidate, baseOrigin);
  } catch {
    return "/";
  }

  if (parsed.origin !== base.origin) return "/";
  if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return "/";

  // The raw path can smuggle a protocol-relative form through percent
  // encoding (e.g. /%2F%2Fevil.example). Routers normalize differently, so
  // the decoded path must also stay local.
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname);
  } catch {
    return "/";
  }
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return "/";
  if (/[\u0000-\u001F\u007F]/.test(decoded)) return "/";

  return `${parsed.pathname}${parsed.search}`;
}
