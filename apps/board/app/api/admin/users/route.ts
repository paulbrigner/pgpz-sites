import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { isBoardAccessRole, type BoardAccessRecord, type BoardAccessRole } from "@/lib/board-access";
import { boardAuditLedger } from "@/lib/audit";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { anonymousClaimedActor, authenticatedActor, recordAccessDenied } from "@/lib/audit";
import { canManageBoardUsers, resolveBoardMemberState, type BoardMember } from "@/lib/session";

export const dynamic = "force-dynamic";

function responseUser(record: BoardAccessRecord, passkeyCount = 0) {
  return { ...record, passkeyCount };
}

async function authUserIdForEmail(email: string): Promise<string | null> {
  const result = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI1",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI1PK" },
    ExpressionAttributeValues: { ":pk": `BETTER_AUTH#better_auth_users#email#${email}` },
    Limit: 1,
  });
  const id = result.Items?.[0]?.id;
  return typeof id === "string" && id ? id : null;
}

function actorForAudit(admin: BoardMember) {
  return authenticatedActor(admin);
}

async function passkeyCount(userId: string) {
  const result = await documentClient.query({
    TableName: TABLE_NAME,
    IndexName: "GSI2",
    KeyConditionExpression: "#pk = :pk",
    ExpressionAttributeNames: { "#pk": "GSI2PK" },
    ExpressionAttributeValues: { ":pk": `BETTER_AUTH#better_auth_passkeys#userId#${userId}` },
    Select: "COUNT",
  });
  return Number(result.Count || 0);
}

async function sessionDeleteItems(userId: string) {
  const deletes: Record<string, unknown>[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const result = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI2",
      KeyConditionExpression: "#pk = :pk",
      ExpressionAttributeNames: { "#pk": "GSI2PK" },
      ExpressionAttributeValues: { ":pk": `BETTER_AUTH#better_auth_sessions#userId#${userId}` },
      ...(cursor ? { ExclusiveStartKey: cursor } : {}),
    });
    for (const item of result.Items || []) {
      if (typeof item.pk === "string" && typeof item.sk === "string") {
        deletes.push({ Delete: { TableName: TABLE_NAME, Key: { pk: item.pk, sk: item.sk } } });
      }
    }
    cursor = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (cursor);
  if (deletes.length > 90) throw new Error("Too many active sessions to revoke atomically; contact an operator.");
  return deletes;
}

async function auditItems(admin: BoardMember, input: {
  action: string;
  targetId: string;
  version: number;
  reason?: string;
}) {
  return (await boardAuditLedger.buildAppendItems({
    category: "account",
    action: input.action,
    outcome: "success",
    reason: input.reason,
    actor: actorForAudit(admin),
    target: { type: "board-access", id: input.targetId, version: String(input.version) },
    idempotencyKey: randomUUID(),
    occurredAt: new Date().toISOString(),
  })).TransactItems as Record<string, unknown>[];
}

async function requireUserManager(request: NextRequest): Promise<
  { response: NextResponse; admin: null } | { response: null; admin: BoardMember }
> {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status === "anonymous") {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }), admin: null };
  }
  if (state.status !== "member" || !canManageBoardUsers(state.member)) {
    await recordAccessDenied({
      actor: state.status === "restricted"
        ? anonymousClaimedActor(state.email)
        : authenticatedActor(state.member),
      target: { type: "route", id: "/api/admin/users" },
      reason: "user_management_required",
    });
    return { response: NextResponse.json({ error: "Board user management access required." }, { status: 403 }), admin: null };
  }
  return { response: null, admin: state.member };
}

