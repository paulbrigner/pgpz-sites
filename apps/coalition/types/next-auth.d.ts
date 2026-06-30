import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      linkedinUrl?: string | null;
      xHandle?: string | null;
      company?: string | null;
      jobTitle?: string | null;
      memberDirectoryOptIn?: boolean | null;
      policyInterestGroups?: string[] | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      membershipStatus?: "active" | "invited" | "none" | null;
      membershipProvider?: "manual" | "admin_invite" | string | null;
      membershipVerifiedAt?: string | null;
      invitationStatus?: "pending" | "accepted" | string | null;
      manualApprovalStatus?: "none" | "pending" | "approved" | string | null;
      manualApprovalRequestedAt?: string | null;
      manualApprovalApprovedAt?: string | null;
      isAdmin?: boolean | null;
      welcomeEmailSentAt?: string | null;
      lastEmailSentAt?: string | null;
      lastEmailType?: string | null;
      emailBounceReason?: string | null;
      emailSuppressed?: boolean | null;
    };
  }

  interface User {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    linkedinUrl?: string | null;
    xHandle?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    memberDirectoryOptIn?: boolean | null;
    policyInterestGroups?: string[] | null;
    email?: string | null;
    membershipStatus?: "active" | "invited" | "none" | null;
    membershipProvider?: "manual" | "admin_invite" | string | null;
    membershipVerifiedAt?: string | null;
    invitationStatus?: "pending" | "accepted" | string | null;
    manualApprovalStatus?: "none" | "pending" | "approved" | string | null;
    manualApprovalRequestedAt?: string | null;
    manualApprovalApprovedAt?: string | null;
    isAdmin?: boolean | null;
    welcomeEmailSentAt?: string | null;
    lastEmailSentAt?: string | null;
    lastEmailType?: string | null;
    emailBounceReason?: string | null;
    emailSuppressed?: boolean | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    email?: string | null;
    membershipStatus?: "active" | "invited" | "none" | null;
    membershipProvider?: "manual" | "admin_invite" | string | null;
    membershipVerifiedAt?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    xHandle?: string | null;
    memberDirectoryOptIn?: boolean | null;
    policyInterestGroups?: string[] | null;
    invitationStatus?: "pending" | "accepted" | string | null;
    manualApprovalStatus?: "none" | "pending" | "approved" | string | null;
    manualApprovalRequestedAt?: string | null;
    manualApprovalApprovedAt?: string | null;
    isAdmin?: boolean | null;
  }
}
