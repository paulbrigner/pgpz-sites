import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { AWS_REGION } from "@/lib/config";

export const s3Client = new S3Client({ region: AWS_REGION });
