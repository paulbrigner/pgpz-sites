import { NextRequest, NextResponse } from "next/server";
import { AdminAccessError, requireAdminSession } from "@/lib/admin/auth";
import {
  getInvitationEmailTemplate,
  InvitationTemplateError,
  saveInvitationEmailTemplate,
} from "@/lib/admin/invitation-template";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
    const template = await getInvitationEmailTemplate();
    return NextResponse.json(template);
  } catch (err) {
    if (err instanceof AdminAccessError) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    console.error("Failed to load invitation email template", err);
    return NextResponse.json({ error: "Failed to load invitation email template" }, { status: 500 });
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
    const template = await saveInvitationEmailTemplate({
      subject: typeof body?.subject === "string" ? body.subject : "",
      body: typeof body?.body === "string" ? body.body : "",
      adminUserId,
    });
    return NextResponse.json(template);
  } catch (err) {
    if (err instanceof InvitationTemplateError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to save invitation email template", err);
    return NextResponse.json({ error: "Failed to save invitation email template" }, { status: 500 });
  }
}

