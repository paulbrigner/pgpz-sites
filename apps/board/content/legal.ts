export type BoardLegalDocument = {
  title: string;
  eyebrow: string;
  summary: string;
  sections: ReadonlyArray<{
    title: string;
    paragraphs: readonly string[];
  }>;
};

export const boardTerms: BoardLegalDocument = {
  title: "Board Portal Terms",
  eyebrow: "Private access",
  summary: "Terms for using the private PGPZ Board of Directors portal.",
  sections: [
    {
      title: "Authorized access",
      paragraphs: [
        "The board portal at board.pgpz.org is private. Access is limited to current members of the PGPZ Board of Directors whose email addresses are on the application roster. Accounts are provisioned by the board administrator and self-registration is disabled.",
      ],
    },
    {
      title: "Confidential materials",
      paragraphs: [
        "Meeting materials, decisions, and committee work hosted here may be confidential to the board. Directors must not share portal content, links, or credentials outside the board unless the board has explicitly agreed otherwise.",
      ],
    },
    {
      title: "Account responsibility",
      paragraphs: [
        "Each director is responsible for keeping their sign-in credentials safe and for reporting suspected unauthorized use to the board administrator promptly.",
      ],
    },
    {
      title: "Availability",
      paragraphs: [
        "The portal is provided for board operations as-is. It may change or be unavailable during maintenance without advance notice.",
      ],
    },
  ],
};

export const boardPrivacy: BoardLegalDocument = {
  title: "Board Portal Privacy Notice",
  eyebrow: "Minimal data surface",
  summary: "How the private board portal handles director data.",
  sections: [
    {
      title: "Account data",
      paragraphs: [
        "The portal stores only the information needed to authorize and sign users in: name, email address, Board role and access status, and authentication records. Magic-link tokens are hashed and expire after ten minutes. Passkey records contain the public credential material and device metadata required by WebAuthn; the corresponding private key remains with the user's authenticator.",
        "During the passwordless transition, an existing account may also retain a Better Auth scrypt password hash. Passwords will be removed after the guarded cutover, once every active user has verified passwordless access.",
        "Authenticated access is tracked with session records carrying the user's stable identity and a signed, expiring token. Sessions are deleted on sign-out, administrator revocation, or access deactivation.",
      ],
    },
    {
      title: "Not indexed",
      paragraphs: [
        "The portal refuses search indexing at every layer: robots.txt, page metadata, and response headers all instruct engines not to index, follow, or archive the site.",
      ],
    },
    {
      title: "Operational logs and rate limiting",
      paragraphs: [
        "Hosting and security infrastructure may process ordinary request information such as timestamps, requested paths, network addresses (IP), and browser user-agent details for reliability and abuse prevention.",
        "Sign-in attempts are rate-limited. Rate-limit metadata (attempt counts keyed by network address and window) is stored in the portal's own database table and expires automatically.",
      ],
    },
    {
      title: "Governance audit ledger",
      paragraphs: [
        "As a governance hub, the portal keeps an append-only audit ledger of authentication and governance-document activity. For each event it records a stable user identity or the claimed email of a failed sign-in, the board role and capability snapshot, the action and outcome, a target identifier and exact version where relevant, and timing.",
        "Ledger entries are cryptographically hash-chained so tampering, deletion, or reordering is detectable, and are retained (never erased) in a separate, encrypted, write-only store. Password hashes, session tokens, cookies, and file contents are never written to the ledger. Access to the ledger is limited to board administrators, the Executive Director, and Legal Counsel.",
      ],
    },
    {
      title: "Service email only",
      paragraphs: [
        "The portal sends only authentication and account-recovery messages needed to operate Board access. It does not send newsletters or marketing email.",
      ],
    },
    {
      title: "Questions",
      paragraphs: [
        "Questions about this notice may be directed to board@pgpz.org. Do not send sensitive personal information.",
      ],
    },
  ],
};
