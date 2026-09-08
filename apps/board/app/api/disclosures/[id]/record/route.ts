import { NextRequest } from "next/server";
import { disclosureApi, disclosureJson } from "@/lib/disclosures-api";
import { disclosureView } from "@/lib/disclosures-service";
import { disclosureRecord, disclosureRecordHtml } from "@/lib/disclosures-record";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const GET = (request: NextRequest, context: Context) => disclosureApi(request, false, async (member) => {
  const view = await disclosureView(member, (await context.params).id);
  if (request.nextUrl.searchParams.get("format") === "json") return disclosureJson(disclosureRecord(view));
  return new Response(disclosureRecordHtml(view), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", Vary: "Cookie", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'", "X-Content-Type-Options": "nosniff" } });
});
