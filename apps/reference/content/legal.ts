export type ReferenceLegalDocument = {
  title: string;
  eyebrow: string;
  summary: string;
  sections: ReadonlyArray<{
    title: string;
    paragraphs: readonly string[];
  }>;
};

export const referenceTerms: ReferenceLegalDocument = {
  title: "Reference Terms",
  eyebrow: "Demonstration terms",
  summary: "Terms for using this non-production, read-only software demonstration.",
  sections: [
    {
      title: "Purpose",
      paragraphs: [
        "PGPZ Reference is an executable example of shared PGPZ site packages. It is not a membership service, production community, wallet, or source of legal, financial, or policy advice.",
      ],
    },
    {
      title: "Read-only experience",
      paragraphs: [
        "The deployed reference experience does not accept account registration, profile changes, administrative actions, submissions, or outbound email requests. Feature examples use app-owned demonstration content.",
      ],
    },
    {
      title: "External resources",
      paragraphs: [
        "Links in the reference catalog lead to third-party sites. Their operators control their content, availability, terms, and privacy practices.",
      ],
    },
    {
      title: "Availability",
      paragraphs: [
        "This example is provided as-is and may change or be removed without notice. Do not rely on it to store information or deliver a production service.",
      ],
    },
  ],
};

export const referencePrivacy: ReferenceLegalDocument = {
  title: "Reference Privacy Notice",
  eyebrow: "Minimal data surface",
  summary: "How this non-production reference minimizes data collection and state.",
  sections: [
    {
      title: "No application accounts",
      paragraphs: [
        "The reference application does not provide public sign-up or sign-in, create member profiles, or import member data from PGPZ Community or PGPZ Coalition.",
      ],
    },
    {
      title: "Operational logs",
      paragraphs: [
        "Hosting and security infrastructure may process ordinary request information such as timestamps, requested paths, network addresses, and browser details for reliability and abuse prevention.",
      ],
    },
    {
      title: "No marketing delivery",
      paragraphs: [
        "Outbound email, newsletters, invitations, welcome messages, and tracking links are disabled in this deployment.",
      ],
    },
    {
      title: "Questions",
      paragraphs: [
        "Questions about this demonstration may be directed to admin@pgpz.org. Do not send sensitive personal information.",
      ],
    },
  ],
};

export const referenceNotice: ReferenceLegalDocument = {
  title: "Reference Environment Notice",
  eyebrow: "Know what you are viewing",
  summary: "The operating boundaries that distinguish this example from a live PGPZ site.",
  sections: [
    {
      title: "Synthetic by design",
      paragraphs: [
        "Content and configuration are owned by this reference application. No production member, administrator, mailing-list, or private policy-update record belongs here.",
      ],
    },
    {
      title: "Externally managed membership",
      paragraphs: [
        "The configuration declares externally managed membership to prove the shared contract. The deployed example does not connect that contract to an identity provider or membership database.",
      ],
    },
    {
      title: "Safe defaults",
      paragraphs: [
        "Search indexing, authentication, outbound email, administrative mutations, member directories, newsletters, and production storage integrations are disabled.",
      ],
    },
  ],
};
