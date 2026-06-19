import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import { createInvitedMember, InvitationError } from "@/lib/admin/invitations";
import { buildAdminRoster, updateAdminMemberNotes } from "@/lib/admin/roster";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const statusParam = (request.nextUrl.searchParams.get("status") || "all").toLowerCase();
    const statusFilter =
      statusParam === "active" || statusParam === "invited" || statusParam === "none" || statusParam === "manual"
        ? statusParam
        : "all";
    const roster = await buildAdminRoster({ statusFilter });
    return NextResponse.json(roster);
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("Failed to load admin roster", err);
    return NextResponse.json({ error: "Failed to load admin roster" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    throw err;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const member = await createInvitedMember({
      email: typeof body?.email === "string" ? body.email : "",
      firstName: typeof body?.firstName === "string" ? body.firstName : "",
      lastName: typeof body?.lastName === "string" ? body.lastName : "",
      company: typeof body?.company === "string" ? body.company : "",
      jobTitle: typeof body?.jobTitle === "string" ? body.jobTitle : "",
      linkedinUrl: typeof body?.linkedinUrl === "string" ? body.linkedinUrl : "",
      xHandle: typeof body?.xHandle === "string" ? body.xHandle : "",
      memberDirectoryOptIn: body?.memberDirectoryOptIn === true,
      adminUserId,
    });
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    if (err instanceof InvitationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to create invited member", err);
    return NextResponse.json({ error: "Failed to create invited member" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let adminUserId: string | null = null;
  try {
    const session = await requireAdminSession();
    adminUserId = (session.user as any)?.id || null;
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    throw err;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes : "";
    const result = await updateAdminMemberNotes({ userId, adminUserId, adminNotes });
    return NextResponse.json(result);
  } catch (err: any) {
    const notFound = err?.name === "ConditionalCheckFailedException";
    const message = notFound
      ? "User not found"
      : typeof err?.message === "string"
        ? err.message
        : "Failed to update admin notes";
    const status = notFound ? 404 : message === "User ID is required." ? 400 : message.includes("4,000") ? 413 : 500;
    if (status >= 500) console.error("Failed to update admin notes", err);
    return NextResponse.json({ error: message }, { status });
  }
}
