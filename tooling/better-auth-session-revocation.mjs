export const BETTER_AUTH_SESSION_TYPE = "BETTER_AUTH#better_auth_sessions";
export const SESSION_DELETE_BATCH_SIZE = 25;

export function assertDynamoTableName(tableName) {
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(tableName || "")) {
    throw new Error("table must be a valid DynamoDB table name");
  }
  return tableName;
}

export function assertSessionRevocationConfirmation({
  apply,
  confirmation,
  confirmedTable,
  tableName,
}) {
  if (!apply) return;
  if (confirmation !== "REVOKE-BETTER-AUTH-SESSIONS") {
    throw new Error(
      "--apply requires --confirm REVOKE-BETTER-AUTH-SESSIONS",
    );
  }
  if (confirmedTable !== tableName) {
    throw new Error("--apply requires --confirm-table to exactly match --table");
  }
}

export function buildSessionScanArguments({ tableName, exclusiveStartKey }) {
  assertDynamoTableName(tableName);
  return [
    "dynamodb",
    "scan",
    "--table-name",
    tableName,
    "--consistent-read",
    "--filter-expression",
    "#recordType = :sessionType",
    "--expression-attribute-names",
    JSON.stringify({ "#recordType": "type" }),
    "--expression-attribute-values",
    JSON.stringify({ ":sessionType": { S: BETTER_AUTH_SESSION_TYPE } }),
    "--projection-expression",
    "pk, sk",
    "--no-paginate",
    "--output",
    "json",
    ...(exclusiveStartKey
      ? ["--exclusive-start-key", JSON.stringify(exclusiveStartKey)]
      : []),
  ];
}

export function collectSessionKeys(scanPages) {
  const keys = new Map();
  for (const page of scanPages) {
    if (!Array.isArray(page?.Items)) {
      throw new Error("DynamoDB scan response did not contain an Items array");
    }
    for (const item of page.Items) {
      const pk = item?.pk?.S;
      const sk = item?.sk?.S;
      if (typeof pk !== "string" || !pk || typeof sk !== "string" || !sk) {
        throw new Error("A matching session record did not contain string pk/sk keys");
      }
      keys.set(`${pk}\u0000${sk}`, { pk: { S: pk }, sk: { S: sk } });
    }
  }
  return [...keys.values()];
}

export function buildConditionalSessionDeleteBatches({ tableName, keys }) {
  assertDynamoTableName(tableName);
  const batches = [];
  for (let index = 0; index < keys.length; index += SESSION_DELETE_BATCH_SIZE) {
    batches.push(
      keys.slice(index, index + SESSION_DELETE_BATCH_SIZE).map((key) => ({
        Delete: {
          TableName: tableName,
          Key: key,
          ConditionExpression: "#recordType = :sessionType",
          ExpressionAttributeNames: { "#recordType": "type" },
          ExpressionAttributeValues: {
            ":sessionType": { S: BETTER_AUTH_SESSION_TYPE },
          },
        },
      })),
    );
  }
  return batches;
}
