import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { DynamoDBAdapter } from "@next-auth/dynamodb-adapter";
import { NEXTAUTH_SECRET } from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { normalizeXHandle } from "@/lib/x-handle";

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request as any, secret: NEXTAUTH_SECRET });
    if (!token?.sub) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { firstName, lastName } = body || {};
    let { linkedinUrl } = body || {};
    const company = typeof body?.company === "string" ? body.company.trim() : "";
    const jobTitle = typeof body?.jobTitle === "string" ? body.jobTitle.trim() : "";
    let xHandle = "";
    try {
      xHandle = normalizeXHandle(body?.xHandle);
    } catch (handleError: any) {
      return NextResponse.json({ error: handleError?.message || "Invalid X handle" }, { status: 400 });
    }
    const memberDirectoryOptIn = body?.memberDirectoryOptIn === true;

    // Basic validations
    const err = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
    if (!firstName || typeof firstName !== "string" || firstName.trim().length < 1) return err("First name is required");
    if (!lastName || typeof lastName !== "string" || lastName.trim().length < 1) return err("Last name is required");
    if (!company) return err("Corporate affiliation is required");
    if (!jobTitle) return err("Job title is required");
    if (company.length > 180) return err("Corporate affiliation must be 180 characters or fewer");
    if (jobTitle.length > 180) return err("Job title must be 180 characters or fewer");
    if (linkedinUrl && typeof linkedinUrl === "string") {
      linkedinUrl = linkedinUrl.trim();
      try {
        const u = new URL(linkedinUrl);
        if (!/^https?:$/.test(u.protocol)) return err("LinkedIn URL must be http(s)");
      } catch {
        return err("Invalid LinkedIn URL");
      }
    }

    const adapter: any = DynamoDBAdapter(documentClient as any, {
      tableName: TABLE_NAME,
    });

    const name = `${firstName.trim()} ${lastName.trim()}`.trim();
    const updated = await adapter.updateUser({
      id: token.sub,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company,
      jobTitle,
      linkedinUrl: linkedinUrl || null,
      xHandle: xHandle || null,
      memberDirectoryOptIn,
      name,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        company: updated.company,
        jobTitle: updated.jobTitle,
        linkedinUrl: updated.linkedinUrl,
        xHandle: updated.xHandle,
        memberDirectoryOptIn: updated.memberDirectoryOptIn,
      },
    });
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    console.error("/api/profile/update error:", msg);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
