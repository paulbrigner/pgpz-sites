import { NextRequest, NextResponse } from "next/server";
import { resolveAppSession } from "@/lib/app-session";
import {
  createPolicyGroupWorkspaceItem,
  listPolicyGroupWorkspaceItems,
  PolicyGroupWorkspaceError,
  setPolicyGroupTaskStatus,
} from "@/lib/policy-group-workspace";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ group: string }> };

async function memberSession(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  if (!session?.user?.id) {
    return { session: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!session.capabilities.member) {
    return { session: null, response: NextResponse.json({ error: "Active coalition membership is required" }, { status: 403 }) };
  }
  return { session, response: null };
}

function failure(error: unknown) {
  if (error instanceof PolicyGroupWorkspaceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Policy group workspace request failed", error);
  return NextResponse.json({ error: "Policy group workspace request failed" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: Props) {
  const { response } = await memberSession(request);
  if (response) return response;
  try {
    const { group } = await params;
    return NextResponse.json({ items: await listPolicyGroupWorkspaceItems(group) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, { params }: Props) {
  const { session, response } = await memberSession(request);
  if (response || !session) return response;
  try {
    const { group } = await params;
    const body = await request.json();
    const firstName = typeof session.user.firstName === "string" ? session.user.firstName : "";
    const lastName = typeof session.user.lastName === "string" ? session.user.lastName : "";
    const item = await createPolicyGroupWorkspaceItem({
      groupId: group,
      kind: body?.kind,
      title: body?.title,
      body: body?.body,
      url: body?.url,
      authorId: session.user.id as string,
      authorName:
        [firstName, lastName].filter(Boolean).join(" ") ||
        (typeof session.user.name === "string" ? session.user.name : "Coalition member"),
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  const { session, response } = await memberSession(request);
  if (response || !session) return response;
  try {
    const { group } = await params;
    const body = await request.json();
    if (
      typeof body?.id !== "string" ||
      typeof body?.createdAt !== "string" ||
      typeof body?.completed !== "boolean"
    ) {
      return NextResponse.json({ error: "Task id, creation time, and completed state are required" }, { status: 400 });
    }
    const item = await setPolicyGroupTaskStatus({
      groupId: group,
      id: body.id,
      createdAt: body.createdAt,
      completed: body.completed,
      memberId: session.user.id as string,
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return failure(error);
  }
}
