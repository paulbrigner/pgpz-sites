import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { AWS_REGION } from "@/lib/config";
import { awsRuntimeClientConfig } from "@/lib/aws-runtime";

export const s3Client = new S3Client(awsRuntimeClientConfig(AWS_REGION));
