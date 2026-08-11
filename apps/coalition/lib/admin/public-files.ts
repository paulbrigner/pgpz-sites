import "server-only";

import {
  configurePublicFileRuntime,
  type PublicFileDocumentClient,
} from "@pgpz/public-files/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  PUBLIC_FILES_BUCKET,
  PUBLIC_FILES_PREFIX,
  SITE_URL,
} from "@/lib/config";

configurePublicFileRuntime({
  documentClient: documentClient as PublicFileDocumentClient,
  tableName: TABLE_NAME,
  bucket: PUBLIC_FILES_BUCKET,
  prefix: PUBLIC_FILES_PREFIX,
  siteUrl: SITE_URL,
});

export * from "@pgpz/public-files/server";
