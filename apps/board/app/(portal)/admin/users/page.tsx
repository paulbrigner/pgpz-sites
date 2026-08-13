import { Badge, Container } from "@pgpz/ui";
import { BoardUserManager } from "@/components/admin/BoardUserManager";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { canManageBoardUsers, requireBoardAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Board User Management", robots: { index: false, follow: false, nocache: true } };

async function countPasskeys(userId: string) {
  const result = await documentClient.query({ TableName: TABLE_NAME, IndexName: "GSI2", KeyConditionExpression: "#pk = :pk", ExpressionAttributeNames: { "#pk": "GSI2PK" }, ExpressionAttributeValues: { ":pk": `BETTER_AUTH#better_auth_passkeys#userId#${userId}` }, Select: "COUNT" });
  return Number(result.Count || 0);
}

async function authUserIdForEmail(email: string) {
  const result = await documentClient.query({ TableName: TABLE_NAME, IndexName: "GSI1", KeyConditionExpression: "#pk = :pk", ExpressionAttributeNames: { "#pk": "GSI1PK" }, ExpressionAttributeValues: { ":pk": `BETTER_AUTH#better_auth_users#email#${email}` }, Limit: 1 });
  const id = result.Items?.[0]?.id;
  return typeof id === "string" ? id : null;
}

export default async function BoardUsersPage() {
  const admin = await requireBoardAdmin("/admin/users");
  if (!canManageBoardUsers(admin)) return null;
  const page = await boardAccessRepository.list({ limit: 250 });
  const users = await Promise.all(page.records.map(async (record) => { const authUserId = await authUserIdForEmail(record.email); return { ...record, passkeyCount: authUserId ? await countPasskeys(authUserId) : 0, lastSignInAt: null }; }));
  return <Container className="py-10 sm:py-14"><section className="max-w-3xl"><Badge tone="accent">Administrator only</Badge><h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">User management</h1><p className="mt-3 text-base leading-7 text-[var(--muted)]">Manage the people authorized to use the Board portal, their roles, sessions, and passwordless enrollment.</p></section><BoardUserManager initialUsers={users} currentUserEmail={admin.email} /></Container>;
}
