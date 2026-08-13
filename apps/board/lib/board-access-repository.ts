import "server-only";

import { randomUUID } from "node:crypto";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_ACCESS_TABLE } from "@/lib/config";
import {
  isBoardAccessRole,
  isBoardAccessStatus,
  normalizeBoardAccessEmail,
  type BoardAccessRecord,
  type BoardAccessRevision,
  type BoardAccessRevisionAction,
  type BoardAccessRole,
  type BoardAccessStatus,
} from "@/lib/board-access";

const PROFILE_SK = "PROFILE";
const EMAIL_CLAIM_SK = "CLAIM";
const REVISION_PREFIX = "REVISION#";
const ROSTER_PK = "BOARD_ACCESS";
const ROSTER_INDEX = "Roster";

const accessPk = (id: string) => `ACCESS#${id}`;
const emailPk = (email: string) => `EMAIL#${email}`;
const revisionSk = (occurredAt: string, revisionId: string) =>
  `${REVISION_PREFIX}${occurredAt}#${revisionId}`;
const rosterSk = (record: Pick<BoardAccessRecord, "email" | "id">) =>
  `${record.email}#${record.id}`;

// The AWS DynamoDBDocument client and the test double both satisfy this surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BoardAccessDocumentClient = any;
export type BoardAccessTransactItem = Record<string, unknown>;

export interface BoardAccessListPage {
  readonly records: readonly BoardAccessRecord[];
  readonly cursor: Record<string, unknown> | null;
}

export interface BoardAccessMutationOptions {
  readonly additionalTransactItems?: readonly BoardAccessTransactItem[];
}

export interface CreateBoardAccessInput {
  readonly id?: string;
  readonly email: string;
  readonly name: string;
  readonly role: BoardAccessRole;
  readonly status?: BoardAccessStatus;
  readonly actorEmail: string;
  readonly reason?: string;
  readonly occurredAt?: string;
}

export interface ChangeBoardAccessRoleInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly role: BoardAccessRole;
  readonly actorEmail: string;
  readonly reason?: string;
  readonly occurredAt?: string;
}

export interface ChangeBoardAccessStatusInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly status: BoardAccessStatus;
  readonly actorEmail: string;
  readonly reason?: string;
  readonly occurredAt?: string;
}

export interface RecordSessionRevocationInput {
  readonly id: string;
  readonly expectedVersion: number;
  readonly actorEmail: string;
  readonly reason?: string;
  readonly occurredAt?: string;
}

export interface BuiltBoardAccessMutation {
  readonly record: BoardAccessRecord;
  readonly revision: BoardAccessRevision;
  readonly transactItems: readonly BoardAccessTransactItem[];
}

function requiredText(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function validateEmail(value: unknown, field = "email"): string {
  const email = normalizeBoardAccessEmail(value);
  if (!email || !email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    throw new Error(`${field} must be a valid email address`);
  }
  return email;
}

function validateVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error("expectedVersion must be a positive integer");
  }
  return Number(value);
}

function validateInstant(value: string | undefined): string {
  const instant = value || new Date().toISOString();
  if (Number.isNaN(Date.parse(instant))) throw new Error("occurredAt must be an ISO date-time");
  return instant;
}

function profileItem(record: BoardAccessRecord) {
  return {
    pk: accessPk(record.id),
    sk: PROFILE_SK,
    type: "BOARD_ACCESS_PROFILE",
    ...record,
    rosterPk: ROSTER_PK,
    rosterSk: rosterSk(record),
  };
}

function revisionItem(revision: BoardAccessRevision) {
  return {
    pk: accessPk(revision.accessId),
    sk: revisionSk(revision.occurredAt, revision.revisionId),
    type: "BOARD_ACCESS_REVISION",
    ...revision,
  };
}

