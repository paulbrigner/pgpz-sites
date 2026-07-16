import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import { resolveAppSession } from "@/lib/app-session";
import { canManageZecShelf } from "@/lib/zec-shelf-access";
import {
  getZecShelfResource,
  getZecShelfResources,
  saveZecShelfCheckResult,
  type ZecShelfResource,
} from "@/lib/zec-shelf";

function isPrivateIpv4(address: string) {
  const [a, b] = address.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb");
}

async function assertPublicHttpsUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only public HTTPS pages can be checked.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) throw new Error("Only public HTTPS pages can be checked.");

  if (isIP(host)) {
    if ((isIP(host) === 4 && isPrivateIpv4(host)) || (isIP(host) === 6 && isPrivateIpv6(host))) {
      throw new Error("Only public HTTPS pages can be checked.");
    }
    return url;
  }

  const [v4, v6] = await Promise.all([
    resolve4(host).catch(() => []),
    resolve6(host).catch(() => []),
  ]);
  if (!v4.length && !v6.length) throw new Error("The site's address could not be resolved.");
  if (v4.some(isPrivateIpv4) || v6.some(isPrivateIpv6)) throw new Error("Only public HTTPS pages can be checked.");
  return url;
}

async function fetchPublicPage(value: string) {
  let url = await assertPublicHttpsUrl(value);
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "PGPZ-ZEC-Shelf-Link-Checker/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirect === 5) throw new Error("The site redirected too many times.");
    url = await assertPublicHttpsUrl(new URL(location, url).toString());
  }
  throw new Error("The site redirected too many times.");
}

async function responseFingerprint(response: Response) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let body = "";
  while (reader && body.length < 400_000) {
    const { done, value } = await reader.read();
    if (done) break;
    body += decoder.decode(value, { stream: true });
  }
  await reader?.cancel().catch(() => undefined);
  const stableBody = body
    .slice(0, 400_000)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256")
    .update([response.headers.get("etag") || "", response.headers.get("last-modified") || "", stableBody].join("|"))
    .digest("hex");
}

async function checkOne(resource: ZecShelfResource) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetchPublicPage(resource.url);
    if (!response.ok) throw new Error(`The site returned ${response.status}.`);
    const signature = await responseFingerprint(response);
    const firstCheck = !resource.contentSignature;
    const changed = Boolean(resource.contentSignature && resource.contentSignature !== signature);
    const next = {
      ...resource,
      contentSignature: signature,
      lastCheckedAt: checkedAt,
      lastChangedAt: changed ? checkedAt : resource.lastChangedAt,
      lastHttpStatus: response.status,
      checkState: firstCheck ? "baseline" as const : changed ? "changed" as const : "same" as const,
      updatedAt: checkedAt,
    };
    await saveZecShelfCheckResult(next);
    return { id: resource.id, ok: true, state: next.checkState };
  } catch (error) {
    await saveZecShelfCheckResult({
      ...resource,
      lastCheckedAt: checkedAt,
      lastHttpStatus: null,
      checkState: "error",
      updatedAt: checkedAt,
    });
    return { id: resource.id, ok: false, error: error instanceof Error ? error.message : "Check failed" };
  }
}

export async function POST(request: Request) {
  const session = await resolveAppSession(request.headers);
  if (!canManageZecShelf(session?.user)) {
    return Response.json(
      { error: "Administrator access is required." },
      { status: session?.user?.id ? 403 : 401 },
    );
  }

  try {
    const input = await request.json().catch(() => ({})) as { id?: string };
    const resources = input.id
      ? [await getZecShelfResource(input.id)].filter((item): item is ZecShelfResource => Boolean(item))
      : await getZecShelfResources();
    if (!resources.length) return Response.json({ error: "No matching resources were found." }, { status: 404 });
    const results = [];
    for (const resource of resources) results.push(await checkOne(resource));
    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update check failed" }, { status: 500 });
  }
}
