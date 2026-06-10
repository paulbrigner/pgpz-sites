export const AWS_REGION = process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1";
export const PGPZ_AWS_ACCESS_KEY_ID = process.env.PGPZ_AWS_ACCESS_KEY_ID as string | undefined;
export const PGPZ_AWS_SECRET_ACCESS_KEY = process.env.PGPZ_AWS_SECRET_ACCESS_KEY as string | undefined;
export const NEXTAUTH_URL = process.env.NEXTAUTH_URL as string;
export const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET as string;
export const NEXTAUTH_TABLE = process.env.NEXTAUTH_TABLE as string;

export const EMAIL_SERVER = process.env.EMAIL_SERVER as string;
export const EMAIL_FROM = process.env.EMAIL_FROM as string;
export const EMAIL_SERVER_HOST = process.env.EMAIL_SERVER_HOST as string | undefined;
export const EMAIL_SERVER_PORT = process.env.EMAIL_SERVER_PORT as string | undefined;
export const EMAIL_SERVER_USER = process.env.EMAIL_SERVER_USER as string | undefined;
export const EMAIL_SERVER_PASSWORD = process.env.EMAIL_SERVER_PASSWORD as string | undefined;
export const EMAIL_SERVER_SECURE = process.env.EMAIL_SERVER_SECURE as string | undefined;

export const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN as string;
export const KEY_PAIR_ID = process.env.KEY_PAIR_ID as string;
export const PRIVATE_KEY_SECRET = (process.env.PRIVATE_KEY_SECRET || "").replace(/\\n/g, "\n") as string;

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXTAUTH_URL ||
  "https://coalition.pgpz.org";
