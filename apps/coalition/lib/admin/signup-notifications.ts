import "server-only";

import { createHash } from "node:crypto";
import { isAccountActive } from "@pgpz/core";
import {
  enqueueBackgroundJob,
  type BackgroundJobRecipient,
} from "@/lib/admin/background-jobs";
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
      method: "x_self_verification" | "admin_invitation";
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
    SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION !== null &&
    user?.adminSignupSuccessfulJoinEmailOptIn === true,
});

const preferenceOptions = () => ({
  approvalRequested: {
    label: "Approval requests",
    description: "Email me when a signed-in user requests membership approval.",
  },
  successfulJoin: SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION,
});

const deliveryFromUser = (user: RawUser | null | undefined) => {
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
  const userId = adminUserId.trim();
  if (!userId) throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);

  const result = await documentClient.get({
    TableName: TABLE_NAME,
    Key: userKey(userId),
    ConsistentRead: true,
  });
  const user = result.Item as RawUser | undefined;
  if (!user || user.isAdmin !== true || !isAccountActive(user)) {
    throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);
  }
  return user;
}

const preferenceResponse = (user: RawUser | null | undefined) => ({
  recipientEmail: normalizeEmail(user?.email) || null,
  delivery: deliveryFromUser(user),
  preferences: preferencesFromUser(user),
  options: preferenceOptions(),
});

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
  const userId = adminUserId.trim();
  if (!userId) throw new AdminSignupNotificationPreferenceError("Admin access required.", 403);
  if (typeof preferences.approvalRequested !== "boolean" || typeof preferences.successfulJoin !== "boolean") {
    throw new AdminSignupNotificationPreferenceError("Notification preferences must be true or false.");
  }
  if (SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION === null && preferences.successfulJoin) {
    throw new AdminSignupNotificationPreferenceError("Successful-join notifications are not available for this site.");
  }

  const now = new Date().toISOString();
  try {
    const result = await documentClient.update({
      TableName: TABLE_NAME,
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
          SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION === null ? false : preferences.successfulJoin,
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
  if (event.type === "successful_join" && SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION === null) return [];

  const recipients: BackgroundJobRecipient[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await documentClient.scan({
      TableName: TABLE_NAME,
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
  const result = await documentClient.get({
    TableName: TABLE_NAME,
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
  const memberName = getUserDisplayName(member) || "New user";
  const subjectMemberName =
    memberName.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "New user";
  const memberEmail = normalizeEmail(member.email) || "Not available";
  const adminUrl = `${SITE_URL.replace(/\/+$/, "")}/admin`;
  const timeLabel = formattedTimestamp(event.occurredAt);
  const isApproval = event.type === "approval_requested";
  const isInvitation = event.type === "successful_join" && event.method === "admin_invitation";
  const subject = isApproval
    ? `[${SITE_NAME}] Approval requested: ${subjectMemberName}`
    : isInvitation
      ? `[${SITE_NAME}] New member joined: ${subjectMemberName}`
      : `[${SITE_NAME}] New member self-verified: ${subjectMemberName}`;
  const preheader = isApproval
    ? `${memberName} is waiting for an administrator's review.`
    : isInvitation
      ? `${memberName} accepted an administrator invitation.`
      : `${memberName} successfully joined through X self-verification.`;
  const eventDescription = isApproval
    ? "A signed-in user requested membership approval and is now waiting for an administrator's review."
    : isInvitation
      ? "A new member accepted an administrator invitation and activated their membership."
      : "A new member successfully activated their membership through X self-verification.";

  const body = [
    renderEmailParagraph(eventDescription),
    renderEmailParagraph(`<strong>Name:</strong> ${escapeHtml(memberName)}`),
    renderEmailParagraph(`<strong>Email:</strong> ${escapeHtml(memberEmail)}`),
    renderEmailParagraph(
      `<strong>${isApproval ? "Requested" : "Joined"}:</strong> ${escapeHtml(timeLabel)}`,
    ),
  ];
  if (event.type === "successful_join" && event.xHandle) {
    body.push(renderEmailParagraph(`<strong>X account:</strong> ${escapeHtml(event.xHandle)}`));
  }
  if (event.type === "successful_join" && event.proofPostUrl) {
    body.push(renderEmailButton({ href: event.proofPostUrl, label: "View X proof post" }));
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
  if (event.type === "successful_join" && event.xHandle) textLines.push(`X account: ${event.xHandle}`);
  if (event.type === "successful_join" && event.proofPostUrl) textLines.push(`X proof: ${event.proofPostUrl}`);
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
  if (!recipient.userId || !recipient.email) return null;
  if (event.type === "successful_join" && SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION === null) return null;
  const result = await documentClient.get({
    TableName: TABLE_NAME,
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
