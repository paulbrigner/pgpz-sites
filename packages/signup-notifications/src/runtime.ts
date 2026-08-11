import "server-only";

import { createHash } from "node:crypto";
import { isAccountActive } from "@pgpz/core";
import {
  type BackgroundJobRecipient,
} from "@pgpz/background-jobs";

export type SignupNotificationDocumentClient = {
  get(input: Record<string, unknown>): Promise<any>;
  scan(input: Record<string, unknown>): Promise<any>;
  update(input: Record<string, unknown>): Promise<any>;
};

export type SignupNotificationOption = {
  label: string;
  description: string;
};

export type SignupNotificationRuntimeDependencies = {
  documentClient: SignupNotificationDocumentClient;
  tableName: string;
  successfulJoinOption: SignupNotificationOption | null;
  siteName: string;
  siteUrl: string;
  normalizeEmail(value: unknown): string;
  isValidEmail(value: string): boolean;
  getUserDisplayName(user: any): string | null;
  escapeHtml(value: string): string;
  renderBrandedEmailShell(input: any): string;
  renderEmailButton(input: { href: string; label: string }): string;
  renderEmailParagraph(contentHtml: string): string;
  renderSystemEmailFooter(reason: string): string;
  enqueueBackgroundJob(input: any): Promise<any>;
};

let configuredRuntime: SignupNotificationRuntimeDependencies | null = null;

export function configureSignupNotificationRuntime(
  dependencies: SignupNotificationRuntimeDependencies,
) {
  configuredRuntime = dependencies;
}

const runtime = () => {
  if (!configuredRuntime) throw new Error("Signup-notification runtime is not configured.");
  return configuredRuntime;
};

export type AdminSignupNotificationPreferences = {
  approvalRequested: boolean;
  successfulJoin: boolean;
};

export type AdminSignupNotificationEvent =
  | {
      type: "approval_requested";
      memberUserId: string;
      occurredAt: string;
    }
  | {
      type: "successful_join";
      memberUserId: string;
      occurredAt: string;
      method: "x_self_verification" | "self_verification" | "admin_invitation";
      provider?: "x" | "zcashme" | null;
      proofUrl?: string | null;
      xHandle?: string | null;
      proofPostUrl?: string | null;
    };

type RawUser = Record<string, unknown> & {
  id?: string;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isAdmin?: boolean | null;
  accountStatus?: string | null;
  deactivatedAt?: string | null;
  emailSuppressed?: boolean | null;
  adminSignupApprovalRequestedEmailOptIn?: boolean | null;
  adminSignupSuccessfulJoinEmailOptIn?: boolean | null;
};

export type AdminSignupNotificationMember = {
  id: string;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

export type AdminSignupNotificationJobPayload = {
  event: AdminSignupNotificationEvent;
  member: AdminSignupNotificationMember;
};

export type BuiltAdminSignupNotificationEmail = {
  subject: string;
  html: string;
  text: string;
};

export class AdminSignupNotificationPreferenceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AdminSignupNotificationPreferenceError";
    this.status = status;
  }
}

const userKey = (userId: string) => ({
  pk: `USER#${userId}`,
  sk: `USER#${userId}`,
});

const preferencesFromUser = (user: RawUser | null | undefined): AdminSignupNotificationPreferences => ({
  approvalRequested: user?.adminSignupApprovalRequestedEmailOptIn === true,
  successfulJoin:
    runtime().successfulJoinOption !== null &&
    user?.adminSignupSuccessfulJoinEmailOptIn === true,
});

const preferenceOptions = () => ({
  approvalRequested: {
    label: "Approval requests",
    description: "Email me when a signed-in user requests membership approval.",
  },
  successfulJoin: runtime().successfulJoinOption,
});

