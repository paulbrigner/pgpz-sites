import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      xHandle?: string | null;
      linkedinUrl?: string | null;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      membershipStatus?: "active" | "none" | null;
      membershipProvider?: "x" | string | null;
      membershipVerifiedAt?: string | null;
      membershipProofPostUrl?: string | null;
      membershipProofPostId?: string | null;
      proofRetentionPolicy?: string | null;
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
    xHandle?: string | null;
    linkedinUrl?: string | null;
    email?: string | null;
    membershipStatus?: "active" | "none" | null;
    membershipProvider?: "x" | string | null;
    membershipVerifiedAt?: string | null;
    membershipProofPostUrl?: string | null;
    membershipProofPostId?: string | null;
    proofRetentionPolicy?: string | null;
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
    membershipStatus?: "active" | "none" | null;
    membershipProvider?: "x" | string | null;
    membershipVerifiedAt?: string | null;
    membershipProofPostUrl?: string | null;
    membershipProofPostId?: string | null;
    proofRetentionPolicy?: string | null;
    manualApprovalStatus?: "none" | "pending" | "approved" | string | null;
    manualApprovalRequestedAt?: string | null;
    manualApprovalApprovedAt?: string | null;
    isAdmin?: boolean | null;
  }
}
