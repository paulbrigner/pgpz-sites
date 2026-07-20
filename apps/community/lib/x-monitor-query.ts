import type {
  FeedQuery,
  WatchTierFilter,
  XMonitorSearchMode,
  XMonitorTrendRangeKey,
} from "@pgpz/x-monitor-core/contracts";

export const COMMUNITY_X_MONITOR_TIERS = [
  ["teammate", "Zodl Team"],
  ["influencer", "Influencer"],
  ["ecosystem", "Ecosystem"],
  ["other", "Other"],
] as const;

export const COMMUNITY_X_MONITOR_THEMES = [
  "Governance / strategy",
  "Privacy / freedom narrative",
  "Market / price",
  "Product / ecosystem",
  "Community / memes",
] as const;

type CommunityXMonitorTier = (typeof COMMUNITY_X_MONITOR_TIERS)[number][0];
type CommunityXMonitorTheme = (typeof COMMUNITY_X_MONITOR_THEMES)[number];

export type CommunityXMonitorSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type CommunityXMonitorQuery = {
  feed: FeedQuery;
  handle: string;
  q: string;
  searchMode: XMonitorSearchMode;
  significantMode: "significant" | "all";
  themes: CommunityXMonitorTheme[];
  tiers: CommunityXMonitorTier[];
  trendRange: XMonitorTrendRangeKey;
};

export type CommunityXMonitorProxyQuery = "feed" | "trends" | "author-locations";

function first(value: string | string[] | undefined): string {
  if (typeof value === "string") return value;
  return Array.isArray(value) ? value[0] || "" : "";
}

function bounded(value: string, maximum: number): string {
  return value.trim().slice(0, maximum);
}

function all(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function selectedValues<const T extends readonly string[]>(
  value: string | string[] | undefined,
  allowed: T,
): Array<T[number]> {
  const allowlist = new Set<string>(allowed);
  return [...new Set(all(value).filter((item) => allowlist.has(item)))] as Array<T[number]>;
}

export function parseCommunityXMonitorQuery(
  params: CommunityXMonitorSearchParams,
): CommunityXMonitorQuery {
  const searchMode: XMonitorSearchMode = first(params.search_mode) === "semantic"
    ? "semantic"
    : "keyword";
  const q = bounded(first(params.q), searchMode === "semantic" ? 500 : 200);
  const rawHandle = bounded(first(params.handle).replace(/^@+/, ""), 15);
  const handle = /^[A-Za-z0-9_]{1,15}$/.test(rawHandle) ? rawHandle : "";
  const significantMode = first(params.significant) === "all" ? "all" : "significant";
  const tiers = selectedValues(
    params.tier,
    COMMUNITY_X_MONITOR_TIERS.map(([value]) => value),
  );
  const themes = selectedValues(params.theme, COMMUNITY_X_MONITOR_THEMES);
  const rawTrendRange = first(params.trend_range);
  const trendRange: XMonitorTrendRangeKey =
    rawTrendRange === "24h" ||
    rawTrendRange === "30d" ||
    rawTrendRange === "90d"
      ? rawTrendRange
      : "7d";
  const cursor = bounded(first(params.cursor), 2_000);

  return {
    feed: {
      q: q || undefined,
      handle: handle || undefined,
      significant: significantMode === "significant" ? true : undefined,
      tiers: tiers.length > 0
        ? tiers.flatMap((tier): WatchTierFilter[] =>
            tier === "influencer" ? ["influencer", "investor"] : [tier],
          )
        : undefined,
      themes: themes.length > 0 ? themes : undefined,
      limit: 24,
      cursor: searchMode === "keyword" ? cursor || undefined : undefined,
    },
    handle,
    q,
    searchMode,
    significantMode,
    themes,
    tiers,
    trendRange,
  };
}

export function buildCommunityXMonitorHref(
  query: CommunityXMonitorQuery,
  cursor?: string | null,
): string {
  const params = new URLSearchParams();
  if (query.searchMode === "semantic") params.set("search_mode", "semantic");
  if (query.q) params.set("q", query.q);
  if (query.handle) params.set("handle", query.handle);
  if (query.significantMode === "all") params.set("significant", "all");
  query.tiers.forEach((tier) => params.append("tier", tier));
  query.themes.forEach((theme) => params.append("theme", theme));
  if (query.trendRange !== "7d") params.set("trend_range", query.trendRange);
  if (cursor && query.searchMode === "keyword") params.set("cursor", cursor);
  const serialized = params.toString();
  return serialized ? `/x-monitor?${serialized}` : "/x-monitor";
}

export function communityXMonitorActivityFeedQuery(
  query: CommunityXMonitorQuery,
): FeedQuery {
  return query.searchMode === "semantic"
    ? { ...query.feed, q: undefined, cursor: undefined }
    : { ...query.feed, cursor: undefined };
}

function searchParamsRecord(searchParams: URLSearchParams): CommunityXMonitorSearchParams {
  const result: CommunityXMonitorSearchParams = {};
  for (const [key, value] of searchParams) {
    const current = result[key];
    if (current === undefined) result[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else result[key] = [current, value];
  }
  return result;
}

export function safeCommunityXMonitorReturnHref(value: string | undefined): string {
  const fallback = "/x-monitor";
  const raw = String(value || "").trim();
  if (!raw || raw.length > 4_000) return fallback;

  try {
    const base = new URL("https://community.pgpz.org");
    const parsed = new URL(raw, base);
    if (parsed.origin !== base.origin || parsed.pathname !== "/x-monitor") return fallback;
    const query = parseCommunityXMonitorQuery(searchParamsRecord(parsed.searchParams));
    const canonical = buildCommunityXMonitorHref(query, query.feed.cursor);
    const hash = parsed.hash === "#x-monitor-feed" || parsed.hash === "#x-monitor-activity"
      ? parsed.hash
      : "";
    return `${canonical}${hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Build an allowlisted upstream query for the member BFF. Unknown parameters,
 * semantic POST requests, debate filters, and caller-controlled limits never
 * cross this GET-only Community-to-X-Monitor proxy boundary.
 */
export function buildCommunityXMonitorProxySearch(
  requestUrl: string,
  endpoint: CommunityXMonitorProxyQuery,
): URLSearchParams {
  const incoming = new URL(requestUrl).searchParams;
  const outgoing = new URLSearchParams();

  if (endpoint === "author-locations") {
    const parsedLimit = Number.parseInt(incoming.get("limit") || "", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(20, Math.max(1, parsedLimit))
      : 8;
    outgoing.set("limit", String(limit));
    return outgoing;
  }

  const proxyParams = searchParamsRecord(incoming);
  delete proxyParams.search_mode;
  const query = parseCommunityXMonitorQuery(proxyParams);
  if (query.q) outgoing.set("q", query.q);
  if (query.handle) outgoing.set("handle", query.handle);
  if (query.feed.significant !== undefined) {
    outgoing.set("significant", String(query.feed.significant));
  }
  query.feed.tiers?.forEach((tier) => outgoing.append("tier", tier));
  query.feed.themes?.forEach((theme) => outgoing.append("theme", theme));

  if (endpoint === "feed") {
    outgoing.set("limit", String(query.feed.limit || 24));
    if (query.feed.cursor) outgoing.set("cursor", query.feed.cursor);
  } else {
    outgoing.set("trend_range", query.trendRange);
  }

  return outgoing;
}