const deliveryFromUser = (user: RawUser | null | undefined) => {
  const { isValidEmail, normalizeEmail } = runtime();
  const email = normalizeEmail(user?.email);
  if (!email) {
    return {
      available: false,
      message: "Your administrator account does not have an email address for notifications.",
    };
  }
  if (!isValidEmail(email)) {
    return {
      available: false,
      message: "Your administrator account email is not valid for notification delivery.",
    };
  }
  if (user?.emailSuppressed === true) {
    return {
      available: false,
      message: "Email delivery is currently suppressed for your administrator account.",
    };
  }
  return { available: true, message: null };
};

async function getEligibleAdmin(adminUserId: string): Promise<RawUser> {
  const { documentClient, tableName } = runtime();
  const userId = adminUserId.trim();
  if (!userId) throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);

  const result = await documentClient.get({
    TableName: tableName,
    Key: userKey(userId),
    ConsistentRead: true,
  });
  const user = result.Item as RawUser | undefined;
  if (!user || user.isAdmin !== true || !isAccountActive(user)) {
    throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);
  }
  return user;
}

const preferenceResponse = (user: RawUser | null | undefined) => {
  const { normalizeEmail } = runtime();
  return {
    recipientEmail: normalizeEmail(user?.email) || null,
    delivery: deliveryFromUser(user),
    preferences: preferencesFromUser(user),
    options: preferenceOptions(),
  };
};

export async function getAdminSignupNotificationPreferences(adminUserId: string) {
  return preferenceResponse(await getEligibleAdmin(adminUserId));
}

export async function updateAdminSignupNotificationPreferences({
  adminUserId,
  preferences,
}: {
  adminUserId: string;
  preferences: AdminSignupNotificationPreferences;
}) {
  const { documentClient, successfulJoinOption, tableName } = runtime();
  const userId = adminUserId.trim();
  if (!userId) throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);
  if (typeof preferences.approvalRequested !== "boolean" || typeof preferences.successfulJoin !== "boolean") {
    throw new AdminSignupNotificationPreferenceError("Notification preferences must be true or false.");
  }
  if (successfulJoinOption === null && preferences.successfulJoin) {
    throw new AdminSignupNotificationPreferenceError("Successful-join notifications are not available for this site.");
  }

  const now = new Date().toISOString();
  try {
    const result = await documentClient.update({
      TableName: tableName,
      Key: userKey(userId),
      UpdateExpression:
        "SET adminSignupApprovalRequestedEmailOptIn = :approvalRequested, adminSignupSuccessfulJoinEmailOptIn = :successfulJoin, adminSignupNotificationsUpdatedAt = :now, adminSignupNotificationsUpdatedBy = :adminUserId",
      ConditionExpression:
        "attribute_exists(#pk) AND isAdmin = :true AND (attribute_not_exists(#accountStatus) OR attribute_type(#accountStatus, :nullType) OR #accountStatus = :emptyString OR #accountStatus = :activeAccount) AND (attribute_not_exists(#deactivatedAt) OR attribute_type(#deactivatedAt, :nullType) OR #deactivatedAt = :emptyString)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      },
      ExpressionAttributeValues: {
        ":approvalRequested": preferences.approvalRequested,
        ":successfulJoin":
          successfulJoinOption === null ? false : preferences.successfulJoin,
        ":now": now,
        ":adminUserId": userId,
        ":true": true,
        ":activeAccount": "active",
        ":emptyString": "",
        ":nullType": "NULL",
      },
      ReturnValues: "ALL_NEW",
    });
    return { ...preferenceResponse(result.Attributes as RawUser | undefined), updatedAt: now };
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === "ConditionalCheckFailedException") {
      throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);
    }
    throw error;
  }
}

