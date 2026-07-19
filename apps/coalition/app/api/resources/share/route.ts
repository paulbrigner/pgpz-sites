import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import {
  createResourceSubmission,
  listApprovedResourceSubmissions,
  ResourceSubmissionError,
  toApprovedResourceListing,
} from "@/lib/resource-submissions";

export const dynamic = "force-dynamic";

async function requireMember(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  if (!session?.user?.id) {
    return { session: null, response: NextResponse.json({ error: "Sign in before sharing a resource." }, { status: 401 }) };
  }
  if (!session.capabilities.member) {
    return { session: null, response: NextResponse.json({ error: "Active coalition membership is required." }, { status: 403 }) };
  }
  return { session, response: null };
}

export async function GET(request: NextRequest) {
  const { response } = await requireMember(request);
  if (response) return response;
  const resources = await listApprovedResourceSubmissions();
  return NextResponse.json({ resources: resources.map(toApprovedResourceListing) });
}

export async function POST(request: NextRequest) {
  const { session, response } = await requireMember(request);
  if (response || !session) return response;
  try {
    const body = await request.json();
    const firstName = typeof session.user.firstName === "string" ? session.user.firstName.trim() : "";
    const lastName = typeof session.user.lastName === "string" ? session.user.lastName.trim() : "";
    const submission = await createResourceSubmission({
      title: body?.title,
      url: body?.url,
      details: body?.details,
      submittedBy: session.user.id as string,
      submitterName:
        [firstName, lastName].filter(Boolean).join(" ") ||
        (typeof session.user.name === "string" ? session.user.name : "Coalition member"),
      submitterEmail: typeof session.user.email === "string" ? session.user.email : null,
    });
    return NextResponse.json(
      {
        ok: true,
        submissionId: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof ResourceSubmissionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Resource submission failed", error);
    return NextResponse.json({ error: "Failed to submit resource for review." }, { status: 500 });
  }
}
