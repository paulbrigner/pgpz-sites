import {
  configureAccessLogRuntime,
} from "@pgpz/access-log/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

configureAccessLogRuntime({ documentClient, tableName: TABLE_NAME });

export * from "@pgpz/access-log/server";