async function listAdminRecipients(event: AdminSignupNotificationEvent): Promise<BackgroundJobRecipient[]> {
  const { documentClient, isValidEmail, normalizeEmail, successfulJoinOption, tableName } = runtime();
  if (event.type === "successful_join" && successfulJoinOption === null) return [];

  const recipients: BackgroundJobRecipient[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await documentClient.scan({
      TableName: tableName,
      FilterExpression: "#type = :user",
      ProjectionExpression:
        "id, email, isAdmin, accountStatus, deactivatedAt, emailSuppressed, adminSignupApprovalRequestedEmailOptIn, adminSignupSuccessfulJoinEmailOptIn",
      ExpressionAttributeNames: { "#type": "type" },
      ExpressionAttributeValues: { ":user": "USER" },
      ExclusiveStartKey,
    });

    for (const item of result.Items || []) {
      const user = item as RawUser;
      const email = normalizeEmail(user.email);
      const optedIn =
        event.type === "approval_requested"
          ? user.adminSignupApprovalRequestedEmailOptIn === true
          : user.adminSignupSuccessfulJoinEmailOptIn === true;
      if (
        user.id &&
        user.isAdmin === true &&
        isAccountActive(user) &&
        user.emailSuppressed !== true &&
        optedIn &&
        isValidEmail(email)
      ) {
        recipients.push({
          recipientKey: `admin:${user.id}`,
          userId: user.id,
          email,
          metadata: { eventType: event.type },
        });
      }
    }
    ExclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);

  return recipients;
}

async function getMember(event: AdminSignupNotificationEvent): Promise<AdminSignupNotificationMember> {
  const { documentClient, normalizeEmail, tableName } = runtime();
  const result = await documentClient.get({
    TableName: tableName,
    Key: userKey(event.memberUserId),
    ConsistentRead: true,
    ProjectionExpression: "id, email, #name, firstName, lastName",
    ExpressionAttributeNames: { "#name": "name" },
  });
  const member = (result.Item as RawUser | undefined) || {};
  return {
    id: typeof member.id === "string" ? member.id : event.memberUserId,
    email: normalizeEmail(member.email) || null,
    name: typeof member.name === "string" ? member.name : null,
    firstName: typeof member.firstName === "string" ? member.firstName : null,
    lastName: typeof member.lastName === "string" ? member.lastName : null,
  };
}

