import "server-only";

import type { MembershipMode, SiteConfig } from "../site-config";
import { isMembershipMode } from "../site-config";
import {
  ConfigValidationError,
  absoluteWebUrl,
  isRecord,
  rejectUnknownKeys,
  requiredString,
} from "../validation";

export type InjectedServerResource = object | ((...args: never[]) => unknown);

export type MembershipSubject = Readonly<{
  id?: string;
  email?: string;
  attributes?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type MembershipResolution = Readonly<{
  active: boolean;
  reason?: string;
  attributes?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type MembershipAdapter = Readonly<{
  mode: MembershipMode;
  resolve(subject: MembershipSubject): Promise<MembershipResolution>;
}>;

export type DynamoDBServerConfig<TClient = InjectedServerResource> = Readonly<{
  client: TClient;
  tableName: string;
  partitions?: Readonly<Record<string, string>>;
}>;

export type EmailServerConfig<TTransport = InjectedServerResource> = Readonly<{
  transport: TTransport;
  from: string;
}>;

export type AuthServerConfig<TAdapter = InjectedServerResource> = Readonly<{
  secret: string;
  baseUrl: string;
  trustedOrigins: readonly string[];
  adapter: TAdapter;
}>;

export type StorageServerConfig<TClient = InjectedServerResource> = Readonly<{
  client: TClient;
  bucket: string;
  prefix?: string;
}>;

export type ServerConfig<
  TDynamoDBClient = InjectedServerResource,
  TEmailTransport = InjectedServerResource,
  TAuthAdapter = InjectedServerResource,
  TStorageClient = InjectedServerResource,
> = Readonly<{
  dynamodb: DynamoDBServerConfig<TDynamoDBClient>;
  email: EmailServerConfig<TEmailTransport>;
  auth: AuthServerConfig<TAuthAdapter>;
  storage: StorageServerConfig<TStorageClient>;
  membership: Readonly<{ adapter: MembershipAdapter }>;
}>;

const isInjectedResource = (value: unknown): value is InjectedServerResource =>
  (typeof value === "object" && value !== null) || typeof value === "function";

function parseInjectedResource(value: unknown, path: string, issues: string[]) {
  if (!isInjectedResource(value)) issues.push(`${path} must be an injected object or function`);
  return value as InjectedServerResource;
}

function parsePartitions(value: unknown, issues: string[]) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    issues.push("server.dynamodb.partitions must be an object");
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, partition] of Object.entries(value)) {
    const cleanKey = key.trim();
    if (!cleanKey) issues.push("server.dynamodb.partitions keys must not be empty");
    result[cleanKey] = requiredString(
      partition,
      `server.dynamodb.partitions.${key}`,
      issues,
    );
  }
  return result;
}

function parseDynamoDB(value: unknown, issues: string[]): DynamoDBServerConfig {
  if (!isRecord(value)) {
    issues.push("server.dynamodb must be an object");
    return { client: {}, tableName: "" };
  }
  rejectUnknownKeys(value, ["client", "tableName", "partitions"], "server.dynamodb", issues);
  const partitions = parsePartitions(value.partitions, issues);
  return {
    client: parseInjectedResource(value.client, "server.dynamodb.client", issues),
    tableName: requiredString(value.tableName, "server.dynamodb.tableName", issues),
    ...(partitions === undefined ? {} : { partitions }),
  };
}

function parseEmail(value: unknown, issues: string[]): EmailServerConfig {
  if (!isRecord(value)) {
    issues.push("server.email must be an object");
    return { transport: {}, from: "" };
  }
  rejectUnknownKeys(value, ["transport", "from"], "server.email", issues);
  const from = requiredString(value.from, "server.email.from", issues);
  if (from && !/^[^\r\n]*@[^\r\n]+$/.test(from)) {
    issues.push("server.email.from must contain a valid sender address");
  }
  return {
    transport: parseInjectedResource(value.transport, "server.email.transport", issues),
    from,
  };
}

function parseAuth(value: unknown, issues: string[]): AuthServerConfig {
  if (!isRecord(value)) {
    issues.push("server.auth must be an object");
    return { secret: "", baseUrl: "", trustedOrigins: [], adapter: {} };
  }
  rejectUnknownKeys(value, ["secret", "baseUrl", "trustedOrigins", "adapter"], "server.auth", issues);
  const secret = requiredString(value.secret, "server.auth.secret", issues);
  if (secret && secret.length < 32) issues.push("server.auth.secret must contain at least 32 characters");
  const baseUrl = absoluteWebUrl(value.baseUrl, "server.auth.baseUrl", issues);
  let trustedOrigins: string[] = [];
  if (!Array.isArray(value.trustedOrigins) || value.trustedOrigins.length === 0) {
    issues.push("server.auth.trustedOrigins must be a non-empty array");
  } else {
    trustedOrigins = value.trustedOrigins.map((origin, index) => {
      const parsed = absoluteWebUrl(origin, `server.auth.trustedOrigins[${index}]`, issues);
      try {
        const url = new URL(parsed);
        if (`${url.origin}` !== parsed) {
          issues.push(`server.auth.trustedOrigins[${index}] must contain an origin without a path`);
        }
        return url.origin;
      } catch {
        return parsed;
      }
    });
    if (new Set(trustedOrigins).size !== trustedOrigins.length) {
      issues.push("server.auth.trustedOrigins must not contain duplicates");
    }
  }
  return {
    secret,
    baseUrl,
    trustedOrigins,
    adapter: parseInjectedResource(value.adapter, "server.auth.adapter", issues),
  };
}

