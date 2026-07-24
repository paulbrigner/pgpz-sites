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
export {
  parsePolicyUpdateDocx,
  policyUpdateArtifactPrefix,
  policyUpdateAssetObjectKey,
  policyUpdateEmailAssetObjectPrefix,
  policyUpdatePdfObjectKey,
  policyUpdateSourceObjectKey,
  renderPolicyUpdatePdf,
  validatePolicyUpdateDocx,
} from "./policy-update-docx";
export type {
  ParsedPolicyUpdateDocx,
  PolicyUpdateDocumentImage,
  PolicyUpdateDocumentLink,
  PolicyUpdateDocumentSection,
  PolicyUpdateDocxAsset,
  PolicyUpdateTextRun,
} from "./policy-update-docx";
