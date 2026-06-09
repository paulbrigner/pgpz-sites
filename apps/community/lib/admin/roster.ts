import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

type RawUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  xHandle?: string | null;
  linkedinUrl?: string | null;
  isAdmin?: boolean | null;
  welcomeEmailSentAt?: string | null;
  lastEmailSentAt?: string | null;
  lastEmailType?: string | null;
  emailBounceReason?: string | null;
  emailSuppressed?: boolean | null;
  membershipStatus?: "active" | "none" | null;
  membershipProvider?: string | null;
  membershipVerifiedAt?: string | null;
  membershipProofPostUrl?: string | null;
  membershipProofPostId?: string | null;
  proofRetentionPolicy?: string | null;
};

export type AdminMember = {
  id: string;
  name: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  xHandle: string | null;
  linkedinUrl: string | null;
  membershipStatus: "active" | "none";
  membershipProvider: string | null;
  membershipVerifiedAt: string | null;
  membershipProofPostUrl: string | null;
  membershipProofPostId: string | null;
  proofRetentionPolicy: string | null;
  isAdmin: boolean;
  welcomeEmailSentAt: string | null;
  lastEmailSentAt: string | null;
  lastEmailType: string | null;
  emailBounceReason: string | null;
  emailSuppressed: boolean | null;
};

export type AdminRoster = {
  members: AdminMember[];
  meta: {
    total: number;
    active: number;
    none: number;
    admins: number;
  };
};

export type BuildAdminRosterOptions = {
  statusFilter?: "all" | "active" | "none";
};

async function scanUsers(): Promise<RawUser[]> {
  const items: RawUser[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.scan({
      TableName: TABLE_NAME,
      FilterExpression: "#type = :user",
      ProjectionExpression:
        "id, #name, email, firstName, lastName, xHandle, linkedinUrl, isAdmin, welcomeEmailSentAt, lastEmailSentAt, lastEmailType, emailBounceReason, emailSuppressed, membershipStatus, membershipProvider, membershipVerifiedAt, membershipProofPostUrl, membershipProofPostId, proofRetentionPolicy",
      ExpressionAttributeNames: { "#type": "type", "#name": "name" },
      ExpressionAttributeValues: { ":user": "USER" },
      ExclusiveStartKey,
    });

    if (res.Items) {
      for (const item of res.Items) items.push(item as RawUser);
    }
    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return items;
}

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length ? value.trim() : null;

const memberName = (user: RawUser) => {
  const name = textOrNull(user.name);
  if (name) return name;
  const composed = [user.firstName, user.lastName].map(textOrNull).filter(Boolean).join(" ");
  return composed || null;
};

function toAdminMember(user: RawUser): AdminMember | null {
  if (!user.id) return null;
  const membershipStatus = user.membershipStatus === "active" ? "active" : "none";

  return {
    id: user.id,
    name: memberName(user),
    email: textOrNull(user.email),
    firstName: textOrNull(user.firstName),
    lastName: textOrNull(user.lastName),
    xHandle: textOrNull(user.xHandle),
    linkedinUrl: textOrNull(user.linkedinUrl),
    membershipStatus,
    membershipProvider: textOrNull(user.membershipProvider),
    membershipVerifiedAt: textOrNull(user.membershipVerifiedAt),
    membershipProofPostUrl: textOrNull(user.membershipProofPostUrl),
    membershipProofPostId: textOrNull(user.membershipProofPostId),
    proofRetentionPolicy: textOrNull(user.proofRetentionPolicy),
    isAdmin: !!user.isAdmin,
    welcomeEmailSentAt: textOrNull(user.welcomeEmailSentAt),
    lastEmailSentAt: textOrNull(user.lastEmailSentAt),
    lastEmailType: textOrNull(user.lastEmailType),
    emailBounceReason: textOrNull(user.emailBounceReason),
    emailSuppressed: typeof user.emailSuppressed === "boolean" ? user.emailSuppressed : null,
  };
}

export async function buildAdminRoster(options: BuildAdminRosterOptions = {}): Promise<AdminRoster> {
  const statusFilter = options.statusFilter || "all";
  const rawUsers = await scanUsers();
  const members = rawUsers
    .map(toAdminMember)
    .filter((member): member is AdminMember => !!member)
    .filter((member) => statusFilter === "all" || member.membershipStatus === statusFilter)
    .sort((a, b) => {
      const aName = a.lastName || a.name || a.email || "";
      const bName = b.lastName || b.name || b.email || "";
      return aName.localeCompare(bName, undefined, { sensitivity: "base" });
    });

  return {
    members,
    meta: {
      total: members.length,
      active: members.filter((member) => member.membershipStatus === "active").length,
      none: members.filter((member) => member.membershipStatus === "none").length,
      admins: members.filter((member) => member.isAdmin).length,
    },
  };
}
