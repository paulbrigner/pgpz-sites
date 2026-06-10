import {
  COMMUNITY_GUIDELINES_PDF_PATH,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_PDF_PATH,
} from "@/lib/legal-config";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export type LegalDocument = {
  title: string;
  eyebrow: string;
  description: string;
  version: string;
  pdfPath: string;
  sections: LegalSection[];
};

const serviceName = "PGPZ Coalition";
const serviceUrl = "coalition.pgpz.org";

export const termsDocument: LegalDocument = {
  title: "Terms of Service",
  eyebrow: "PGPZ COALITION",
  description: `These Terms of Service apply to your use of ${serviceUrl}.`,
  version: LEGAL_DOCUMENT_VERSION,
  pdfPath: LEGAL_PDF_PATH,
  sections: [
    {
      title: "Terms of Service",
      paragraphs: [
        `These Terms of Service apply to your use of ${serviceUrl} (the "Service"). By creating an account, requesting access, or using the Service, you agree to these Terms.`,
      ],
    },
    {
      title: "1. Accounts and access",
      paragraphs: [
        "You may need an account and manual approval to use some parts of the Service. When you create an account, you agree to provide accurate, current, and complete information, including your name, LinkedIn URL, and email address, and to keep that information up to date.",
        "Coalition access is selective. We may approve, deny, suspend, or remove access when we believe it is necessary to protect the purpose, trust, or operation of the Service.",
      ],
    },
    {
      title: "2. Coalition materials",
      paragraphs: [
        "The Service may include policy resources, messaging drafts, campaign notes, meeting materials, and other coalition content. Use those materials only in ways consistent with their context, any labels or instructions attached to them, and applicable law.",
        "You are responsible for content you submit. Do not submit anything unlawful, misleading, infringing, confidential without authorization, or otherwise harmful.",
      ],
    },
    {
      title: "3. Appropriate use",
      paragraphs: [
        "Do not misuse the Service. This includes attempting to access accounts or data without permission, sending spam, uploading malware, scraping the Service without authorization, or interfering with operation of the Service.",
        "Do not present coalition materials as final, public, or approved unless they have been clearly designated that way.",
      ],
    },
    {
      title: "4. Moderation and enforcement",
      paragraphs: [
        "We may review content, investigate reports, remove or limit content, suspend or terminate accounts, and take other steps we believe are reasonably necessary to protect the Service and its users.",
      ],
    },
    {
      title: "5. Email communications",
      paragraphs: [
        "We may send account notices, service announcements, policy updates, coalition coordination messages, and email blasts. You may still receive important transactional or account-related messages even if you opt out of optional messages.",
      ],
    },
    {
      title: "6. Intellectual property",
      paragraphs: [
        "The Service, including our logos, design, and software, belongs to us or our licensors and is protected by law. Except for content you submit, you may not copy, modify, distribute, or create derivative works from the Service unless we give you permission.",
        "You keep ownership of content you submit, but you grant us a non-exclusive license to host, display, process, and otherwise use that content as needed to operate the Service.",
      ],
    },
    {
      title: "7. Disclaimers and liability",
      paragraphs: [
        'The Service is provided on an "as is" and "as available" basis. We do not promise that it will be uninterrupted, error-free, or secure.',
        "To the fullest extent permitted by law, we will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, data, or goodwill, arising out of or related to your use of the Service.",
      ],
    },
    {
      title: "8. Changes and contact",
      paragraphs: [
        "We may update these Terms from time to time. If we make a material change, we will post the updated Terms on the Service and update the effective date.",
        `If you have questions about these Terms, contact us at ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const privacyDocument: LegalDocument = {
  title: "Privacy Policy",
  eyebrow: "PGPZ COALITION",
  description: `This Privacy Policy explains how ${serviceUrl} collects, uses, shares, and protects information.`,
  version: LEGAL_DOCUMENT_VERSION,
  pdfPath: LEGAL_PDF_PATH,
  sections: [
    {
      title: "Privacy Policy",
      paragraphs: [
        `This Privacy Policy explains how ${serviceUrl} (the "Service") collects, uses, shares, and protects information when you use coalition accounts, resources, messaging, and related features.`,
      ],
    },
    {
      title: "1. Information we collect",
      paragraphs: [
        "We collect information you provide directly, such as your first and last name, LinkedIn URL, email address, account records, coalition materials, messages, support requests, and preferences.",
        "We also collect information automatically, such as IP address, browser type, device information, page views, referring pages, log data, and cookie identifiers.",
      ],
    },
    {
      title: "2. How we use information",
      paragraphs: [
        "We use information to operate and improve the Service, create and manage accounts, review membership requests, coordinate coalition work, send service messages and email blasts, monitor for abuse, and comply with legal obligations.",
        "We may also use information to understand how the Service is used and to improve performance, content, security, and coalition usefulness.",
      ],
    },
    {
      title: "3. Accounts and profile information",
      paragraphs: [
        "If you create an account, we may store and display the profile information you provide, including your first and last name, LinkedIn URL, and email address.",
        "Some profile or participation information may be visible to other approved coalition members.",
      ],
    },
    {
      title: "4. Coalition content",
      paragraphs: [
        "Content you post or upload in coalition areas may be visible to other approved members and admins.",
        "Please do not post sensitive personal information, confidential third-party information, or materials you are not authorized to share.",
      ],
    },
    {
      title: "5. Email blasts and messages",
      paragraphs: [
        "We may send coalition updates, event notices, account alerts, service updates, and policy coordination messages. Where required by law, we will only send promotional email if you have opted in or if another lawful basis applies.",
        "Transactional or account-related email may still be sent when needed.",
      ],
    },
    {
      title: "6. How we share information",
      paragraphs: [
        "We do not sell your personal information. We may share information with service providers that help us host the Service, send email, secure the Service, or manage coalition operations.",
        "We may also share information when required by law, to protect our rights or users, or in connection with a merger, acquisition, or similar transaction.",
      ],
    },
    {
      title: "7. Retention and security",
      paragraphs: [
        "We keep personal information for as long as reasonably necessary to operate the Service, maintain accounts, enforce our rules, resolve disputes, and comply with legal obligations.",
        "We use reasonable safeguards designed to protect information, but no method of transmission or storage is completely secure.",
      ],
    },
    {
      title: "8. Your choices and rights",
      paragraphs: [
        `Depending on where you live, you may have rights to access, correct, delete, object to, restrict, or receive a copy of your personal information. To make a request, contact us at ${LEGAL_CONTACT_EMAIL}.`,
        "We may need to verify your identity before responding.",
      ],
    },
    {
      title: "9. Changes and contact",
      paragraphs: [
        "We may update this Privacy Policy from time to time. If we make a material change, we will post the updated policy on the Service and update the effective date.",
        `If you have questions about this Privacy Policy, contact us at ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const coalitionGuidelinesDocument: LegalDocument = {
  title: "Coalition Guidelines",
  eyebrow: "PGPZ COALITION",
  description: `These Coalition Guidelines explain how approved members should use ${serviceUrl}.`,
  version: LEGAL_DOCUMENT_VERSION,
  pdfPath: COMMUNITY_GUIDELINES_PDF_PATH,
  sections: [
    {
      title: "Coalition Guidelines",
      paragraphs: [
        "Effective Date: June 10, 2026",
        `These Coalition Guidelines explain how approved members should use ${serviceUrl} and related coalition spaces.`,
      ],
    },
    {
      title: "1. Purpose",
      paragraphs: [
        `${serviceName} exists to help selected Zcash ecosystem partners share resources, align messaging, and coordinate policy campaigns that advance Zcash policy in Washington, DC.`,
        "Keep participation focused on useful, constructive policy coordination.",
      ],
    },
    {
      title: "2. Use trusted judgment",
      paragraphs: [
        "Treat coalition materials and member discussions as working context unless they are clearly marked for public use.",
        "Do not forward, publish, or attribute coalition materials outside the intended audience without permission.",
      ],
    },
    {
      title: "3. Be respectful and accurate",
      paragraphs: [
        "Treat other members with respect. Reasonable disagreement about strategy, messaging, or policy is welcome. Personal attacks are not.",
        "Do not knowingly post false or misleading information. Correct mistakes promptly when you discover them.",
      ],
    },
    {
      title: "4. Protect privacy and confidentiality",
      paragraphs: [
        "Do not share another person's private information without permission.",
        "Do not upload confidential third-party materials unless you are authorized to share them with coalition members.",
      ],
    },
    {
      title: "5. Keep work on mission",
      paragraphs: [
        "Keep resources, comments, and campaign coordination tied to Zcash policy, privacy-preserving digital cash, crypto policy, or related coalition work.",
        "Spam, deceptive promotion, and unrelated self-promotion may be removed.",
      ],
    },
    {
      title: "6. Reporting concerns",
      paragraphs: [
        `If you see content or behavior that violates these Guidelines, contact us at ${LEGAL_CONTACT_EMAIL}.`,
        "Please include enough detail for us to investigate, such as links, screenshots, timestamps, and relevant context.",
      ],
    },
    {
      title: "7. Changes",
      paragraphs: [
        "We may update these Guidelines from time to time. Continued use of the Service after an update becomes effective means you accept the updated Guidelines.",
      ],
    },
  ],
};
