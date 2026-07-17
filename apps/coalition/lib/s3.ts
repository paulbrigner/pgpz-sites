import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import {
  AWS_REGION,
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

export const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: explicitCredentials,
});
