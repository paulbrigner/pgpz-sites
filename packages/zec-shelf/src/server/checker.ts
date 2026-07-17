import "server-only";

import { createHash } from "node:crypto";
import { resolve4 as nodeResolve4, resolve6 as nodeResolve6 } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";
import type { ZecShelfResource } from "../domain";
import type { ZecShelfRepository } from "./repository";

type AddressResolver = (hostname: string) => Promise<string[]>;
const MAX_PAGE_BYTES = 400_000;

export type ZecShelfResolvedPage = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export type ZecShelfPageFetch = (
  target: ZecShelfResolvedPage,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

export type CreateZecShelfCheckerOptions = {
  repository: ZecShelfRepository;
  microlinkApiKey?: string;
  previewFetchImpl?: typeof fetch;
  /** Test seam for the address-pinned page transport. Production should use the default. */
  pageFetchImpl?: ZecShelfPageFetch;
  resolve4?: AddressResolver;
  resolve6?: AddressResolver;
  now?: () => string;
  userAgentPrefix?: string;
};

export type ZecShelfCheckResult =
  | {
      id: string;
      ok: true;
      state: "baseline" | "same" | "changed";
      previewRefreshed: boolean;
      previewError: string | null;
    }
  | { id: string; ok: false; error: string };

function publicAddress(value: string) {
  const normalized = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  if (!ipaddr.isValid(normalized)) return null;
  const address = ipaddr.process(normalized);
  if (address.range() !== "unicast") return null;
  return {
    address: address.toString(),
    family: address.kind() === "ipv4" ? 4 as const : 6 as const,
  };
}

function isMicrolinkAsset(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "microlink.io" || url.hostname.endsWith(".microlink.io"));
  } catch {
    return false;
  }
}

function pinnedHttpsFetch(
  target: ZecShelfResolvedPage,
  { headers, signal }: { headers: Record<string, string>; signal: AbortSignal },
) {
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const lookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) {
        callback(null, [{ address: target.address, family: target.family }]);
        return;
      }
      callback(null, target.address, target.family);
    };
    const request = httpsRequest(target.url, {
      headers,
      lookup,
      method: "GET",
      signal,
      servername: ipaddr.isValid(target.url.hostname.replace(/^\[|\]$/g, ""))
        ? undefined
        : target.url.hostname,
    }, (incoming) => {
      const status = incoming.statusCode || 502;
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
        else if (value !== undefined) responseHeaders.set(name, value);
      }

      if ([301, 302, 303, 307, 308].includes(status)) {
        settled = true;
        incoming.resume();
        resolve(new Response(null, { headers: responseHeaders, status }));
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      const finish = () => {
        if (settled) return;
        settled = true;
        const body = Buffer.concat(chunks, bytes);
        const responseBody = [204, 205, 304].includes(status) || body.length === 0 ? null : body;
        resolve(new Response(responseBody, { headers: responseHeaders, status }));
      };
      incoming.on("data", (chunk: Buffer | string) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = MAX_PAGE_BYTES - bytes;
        if (remaining > 0) {
          const slice = buffer.subarray(0, remaining);
          chunks.push(slice);
          bytes += slice.length;
        }
        if (bytes >= MAX_PAGE_BYTES) {
          finish();
          incoming.destroy();
        }
      });
      incoming.once("end", finish);
      incoming.once("error", (error) => {
        if (!settled) reject(error);
      });
      incoming.once("aborted", () => {
        if (!settled) reject(new Error("The site closed the connection before responding."));
      });
    });
    request.once("error", (error) => {
      if (!settled) reject(error);
    });
    request.end();
  });
}