function toRecord(item: Record<string, unknown> | undefined): BoardAccessRecord | null {
  if (!item || item.type !== "BOARD_ACCESS_PROFILE") return null;
  if (!isBoardAccessRole(item.role) || !isBoardAccessStatus(item.status)) return null;
  const email = normalizeBoardAccessEmail(item.email);
  const id = typeof item.id === "string" ? item.id : "";
  const version = Number(item.version);
  if (!id || !email || !Number.isInteger(version) || version < 1) return null;
  return {
    id,
    email,
    name: String(item.name || ""),
    role: item.role,
    status: item.status,
    version,
    createdAt: String(item.createdAt || ""),
    createdBy: String(item.createdBy || ""),
    updatedAt: String(item.updatedAt || ""),
    updatedBy: String(item.updatedBy || ""),
    activatedAt: item.activatedAt == null ? null : String(item.activatedAt),
    deactivatedAt: item.deactivatedAt == null ? null : String(item.deactivatedAt),
    sessionsRevokedAt: item.sessionsRevokedAt == null ? null : String(item.sessionsRevokedAt),
  };
}

function toRevision(item: Record<string, unknown>): BoardAccessRevision | null {
  if (item.type !== "BOARD_ACCESS_REVISION") return null;
  if (!isBoardAccessRole(item.role) || !isBoardAccessStatus(item.status)) return null;
  if (item.previousRole !== null && !isBoardAccessRole(item.previousRole)) return null;
  if (item.previousStatus !== null && !isBoardAccessStatus(item.previousStatus)) return null;
  return {
    revisionId: String(item.revisionId),
    accessId: String(item.accessId),
    version: Number(item.version),
    action: item.action as BoardAccessRevisionAction,
    actorEmail: String(item.actorEmail),
    occurredAt: String(item.occurredAt),
    previousRole: item.previousRole,
    role: item.role,
    previousStatus: item.previousStatus,
    status: item.status,
    reason: item.reason == null ? null : String(item.reason),
  };
}

function makeRevision(
  record: BoardAccessRecord,
  action: BoardAccessRevisionAction,
  actorEmail: string,
  previous: BoardAccessRecord | null,
  reason?: string,
): BoardAccessRevision {
  return {
    revisionId: randomUUID(),
    accessId: record.id,
    version: record.version,
    action,
    actorEmail,
    occurredAt: record.updatedAt,
    previousRole: previous?.role ?? null,
    role: record.role,
    previousStatus: previous?.status ?? null,
    status: record.status,
    reason: reason?.trim() || null,
  };
}

function updateItems(
  tableName: string,
  previous: BoardAccessRecord,
  record: BoardAccessRecord,
  revision: BoardAccessRevision,
): readonly BoardAccessTransactItem[] {
  return [
    {
      Put: {
        TableName: tableName,
        Item: profileItem(record),
        ConditionExpression: "#version = :expectedVersion AND #email = :email",
        ExpressionAttributeNames: { "#version": "version", "#email": "email" },
        ExpressionAttributeValues: { ":expectedVersion": previous.version, ":email": previous.email },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: revisionItem(revision),
        ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      },
    },
  ];
}

