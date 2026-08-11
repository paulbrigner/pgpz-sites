import { configureSignupNotificationRuntime } from "@pgpz/signup-notifications/server";
import { enqueueBackgroundJob } from "@/lib/admin/background-jobs";
import { isValidEmail, normalizeEmail } from "@/lib/admin/email-transport";
import {
  escapeHtml,
  renderBrandedEmailShell,
  renderEmailButton,
  renderEmailParagraph,
  renderSystemEmailFooter,
} from "@/lib/branded-email";
import {
  SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION,
  SITE_NAME,
  SITE_URL,
} from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { getUserDisplayName } from "@/lib/user-display-name";

configureSignupNotificationRuntime({
  documentClient,
  tableName: TABLE_NAME,
  successfulJoinOption: SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION,
  siteName: SITE_NAME,
  siteUrl: SITE_URL,
  normalizeEmail,
  isValidEmail,
  getUserDisplayName,
  escapeHtml,
  renderBrandedEmailShell,
  renderEmailButton,
  renderEmailParagraph,
  renderSystemEmailFooter,
  enqueueBackgroundJob,
});

export * from "@pgpz/signup-notifications/server";
