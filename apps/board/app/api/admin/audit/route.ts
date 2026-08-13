import { NextRequest, NextResponse } from "next/server";
import { canReviewBoardAudit, resolveBoardMemberState } from "@/lib/session";
import { boardAuditLedger } from "@/lib/audit";
import { recordAccessDenied, anonymousClaimedActor } from "@/lib/audit";

export const runtime = "nodejs";

const UNAUTHORIZED = new Response(null, { status: 401 });
const FORBIDDEN = () =>
  NextResponse.json({ error: "Audit review access required" }, { status: 403 });

async function requireAuditReviewer(request: NextRequest) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status === "anonymous") return { response: UNAUTHORIZED, member: null };
  if (state.status !== "member" || !canReviewBoardAudit(state.member)) {
    // Authorize before revealing whether a privileged surface exists.
    await recordAccessDenied({
      actor:
        state.status === "restricted"
          ? anonymousClaimedActor(state.email)
          : { type: "authenticated", userId: state.member.id, email: state.member.email, role: state.member.role, capabilities: [] },
      target: { type: "audit", id: "/api/admin/audit" },
      reason: "audit_review_required",
    });
    return { response: FORBIDDEN(), member: null };
  }
  return { response: null, member: state.member };
}

const oneOf = (value: unknown) => (typeof value === "string" ? value : "");

export async function GET(request: NextRequest) {
  const { response, member } = await requireAuditReviewer(request);
  if (response) return response;

  const params = request.nextUrl.searchParams;
  const category = oneOf(params.get("category")) || undefined;
  const action = oneOf(params.get("action")) || undefined;
  const outcome = oneOf(params.get("outcome")) || undefined;
  const term = oneOf(params.get("term")) || undefined;
  const limitRaw = Number(params.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 100;

  const entries = await boardAuditLedger.list({ limit });
  const filtered = entries.filter((entry) => {
    if (category && entry.category !== category) return false;
    if (action && entry.action !== action) return false;
    if (outcome && entry.outcome !== outcome) return false;
    if (term) {
      const haystack = `${entry.category} ${entry.action} ${entry.actor.email ?? ""} ${entry.actor.role ?? ""}`.toLowerCase();
      if (!haystack.includes(term.toLowerCase())) return false;
    }
    return true;
  });

  void member;
  return NextResponse.json({ events: filtered, count: filtered.length });
}

export async function POST(request: NextRequest) {
  const { response, member } = await requireAuditReviewer(request);
  if (response) return response;
  void member;

  const action = oneOf((await request.json().catch(() => ({})))?.action);
  if (action === "verify") {
    const result = await boardAuditLedger.verify();
    return NextResponse.json(result);
  }
  if (action === "export") {
    const entries = await boardAuditLedger.list();
    return NextResponse.json({ events: entries, count: entries.length });
  }
  return NextResponse.json({ error: "Unknown audit action" }, { status: 400 });
}
