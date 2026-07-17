import "server-only";

import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import {
  DEFAULT_INVITATION_EMAIL_BODY,
  DEFAULT_INVITATION_EMAIL_SUBJECT,
} from "@/lib/system-email";

export type InvitationEmailTemplate = {
  subject: string;
  body: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
};

export type SaveInvitationEmailTemplateInput = {
  subject: string;
  body: string;
  adminUserId?: string | null;
};

export class InvitationTemplateError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InvitationTemplateError";
    this.status = status;
  }
}

const templateKey = {
  pk: "SETTING#INVITATION_EMAIL_TEMPLATE",
  sk: "SETTING#INVITATION_EMAIL_TEMPLATE",
};

const defaultTemplate = (): InvitationEmailTemplate => ({
  subject: DEFAULT_INVITATION_EMAIL_SUBJECT,
  body: DEFAULT_INVITATION_EMAIL_BODY,
  updatedAt: null,
  updatedBy: null,
  isDefault: true,
});

const normalizeTemplateValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function validateInvitationEmailTemplate(input: SaveInvitationEmailTemplateInput) {
  const subject = normalizeTemplateValue(input.subject);
  const body = normalizeTemplateValue(input.body);

  if (!subject) throw new InvitationTemplateError("Invitation email subject is required.");
  if (!body) throw new InvitationTemplateError("Invitation email body is required.");
  if (subject.length > 180) {
    throw new InvitationTemplateError("Invitation email subject must be 180 characters or fewer.", 413);
  }
  if (body.length > 20000) {
    throw new InvitationTemplateError("Invitation email body must be 20,000 characters or fewer.", 413);
  }

  return { subject, body };
}

export async function getInvitationEmailTemplate(): Promise<InvitationEmailTemplate> {
  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: templateKey,
  });
  const item = res.Item as Record<string, any> | undefined;
  if (!item?.subject || !item?.body) return defaultTemplate();

  return {
    subject: String(item.subject),
    body: String(item.body),
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
    updatedBy: typeof item.updatedBy === "string" ? item.updatedBy : null,
    isDefault: false,
  };
}

export async function saveInvitationEmailTemplate(input: SaveInvitationEmailTemplateInput) {
  const values = validateInvitationEmailTemplate(input);
  const now = new Date().toISOString();

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      ...templateKey,
      type: "SETTING",
      settingName: "INVITATION_EMAIL_TEMPLATE",
      subject: values.subject,
      body: values.body,
      updatedAt: now,
      updatedBy: input.adminUserId || null,
    },
  });

  return {
    ...values,
    updatedAt: now,
    updatedBy: input.adminUserId || null,
    isDefault: false,
  };
}
