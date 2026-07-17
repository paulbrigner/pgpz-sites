import "server-only";

export {
  assertMembershipModeAlignment,
  assertServerConfig,
  defineServerConfig,
  parseServerConfig,
  resolveActiveMembership,
} from "./server-config";
export type {
  AuthServerConfig,
  DynamoDBServerConfig,
  EmailServerConfig,
  InjectedServerResource,
  MembershipAdapter,
  MembershipResolution,
  MembershipSubject,
  ServerConfig,
  StorageServerConfig,
} from "./server-config";