function formattedTimestamp(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

export function buildAdminSignupNotificationEmail({
  event,
  member,
}: AdminSignupNotificationJobPayload): BuiltAdminSignupNotificationEmail {
  const {
    escapeHtml,
    getUserDisplayName,
    normalizeEmail,
    renderBrandedEmailShell,
    renderEmailButton,
    renderEmailParagraph,
    renderSystemEmailFooter,
    siteName: SITE_NAME,
    siteUrl: SITE_URL,
  } = runtime();
  const memberName = getUserDisplayName(member) || "New user";
  const subjectMemberName =
    memberName.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "New user";
  const memberEmail = normalizeEmail(member.email) || "Not available";
  const adminUrl = `${SITE_URL.replace(/\/+$/, "")}/admin`;
  const timeLabel = formattedTimestamp(event.occurredAt);
  const isApproval = event.type === "approval_requested";
  const isInvitation = event.type === "successful_join" && event.method === "admin_invitation";
  const provider = event.type === "successful_join"
    ? event.provider || (event.method === "x_self_verification" ? "x" : null)
    : null;
  const providerLabel = provider === "zcashme" ? "ZcashMe" : "X";
  const proofUrl = event.type === "successful_join"
    ? event.proofUrl || event.proofPostUrl || null
    : null;
  const subject = isApproval
    ? `[${SITE_NAME}] Approval requested: ${subjectMemberName}`
    : isInvitation
      ? `[${SITE_NAME}] New member joined: ${subjectMemberName}`
      : `[${SITE_NAME}] New member self-verified: ${subjectMemberName}`;
  const preheader = isApproval
    ? `${memberName} is waiting for an administrator's review.`
    : isInvitation
      ? `${memberName} accepted an administrator invitation.`
      : `${memberName} successfully joined through ${providerLabel} self-verification.`;
  const eventDescription = isApproval
    ? "A signed-in user requested membership approval and is now waiting for an administrator's review."
    : isInvitation
      ? "A new member accepted an administrator invitation and activated their membership."
      : `A new member successfully activated their membership through ${providerLabel} self-verification.`;

  const body = [
    renderEmailParagraph(eventDescription),
    renderEmailParagraph(`<strong>Name:</strong> ${escapeHtml(memberName)}`),
    renderEmailParagraph(`<strong>Email:</strong> ${escapeHtml(memberEmail)}`),
    renderEmailParagraph(
      `<strong>${isApproval ? "Requested" : "Joined"}:</strong> ${escapeHtml(timeLabel)}`,
    ),
  ];
  if (event.type === "successful_join" && provider === "x" && event.xHandle) {
    body.push(renderEmailParagraph(`<strong>X account:</strong> ${escapeHtml(event.xHandle)}`));
  }
  if (proofUrl) {
    body.push(renderEmailButton({ href: proofUrl, label: `View ${providerLabel} proof` }));
  }
  body.push(renderEmailButton({ href: adminUrl, label: isApproval ? "Review in Admin" : "Open Admin" }));

  const html = renderBrandedEmailShell({
    title: isApproval ? "New approval request" : "New member joined",
    preheader,
    subtitle: SITE_NAME,
    bodyHtml: body.join(""),
    footerHtml: renderSystemEmailFooter(
      "You are receiving this because you enabled new-user notification emails in your administrator settings.",
    ),
  });
  const textLines = [
    isApproval ? "New approval request" : "New member joined",
    "",
    eventDescription,
    "",
    `Name: ${memberName}`,
    `Email: ${memberEmail}`,
    `${isApproval ? "Requested" : "Joined"}: ${timeLabel}`,
  ];
  if (event.type === "successful_join" && provider === "x" && event.xHandle) textLines.push(`X account: ${event.xHandle}`);
  if (proofUrl) textLines.push(`${providerLabel} proof: ${proofUrl}`);
  textLines.push("", `Admin: ${adminUrl}`);
  return { subject, html, text: textLines.join("\n") };
}

function eventDigest(event: AdminSignupNotificationEvent) {
  return createHash("sha256")
    .update([event.type, event.memberUserId, event.occurredAt].join("\n"))
    .digest("hex")
    .slice(0, 48);
}

export async function queueAdminSignupNotification(event: AdminSignupNotificationEvent) {
  const { enqueueBackgroundJob } = runtime();
  const recipients = await listAdminRecipients(event);
  if (!recipients.length) {
    return { queued: false, recipientCount: 0, reason: "no_eligible_recipients" as const };
  }
  const payload: AdminSignupNotificationJobPayload = {
    event,
    member: await getMember(event),
  };
  const queued = await enqueueBackgroundJob({
    kind: "admin_signup_notification",
    mode: "live",
    sourceId: event.memberUserId,
    createdBy: null,
    idempotencyKey: `admin-signup:${eventDigest(event)}`,
    payload: payload as unknown as Record<string, unknown>,
    recipients,
  });
  return {
    queued: true,
    recipientCount: recipients.length,
    jobId: queued.job.id,
    duplicate: queued.duplicate,
    dispatched: queued.dispatched,
    failedToDispatch: queued.failedToDispatch,
  };
}

export async function getCurrentEligibleAdminSignupNotificationRecipient(
  recipient: BackgroundJobRecipient,
  event: AdminSignupNotificationEvent,
) {
  const { documentClient, isValidEmail, normalizeEmail, successfulJoinOption, tableName } = runtime();
  if (!recipient.userId || !recipient.email) return null;
  if (event.type === "successful_join" && successfulJoinOption === null) return null;
  const result = await documentClient.get({
    TableName: tableName,
    Key: userKey(recipient.userId),
    ConsistentRead: true,
  });
  const user = result.Item as RawUser | undefined;
  const email = normalizeEmail(user?.email);
  const optedIn =
    event.type === "approval_requested"
      ? user?.adminSignupApprovalRequestedEmailOptIn === true
      : user?.adminSignupSuccessfulJoinEmailOptIn === true;
  if (
    !user?.id ||
    user.id !== recipient.userId ||
    normalizeEmail(recipient.email) !== email ||
    !isValidEmail(email) ||
    user.isAdmin !== true ||
    !isAccountActive(user) ||
    user.emailSuppressed === true ||
    !optedIn
  ) return null;
  return user;
}
