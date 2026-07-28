import { expect } from "vitest";

type DynamoExpressionRequest = {
  ConditionExpression?: string;
  FilterExpression?: string;
  KeyConditionExpression?: string;
  ProjectionExpression?: string;
  UpdateExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
};

const EXPRESSION_FIELDS = [
  "ConditionExpression",
  "FilterExpression",
  "KeyConditionExpression",
  "ProjectionExpression",
  "UpdateExpression",
] as const;

export function expectExpressionAttributesToMatch(
  request: DynamoExpressionRequest,
) {
  const expressionText = EXPRESSION_FIELDS
    .map((field) => request[field])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  const referencedValues = Array.from(
    new Set(expressionText.match(/:[A-Za-z0-9_]+/g) || []),
  ).sort();
  const suppliedValues = Object.keys(
    request.ExpressionAttributeValues || {},
  ).sort();
  const referencedNames = Array.from(
    new Set(expressionText.match(/#[A-Za-z0-9_]+/g) || []),
  ).sort();
  const suppliedNames = Object.keys(
    request.ExpressionAttributeNames || {},
  ).sort();

  expect(suppliedValues).toEqual(referencedValues);
  expect(suppliedNames).toEqual(referencedNames);
}
