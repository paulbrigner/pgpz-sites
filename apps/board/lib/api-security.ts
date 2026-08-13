import "server-only";

import { NextResponse } from "next/server";
import type { BoardMember } from "@/lib/session";
import { hasBoardPasskey } from "@/lib/passkey-enrollment";
import { hasBoardPasskeySession, hasRecentBoardPasskeyVerification } from "@/lib/passkey-step-up";

export async function requireBoardPasskeyEnrollment(member: BoardMember): Promise<NextResponse | null> {
  if (await hasBoardPasskey(member.id)) return null;
  return NextResponse.json(
    { error: "Register a passkey before accessing Board resources.", code: "PASSKEY_ENROLLMENT_REQUIRED" },
    { status: 403 },
  );
}

export async function requireBoardPasskeySession(headers: Headers, member: BoardMember): Promise<NextResponse | null> {
  const enrollment = await requireBoardPasskeyEnrollment(member);
  if (enrollment) return enrollment;
  if (await hasBoardPasskeySession(headers, member.id)) return null;
  return NextResponse.json(
    { error: "Verify a passkey before accessing Board resources.", code: "PASSKEY_AUTHENTICATION_REQUIRED" },
    { status: 401 },
  );
}

export async function requireBoardStepUp(headers: Headers, member: BoardMember): Promise<NextResponse | null> {
  if (await hasRecentBoardPasskeyVerification(headers, member.id)) return null;
  return NextResponse.json(
    { error: "Verify a passkey to continue.", code: "PASSKEY_STEP_UP_REQUIRED" },
    { status: 428 },
  );
}