export function createBoardAccessRepository(
  client: BoardAccessDocumentClient = documentClient,
  tableName = BOARD_ACCESS_TABLE,
) {
  const resolvedTableName = requiredText(tableName, "BOARD_ACCESS_TABLE");

  async function getById(id: string): Promise<BoardAccessRecord | null> {
    const resolvedId = requiredText(id, "id");
    const result = await client.get({
      TableName: resolvedTableName,
      Key: { pk: accessPk(resolvedId), sk: PROFILE_SK },
      ConsistentRead: true,
    });
    return toRecord(result?.Item);
  }

  async function getByEmail(value: string): Promise<BoardAccessRecord | null> {
    const email = validateEmail(value);
    const claim = await client.get({
      TableName: resolvedTableName,
      Key: { pk: emailPk(email), sk: EMAIL_CLAIM_SK },
      ConsistentRead: true,
    });
    const id = typeof claim?.Item?.accessId === "string" ? claim.Item.accessId : "";
    return id ? getById(id) : null;
  }

  async function list(options: {
    status?: BoardAccessStatus;
    role?: BoardAccessRole;
    cursor?: Record<string, unknown>;
    limit?: number;
  } = {}): Promise<BoardAccessListPage> {
    if (options.status !== undefined && !isBoardAccessStatus(options.status)) throw new Error("invalid status");
    if (options.role !== undefined && !isBoardAccessRole(options.role)) throw new Error("invalid role");
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 100), 1), 250);
    const names: Record<string, string> = { "#rosterPk": "rosterPk" };
    const values: Record<string, unknown> = { ":rosterPk": ROSTER_PK };
    const filters: string[] = [];
    if (options.status) {
      names["#status"] = "status";
      values[":status"] = options.status;
      filters.push("#status = :status");
    }
    if (options.role) {
      names["#role"] = "role";
      values[":role"] = options.role;
      filters.push("#role = :role");
    }
    const result = await client.query({
      TableName: resolvedTableName,
      IndexName: ROSTER_INDEX,
      KeyConditionExpression: "#rosterPk = :rosterPk",
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(filters.length ? { FilterExpression: filters.join(" AND ") } : {}),
      ...(options.cursor ? { ExclusiveStartKey: options.cursor } : {}),
      Limit: limit,
    });
    return {
      records: (result.Items || []).map(toRecord).filter(Boolean) as BoardAccessRecord[],
      cursor: result.LastEvaluatedKey || null,
    };
  }

  async function listRevisions(id: string): Promise<readonly BoardAccessRevision[]> {
    const resolvedId = requiredText(id, "id");
    const result = await client.query({
      TableName: resolvedTableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: { ":pk": accessPk(resolvedId), ":prefix": REVISION_PREFIX },
      ScanIndexForward: false,
    });
    return (result.Items || []).map(toRevision).filter(Boolean) as BoardAccessRevision[];
  }

  function buildCreateItems(input: CreateBoardAccessInput): BuiltBoardAccessMutation {
    const id = requiredText(input.id || randomUUID(), "id");
    const email = validateEmail(input.email);
    const name = requiredText(input.name, "name");
    const actorEmail = validateEmail(input.actorEmail, "actorEmail");
    if (!isBoardAccessRole(input.role)) throw new Error("role is invalid");
    const status = input.status ?? "invited";
    if (!isBoardAccessStatus(status)) throw new Error("status is invalid");
    const occurredAt = validateInstant(input.occurredAt);
    const record: BoardAccessRecord = {
      id, email, name, role: input.role, status, version: 1,
      createdAt: occurredAt, createdBy: actorEmail, updatedAt: occurredAt, updatedBy: actorEmail,
      activatedAt: status === "active" ? occurredAt : null,
      deactivatedAt: status === "deactivated" ? occurredAt : null,
      sessionsRevokedAt: null,
    };
    const revision = makeRevision(record, "created", actorEmail, null, input.reason);
    return {
      record,
      revision,
      transactItems: [
        {
          Put: {
            TableName: resolvedTableName,
            Item: { pk: emailPk(email), sk: EMAIL_CLAIM_SK, type: "BOARD_ACCESS_EMAIL_CLAIM", email, accessId: id, createdAt: occurredAt },
            ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
            ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          },
        },
        {
          Put: {
            TableName: resolvedTableName,
            Item: profileItem(record),
            ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
            ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          },
        },
        {
          Put: {
            TableName: resolvedTableName,
            Item: revisionItem(revision),
            ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
            ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
          },
        },
      ],
    };
  }

  async function buildRoleChangeItems(input: ChangeBoardAccessRoleInput): Promise<BuiltBoardAccessMutation> {
    const previous = await getById(input.id);
    if (!previous) throw new Error("Board access record not found");
    validateVersion(input.expectedVersion);
    if (previous.version !== input.expectedVersion) throw new Error("Board access record version conflict");
    if (!isBoardAccessRole(input.role)) throw new Error("role is invalid");
    const actorEmail = validateEmail(input.actorEmail, "actorEmail");
    const occurredAt = validateInstant(input.occurredAt);
    const record = { ...previous, role: input.role, version: previous.version + 1, updatedAt: occurredAt, updatedBy: actorEmail };
    const revision = makeRevision(record, "role-changed", actorEmail, previous, input.reason);
    return { record, revision, transactItems: updateItems(resolvedTableName, previous, record, revision) };
  }

  async function buildStatusChangeItems(input: ChangeBoardAccessStatusInput): Promise<BuiltBoardAccessMutation> {
    const previous = await getById(input.id);
    if (!previous) throw new Error("Board access record not found");
    validateVersion(input.expectedVersion);
    if (previous.version !== input.expectedVersion) throw new Error("Board access record version conflict");
    if (!isBoardAccessStatus(input.status)) throw new Error("status is invalid");
    const actorEmail = validateEmail(input.actorEmail, "actorEmail");
    const occurredAt = validateInstant(input.occurredAt);
    const record: BoardAccessRecord = {
      ...previous,
      status: input.status,
      version: previous.version + 1,
      updatedAt: occurredAt,
      updatedBy: actorEmail,
      activatedAt: input.status === "active" ? (previous.activatedAt || occurredAt) : previous.activatedAt,
      deactivatedAt: input.status === "deactivated" ? occurredAt : null,
    };
    const revision = makeRevision(record, "status-changed", actorEmail, previous, input.reason);
    return { record, revision, transactItems: updateItems(resolvedTableName, previous, record, revision) };
  }

  async function buildSessionRevocationItems(input: RecordSessionRevocationInput): Promise<BuiltBoardAccessMutation> {
    const previous = await getById(input.id);
    if (!previous) throw new Error("Board access record not found");
    validateVersion(input.expectedVersion);
    if (previous.version !== input.expectedVersion) throw new Error("Board access record version conflict");
    const actorEmail = validateEmail(input.actorEmail, "actorEmail");
    const occurredAt = validateInstant(input.occurredAt);
    const record: BoardAccessRecord = { ...previous, version: previous.version + 1, updatedAt: occurredAt, updatedBy: actorEmail, sessionsRevokedAt: occurredAt };
    const revision = makeRevision(record, "sessions-revoked", actorEmail, previous, input.reason);
    return { record, revision, transactItems: updateItems(resolvedTableName, previous, record, revision) };
  }

  async function execute(mutation: BuiltBoardAccessMutation, options: BoardAccessMutationOptions = {}) {
    await client.transactWrite({
      TransactItems: [...mutation.transactItems, ...(options.additionalTransactItems || [])],
    });
    return mutation.record;
  }

  return {
    list,
    getById,
    getByEmail,
    listRevisions,
    buildCreateItems,
    buildRoleChangeItems,
    buildStatusChangeItems,
    buildSessionRevocationItems,
    execute,
    async create(input: CreateBoardAccessInput, options?: BoardAccessMutationOptions) {
      const mutation = buildCreateItems(input);
      return execute(mutation, options);
    },
    async changeRole(input: ChangeBoardAccessRoleInput, options?: BoardAccessMutationOptions) {
      return execute(await buildRoleChangeItems(input), options);
    },
    async changeStatus(input: ChangeBoardAccessStatusInput, options?: BoardAccessMutationOptions) {
      return execute(await buildStatusChangeItems(input), options);
    },
    async recordSessionRevocation(input: RecordSessionRevocationInput, options?: BoardAccessMutationOptions) {
      return execute(await buildSessionRevocationItems(input), options);
    },
  };
}

export const boardAccessRepository = createBoardAccessRepository();
