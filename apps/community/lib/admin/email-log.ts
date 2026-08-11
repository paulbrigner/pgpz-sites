import {
  createEmailLogRuntime,
  type EmailRuntimeDocumentClient,
} from "@pgpz/email-runtime";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type {
  EmailLogParams,
  EmailLogStatus,
  PolicyUpdateEmailStats,
  PolicyUpdateHistoryContext,
  PolicyUpdateSendHistoryItem,
} from "@pgpz/email-runtime";

const runtime = createEmailLogRuntime({
  documentClient: documentClient as unknown as EmailRuntimeDocumentClient,
  tableName: TABLE_NAME,
});

export const {
  groupPolicyUpdateEmailLogs,
  recordEmailEvent,
  summarizePolicyUpdateEmailStats,
  recordPolicyUpdateSendRun,
  updatePolicyUpdateSendRunProgress,
  listPolicyUpdateSendHistory,
} = runtime;