function parseStorage(value: unknown, issues: string[]): StorageServerConfig {
  if (!isRecord(value)) {
    issues.push("server.storage must be an object");
    return { client: {}, bucket: "" };
  }
  rejectUnknownKeys(value, ["client", "bucket", "prefix"], "server.storage", issues);
  const prefix = value.prefix === undefined
    ? undefined
    : requiredString(value.prefix, "server.storage.prefix", issues).replace(/^\/+|\/+$/g, "");
  return {
    client: parseInjectedResource(value.client, "server.storage.client", issues),
    bucket: requiredString(value.bucket, "server.storage.bucket", issues),
    ...(prefix === undefined ? {} : { prefix }),
  };
}

function parseMembershipAdapter(value: unknown, issues: string[]): MembershipAdapter {
  if (!isRecord(value)) {
    issues.push("server.membership.adapter must be an object");
    return { mode: "externally-managed", async resolve() { return { active: false }; } };
  }
  rejectUnknownKeys(value, ["mode", "resolve"], "server.membership.adapter", issues);
  if (!isMembershipMode(value.mode)) {
    issues.push("server.membership.adapter.mode must be a supported membership mode");
  }
  if (typeof value.resolve !== "function") {
    issues.push("server.membership.adapter.resolve must be a function");
  }
  return value as MembershipAdapter;
}

function parseMembership(value: unknown, issues: string[]) {
  if (!isRecord(value)) {
    issues.push("server.membership must be an object");
    return { adapter: parseMembershipAdapter(undefined, issues) };
  }
  rejectUnknownKeys(value, ["adapter"], "server.membership", issues);
  return { adapter: parseMembershipAdapter(value.adapter, issues) };
}

export function parseServerConfig(input: unknown): ServerConfig {
  const issues: string[] = [];
  if (!isRecord(input)) throw new ConfigValidationError("ServerConfig", ["server must be an object"]);
  rejectUnknownKeys(input, ["dynamodb", "email", "auth", "storage", "membership"], "server", issues);
  const parsed: ServerConfig = {
    dynamodb: parseDynamoDB(input.dynamodb, issues),
    email: parseEmail(input.email, issues),
    auth: parseAuth(input.auth, issues),
    storage: parseStorage(input.storage, issues),
    membership: parseMembership(input.membership, issues),
  };
  if (issues.length) throw new ConfigValidationError("ServerConfig", issues);
  return parsed;
}

export function assertServerConfig(input: unknown): asserts input is ServerConfig {
  parseServerConfig(input);
}

export function defineServerConfig<const T extends ServerConfig>(config: T): T {
  assertServerConfig(config);
  return config;
}

export function assertMembershipModeAlignment(
  siteConfig: Pick<SiteConfig, "membershipMode">,
  serverConfig: Pick<ServerConfig, "membership">,
) {
  const actual = serverConfig.membership.adapter.mode;
  if (siteConfig.membershipMode !== actual) {
    throw new ConfigValidationError("Membership configuration", [
      `site membership mode ${JSON.stringify(siteConfig.membershipMode)} does not match server adapter mode ${JSON.stringify(actual)}`,
    ]);
  }
}

function validateMembershipSubject(subject: MembershipSubject) {
  const id = typeof subject.id === "string" ? subject.id.trim() : "";
  const email = typeof subject.email === "string" ? subject.email.trim().toLowerCase() : "";
  if (!id && !email) {
    throw new ConfigValidationError("MembershipSubject", ["membership subject requires an id or email"]);
  }
  return {
    ...(id ? { id } : {}),
    ...(email ? { email } : {}),
    ...(subject.attributes ? { attributes: subject.attributes } : {}),
  };
}

function validateMembershipResolution(value: unknown): MembershipResolution {
  if (!isRecord(value) || typeof value.active !== "boolean") {
    throw new ConfigValidationError("MembershipResolution", ["adapter result must contain an active boolean"]);
  }
  const issues: string[] = [];
  rejectUnknownKeys(value, ["active", "reason", "attributes"], "membershipResolution", issues);
  if (value.reason !== undefined && typeof value.reason !== "string") {
    issues.push("adapter result reason must be a string");
  }
  if (value.attributes !== undefined && !isRecord(value.attributes)) {
    issues.push("adapter result attributes must be an object");
  } else if (isRecord(value.attributes)) {
    for (const [key, attribute] of Object.entries(value.attributes)) {
      if (
        attribute !== null &&
        typeof attribute !== "string" &&
        typeof attribute !== "number" &&
        typeof attribute !== "boolean"
      ) {
        issues.push(`adapter result attribute ${JSON.stringify(key)} must be a primitive or null`);
      }
    }
  }
  if (issues.length) throw new ConfigValidationError("MembershipResolution", issues);
  return value as MembershipResolution;
}

export async function resolveActiveMembership(
  adapter: MembershipAdapter,
  subject: MembershipSubject,
): Promise<MembershipResolution> {
  if (!isMembershipMode(adapter.mode) || typeof adapter.resolve !== "function") {
    throw new ConfigValidationError("MembershipAdapter", ["adapter must expose a supported mode and resolve function"]);
  }
  return validateMembershipResolution(await adapter.resolve(validateMembershipSubject(subject)));
}
