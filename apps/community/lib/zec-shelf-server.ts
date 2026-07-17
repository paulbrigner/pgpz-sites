import "server-only";

import { createZecShelfChecker, createZecShelfRepository } from "@pgpz/zec-shelf/server";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  COMMUNITY_ZEC_SHELF_INITIAL_RESOURCES,
  COMMUNITY_ZEC_SHELF_PARTITION_KEY,
} from "@/lib/zec-shelf-config";

export const communityZecShelfRepository = createZecShelfRepository({
  documentClient,
  tableName: TABLE_NAME,
  partitionKey: COMMUNITY_ZEC_SHELF_PARTITION_KEY,
  initialResources: COMMUNITY_ZEC_SHELF_INITIAL_RESOURCES,
});

export const communityZecShelfChecker = createZecShelfChecker({
  repository: communityZecShelfRepository,
  microlinkApiKey: process.env.MICROLINK_API_KEY,
  userAgentPrefix: "PGPZ-Community-ZEC-Shelf",
});
