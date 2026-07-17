import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument } from "@aws-sdk/lib-dynamodb";
import {
  AWS_REGION,
  NEXTAUTH_TABLE,
  PGPZ_AWS_ACCESS_KEY_ID,
  PGPZ_AWS_SECRET_ACCESS_KEY,
} from "@/lib/config";

const explicitCredentials =
  PGPZ_AWS_ACCESS_KEY_ID && PGPZ_AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: PGPZ_AWS_ACCESS_KEY_ID,
        secretAccessKey: PGPZ_AWS_SECRET_ACCESS_KEY,
      }
    : undefined;

const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
  credentials: explicitCredentials,
});
export const documentClient = DynamoDBDocument.from(dynamoClient);
export const TABLE_NAME = NEXTAUTH_TABLE || "NextAuth";