export function createZecShelfChecker({
  repository,
  microlinkApiKey,
  previewFetchImpl = fetch,
  pageFetchImpl = pinnedHttpsFetch,
  resolve4 = (hostname) => nodeResolve4(hostname),
  resolve6 = (hostname) => nodeResolve6(hostname),
  now = () => new Date().toISOString(),
  userAgentPrefix = "PGPZ-ZEC-Shelf",
}: CreateZecShelfCheckerOptions) {
  async function resolvePublicHttpsUrl(value: string): Promise<ZecShelfResolvedPage> {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("Only public HTTPS pages can be checked.");
    }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".local")) {
      throw new Error("Only public HTTPS pages can be checked.");
    }

    if (ipaddr.isValid(host)) {
      const resolved = publicAddress(host);
      if (!resolved) throw new Error("Only public HTTPS pages can be checked.");
      return { url, ...resolved };
    }

    const [v4, v6] = await Promise.all([
      resolve4(host).catch(() => []),
      resolve6(host).catch(() => []),
    ]);
    if (!v4.length && !v6.length) throw new Error("The site's address could not be resolved.");
    const resolved = [...v4, ...v6].map(publicAddress);
    if (resolved.some((address) => !address)) {
      throw new Error("Only public HTTPS pages can be checked.");
    }
    return { url, ...resolved[0]! };
  }

  async function fetchPublicPage(value: string) {
    let target = await resolvePublicHttpsUrl(value);
    for (let redirect = 0; redirect <= 5; redirect += 1) {
      const response = await pageFetchImpl(target, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": `${userAgentPrefix}-Link-Checker/1.0`,
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("location");
      if (!location || redirect === 5) throw new Error("The site redirected too many times.");
      target = await resolvePublicHttpsUrl(new URL(location, target.url).toString());
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

  async function capturePreview(value: string) {
    const apiKey = microlinkApiKey?.trim();
    const endpoint = new URL(apiKey ? "https://pro.microlink.io/" : "https://api.microlink.io/");
    endpoint.searchParams.set("url", value);
    endpoint.searchParams.set("screenshot.type", "jpeg");
    endpoint.searchParams.set("viewport.width", "960");
    endpoint.searchParams.set("viewport.height", "600");
    endpoint.searchParams.set("viewport.deviceScaleFactor", "1");
    endpoint.searchParams.set("meta", "false");

    const response = await previewFetchImpl(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": `${userAgentPrefix}-Preview/1.0`,
        ...(apiKey ? { "x-api-key": apiKey } : {}),
      },
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({})) as {
      data?: { screenshot?: { url?: string } };
      message?: string;
    };
    if (!response.ok) throw new Error(result.message || `Preview capture returned ${response.status}.`);
    const previewUrl = result.data?.screenshot?.url;
    if (!previewUrl || !isMicrolinkAsset(previewUrl)) {
      throw new Error("Preview capture did not return a usable image.");
    }
    return previewUrl;
  }

  async function checkOne(resource: ZecShelfResource): Promise<ZecShelfCheckResult> {
    const checkedAt = now();
    try {
      const response = await fetchPublicPage(resource.url);
      if (!response.ok) throw new Error(`The site returned ${response.status}.`);
      const signature = await responseFingerprint(response);
      const firstCheck = !resource.contentSignature;
      const changed = Boolean(resource.contentSignature && resource.contentSignature !== signature);
      let previewUrl = resource.previewUrl;
      let previewUpdatedAt = resource.previewUpdatedAt;
      let previewRefreshed = false;
      let previewError: string | null = null;
      if (firstCheck || changed || !previewUrl) {
        try {
          previewUrl = await capturePreview(resource.url);
          previewUpdatedAt = checkedAt;
          previewRefreshed = true;
        } catch (error) {
          previewError = error instanceof Error ? error.message : "Preview capture failed.";
        }
      }
      const next = {
        ...resource,
        contentSignature: signature,
        lastCheckedAt: checkedAt,
        lastChangedAt: changed ? checkedAt : resource.lastChangedAt,
        lastHttpStatus: response.status,
        checkState: firstCheck ? "baseline" as const : changed ? "changed" as const : "same" as const,
        previewUrl,
        previewUpdatedAt,
        updatedAt: checkedAt,
      };
      await repository.saveCheckResult(next);
      return { id: resource.id, ok: true, state: next.checkState, previewRefreshed, previewError };
    } catch (error) {
      await repository.saveCheckResult({
        ...resource,
        lastCheckedAt: checkedAt,
        lastHttpStatus: null,
        checkState: "error",
        updatedAt: checkedAt,
      });
      return { id: resource.id, ok: false, error: error instanceof Error ? error.message : "Check failed" };
    }
  }

  async function checkMany(resources: ZecShelfResource[]) {
    const results: ZecShelfCheckResult[] = [];
    for (const resource of resources) results.push(await checkOne(resource));
    return results;
  }

  return { checkOne, checkMany };
}
