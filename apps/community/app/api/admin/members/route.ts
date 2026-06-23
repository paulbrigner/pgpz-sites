import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import {
  AdminMemberActionError,
  buildAdminRoster,
  deactivateAdminMember,
  deleteDeactivatedAdminMember,
  optOutAdminMemberEmail,
  updateAdminMemberNotes,
  updateAdminMemberProfile,
} from "@/lib/admin/roster";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const statusParam = (request.nextUrl.searchParams.get("status") || "all").toLowerCase();
    const statusFilter =
      statusParam === "active" || statusParam === "none" || statusParam === "manual"
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
    const action = typeof body?.action === "string" ? body.action : "";
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
    if (action === "email_opt_out") {
      const result = await optOutAdminMemberEmail({ userId, adminUserId, confirmation });
      return NextResponse.json(result);
    }
    if (action === "deactivate") {
      const result = await deactivateAdminMember({ userId, adminUserId, confirmation });
      return NextResponse.json(result);
    }

    if (body?.profile && typeof body.profile === "object") {
      const result = await updateAdminMemberProfile({
        userId,
        adminUserId,
        profile: {
          email: typeof body.profile.email === "string" ? body.profile.email : "",
          firstName: typeof body.profile.firstName === "string" ? body.profile.firstName : "",
          lastName: typeof body.profile.lastName === "string" ? body.profile.lastName : "",
          xHandle: typeof body.profile.xHandle === "string" ? body.profile.xHandle : "",
          linkedinUrl: typeof body.profile.linkedinUrl === "string" ? body.profile.linkedinUrl : "",
        },
      });
      return NextResponse.json(result);
    }

    const adminNotes = typeof body?.adminNotes === "string" ? body.adminNotes : "";
    const result = await updateAdminMemberNotes({ userId, adminUserId, adminNotes });
    return NextResponse.json(result);
  } catch (err: any) {
    const notFound = err?.name === "ConditionalCheckFailedException";
    const message = notFound
      ? "User not found"
      : typeof err?.message === "string"
        ? err.message
        : "Failed to update member";
    const validationError =
      message === "User ID is required." ||
      message.endsWith("is required.") ||
      message.startsWith("Enter ") ||
      message.startsWith("Type ") ||
      message.includes("must be") ||
      message.includes("too long") ||
      message.includes("Invalid");
    const status =
      err instanceof AdminMemberActionError
        ? err.status
        : notFound
          ? 404
          : message.includes("4,000")
            ? 413
            : validationError
              ? 400
              : 500;
    if (status >= 500) console.error("Failed to update member", err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
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
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation : "";
    const result = await deleteDeactivatedAdminMember({ userId, adminUserId, confirmation });
    return NextResponse.json(result);
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "Failed to delete user";
    const status = err instanceof AdminMemberActionError ? err.status : 500;
    if (status >= 500) console.error("Failed to delete user", err);
    return NextResponse.json({ error: message }, { status });
  }
}