export async function GET(request: NextRequest) {
  const authorization = await requireUserManager(request);
  if (authorization.response) return authorization.response;
  try {
    const page = await boardAccessRepository.list({ limit: 250 });
    const users = await Promise.all(page.records.map(async (record) => {
      const authUserId = await authUserIdForEmail(record.email);
      return responseUser(record, authUserId ? await passkeyCount(authUserId) : 0);
    }));
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to list Board users", error);
    return NextResponse.json({ error: "Unable to load Board users." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await requireUserManager(request);
  if (authorization.response) return authorization.response;
  try {
    const admin = authorization.admin;
    const body = await request.json().catch(() => ({}));
    const role = body?.role;
    if (!isBoardAccessRole(role)) return NextResponse.json({ error: "Select a valid Board role." }, { status: 400 });
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const existingAuthUserId = email ? await authUserIdForEmail(email) : null;
    const id = existingAuthUserId || randomUUID();
    const occurredAt = new Date().toISOString();
    const mutation = boardAccessRepository.buildCreateItems({
      id,
      email,
      name: typeof body?.name === "string" ? body.name : "",
      role,
      status: "active",
      actorEmail: admin.email,
      reason: "Created through Board administration.",
      occurredAt,
    });
    const audit = await auditItems(admin, { action: "user_created", targetId: id, version: 1 });
    const user = mutation.record;
    const authType = "BETTER_AUTH#better_auth_users";
    const authUserItem = {
      pk: `${authType}#${id}`, sk: `${authType}#${id}`, type: authType, id,
      name: user.name, email: user.email, emailVerified: true, image: null,
      createdAt: occurredAt, updatedAt: occurredAt,
      GSI1PK: `${authType}#email#${user.email}`, GSI1SK: id, adapterVersion: 1,
    };
    await boardAccessRepository.execute(mutation, {
      additionalTransactItems: [
        ...(existingAuthUserId ? [] : [{ Put: { TableName: TABLE_NAME, Item: authUserItem, ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } }]),
        ...audit,
      ],
    });
    return NextResponse.json({ user: responseUser(user) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add the Board user.";
    const conflict = /conditional|exists|transaction/i.test(message);
    if (!conflict) console.error("Failed to create Board user", error);
    return NextResponse.json({ error: conflict ? "That email already has a Board account." : message }, { status: conflict ? 409 : 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const authorization = await requireUserManager(request);
  if (authorization.response) return authorization.response;
  try {
    const admin = authorization.admin;
    const body = await request.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const current = userId ? await boardAccessRepository.getById(userId) : null;
    if (!current) return NextResponse.json({ error: "Board user not found." }, { status: 404 });
    if (current.email === admin.email && body?.action !== "revoke_sessions") {
      return NextResponse.json({ error: "You cannot change your own role or access state." }, { status: 409 });
    }
    const action = typeof body?.action === "string" ? body.action : "";
    const expectedConfirmation = action === "set_role" ? `CHANGE ROLE ${current.email}` : action === "revoke_sessions" ? `REVOKE ${current.email}` : `${action.toUpperCase()} ${current.email}`;
    if (body?.confirmation !== expectedConfirmation) return NextResponse.json({ error: `Type ${expectedConfirmation} to confirm.` }, { status: 400 });

    let mutation;
    let eventAction: string;
    let deletes: Record<string, unknown>[] = [];
    if (action === "set_role") {
      if (!isBoardAccessRole(body?.role)) return NextResponse.json({ error: "Select a valid Board role." }, { status: 400 });
      mutation = await boardAccessRepository.buildRoleChangeItems({ id: current.id, expectedVersion: current.version, role: body.role as BoardAccessRole, actorEmail: admin.email });
      eventAction = "user_role_changed";
    } else if (action === "deactivate" || action === "reactivate") {
      mutation = await boardAccessRepository.buildStatusChangeItems({ id: current.id, expectedVersion: current.version, status: action === "deactivate" ? "deactivated" : "active", actorEmail: admin.email });
      eventAction = action === "deactivate" ? "user_deactivated" : "user_reactivated";
      const authUserId = await authUserIdForEmail(current.email);
      if (action === "deactivate" && authUserId) deletes = await sessionDeleteItems(authUserId);
    } else if (action === "revoke_sessions") {
      mutation = await boardAccessRepository.buildSessionRevocationItems({ id: current.id, expectedVersion: current.version, actorEmail: admin.email });
      eventAction = "user_sessions_revoked";
      const authUserId = await authUserIdForEmail(current.email);
      if (authUserId) deletes = await sessionDeleteItems(authUserId);
    } else {
      return NextResponse.json({ error: "Unsupported Board user action." }, { status: 400 });
    }
    const audit = await auditItems(admin, { action: eventAction, targetId: current.id, version: mutation.record.version });
    const updated = await boardAccessRepository.execute(mutation, { additionalTransactItems: [...deletes, ...audit] });
    const authUserId = await authUserIdForEmail(updated.email);
    return NextResponse.json({ user: responseUser(updated, authUserId ? await passkeyCount(authUserId) : 0), message: "Board access updated and recorded." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the Board user.";
    const conflict = /version conflict|TransactionCanceled|conditional/i.test(message);
    if (!conflict) console.error("Failed to update Board user", error);
    return NextResponse.json({ error: conflict ? "This record changed. Refresh and try again." : message }, { status: conflict ? 409 : 400 });
  }
}
