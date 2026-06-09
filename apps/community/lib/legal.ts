import { LEGAL_CONTACT_EMAIL, LEGAL_DOCUMENT_VERSION } from "@/lib/legal-config";

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export type LegalDocument = {
  title: string;
  eyebrow: string;
  description: string;
  version: string;
  sections: LegalSection[];
};

export const termsDocument: LegalDocument = {
  title: "Terms of Service",
  eyebrow: "PGPZ COMMUNITY",
  description:
    "These Terms of Service apply to your use of community.pgpz.org.",
  version: LEGAL_DOCUMENT_VERSION,
  sections: [
    {
      title: "Terms of Service",
      paragraphs: [
        'These Terms of Service apply to your use of community.pgpz.org (the "Service"). By creating an account, posting in the forums, or using the Service, you agree to these Terms.',
      ],
    },
    {
      title: "1. Accounts",
      paragraphs: [
        "You may need an account to use some parts of the Service. When you create an account, you agree to provide accurate, current, and complete information, including your first and last name, X handle, LinkedIn URL, and email address, and to keep that information up to date.",
      ],
    },
    {
      title: "2. Forums and user content",
      paragraphs: [
        "The Service may include forums, discussion spaces, and other community features. Anything you post may be visible to other users and, depending on the feature, may be visible to visitors or made searchable by search engines.",
        "You are responsible for the content you submit. Do not post anything unlawful, misleading, infringing, harassing, or otherwise harmful.",
      ],
    },
    {
      title: "3. Community rules",
      paragraphs: [
        "You agree not to misuse the Service. This includes attempting to access accounts or data without permission, sending spam, uploading malware, scraping the Service without authorization, or interfering with the operation of the Service.",
        "We may set and update community rules or moderation standards from time to time. Those rules are part of your use of the Service.",
      ],
    },
    {
      title: "4. Moderation and enforcement",
      paragraphs: [
        "We may review content, investigate reports, remove or limit content, issue warnings, suspend or terminate accounts, and take other steps we believe are reasonably necessary to protect the Service and its users.",
        "We may keep moderation records relating to reports, decisions, and enforcement actions.",
      ],
    },
    {
      title: "5. Email communications",
      paragraphs: [
        "We may send account notices, service announcements, policy updates, and email blasts. If we send promotional or newsletter-style email, you may opt out by using the unsubscribe link or by contacting us.",
        "You may still receive important transactional or account-related messages even if you opt out of marketing email.",
      ],
    },
    {
      title: "6. Intellectual property",
      paragraphs: [
        "The Service, including our logos, design, and software, belongs to us or our licensors and is protected by law. Except for content you submit, you may not copy, modify, distribute, or create derivative works from the Service unless we give you permission.",
        "You keep ownership of content you submit, but you grant us a non-exclusive license to host, display, process, and otherwise use that content as needed to operate the Service and provide it to other users where intended.",
      ],
    },
    {
      title: "7. Disclaimers",
      paragraphs: [
        'The Service is provided on an "as is" and "as available" basis. We do not promise that it will be uninterrupted, error-free, or secure. To the fullest extent allowed by law, we disclaim warranties of merchantability, fitness for a particular purpose, and non-infringement.',
      ],
    },
    {
      title: "8. Limitation of liability",
      paragraphs: [
        "To the fullest extent permitted by law, we will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, data, or goodwill, arising out of or related to your use of the Service.",
      ],
    },
    {
      title: "9. Changes and contact",
      paragraphs: [
        "We may update these Terms from time to time. If we make a material change, we will post the updated Terms on the Service and update the effective date.",
        `If you have questions about these Terms, contact us at ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};

export const privacyDocument: LegalDocument = {
  title: "Privacy Policy",
  eyebrow: "PGPZ COMMUNITY",
  description:
    "This Privacy Policy explains how community.pgpz.org collects, uses, shares, and protects information.",
  version: LEGAL_DOCUMENT_VERSION,
  sections: [
    {
      title: "Privacy Policy",
      paragraphs: [
        'This Privacy Policy explains how community.pgpz.org (the "Service") collects, uses, shares, and protects information when you use accounts, forums, and related features.',
      ],
    },
    {
      title: "1. Information we collect",
      paragraphs: [
        "We collect information you provide directly, such as your first and last name, X handle, LinkedIn URL, email address, account credentials, forum posts, messages, support requests, and preferences.",
        "We also collect information automatically, such as IP address, browser type, device information, page views, referring pages, log data, and cookie identifiers.",
      ],
    },
    {
      title: "2. How we use information",
      paragraphs: [
        "We use information to operate and improve the Service, create and manage accounts, display profiles and forum activity, send service messages and email blasts, monitor for abuse, and comply with legal obligations.",
        "We may also use information to understand how the Service is used and to improve performance, content, and community safety.",
      ],
    },
    {
      title: "3. Accounts and profile information",
      paragraphs: [
        "If you create an account, we may store and display the profile information you provide, including your first and last name, X handle, LinkedIn URL, and email address.",
        "Depending on the settings of the Service, some profile information may be visible to other users.",
      ],
    },
    {
      title: "4. Forums and user-generated content",
      paragraphs: [
        "Content you post in forums or other public or semi-public areas may be visible to other users and, depending on the feature, to visitors or search engines.",
        "Please do not post sensitive personal information unless you are comfortable with it being seen, copied, or stored by others.",
      ],
    },
    {
      title: "5. Moderation logs",
      paragraphs: [
        "We may keep moderation logs and related records when we review reports, remove or restrict content, warn or suspend accounts, or otherwise enforce community rules.",
        "These records may include account identifiers, usernames, profile details, forum content under review, reports, timestamps, moderation decisions, and related notes.",
      ],
    },
    {
      title: "6. Analytics",
      paragraphs: [
        "We use analytics tools to understand how people use the Service and to improve features, content, and usability. Analytics may measure page visits, clicks, navigation patterns, session duration, referral sources, and device or browser information.",
        "Analytics data may be processed in aggregated or pseudonymized form, depending on the tool and your interactions with the Service.",
      ],
    },
    {
      title: "7. Cookies and similar technologies",
      paragraphs: [
        "We use cookies, local storage, and similar technologies to keep you signed in, remember preferences, support account features, measure traffic, and improve security and performance.",
        "You can usually control cookies through your browser settings, but some parts of the Service may not work properly if cookies are disabled.",
      ],
    },
    {
      title: "8. Email blasts and messages",
      paragraphs: [
        "We may send email blasts, newsletters, event notices, account alerts, service updates, and policy changes. Where required by law, we will only send promotional email if you have opted in or if another lawful basis applies.",
        "You may opt out of promotional email by using the unsubscribe link in the message or contacting us directly. Transactional or account-related email may still be sent when needed.",
      ],
    },
    {
      title: "9. How we share information",
      paragraphs: [
        "We do not sell your personal information. We may share information with service providers that help us host the Service, send email, provide analytics, secure the Service, or moderate content.",
        "We may also share information when required by law, to protect our rights or users, or in connection with a merger, acquisition, or similar transaction.",
      ],
    },
    {
      title: "10. Retention and security",
      paragraphs: [
        "We keep personal information for as long as reasonably necessary to operate the Service, maintain accounts, enforce our rules, resolve disputes, and comply with legal obligations.",
        "We use reasonable safeguards designed to protect information, but no method of transmission or storage is completely secure.",
      ],
    },
    {
      title: "11. Your choices and rights",
      paragraphs: [
        `Depending on where you live, you may have rights to access, correct, delete, object to, restrict, or receive a copy of your personal information. To make a request, contact us at ${LEGAL_CONTACT_EMAIL}.`,
        "We may need to verify your identity before responding.",
      ],
    },
    {
      title: "12. Children",
      paragraphs: [
        "The Service is not intended for children under 16, as applicable. We do not knowingly collect personal information from children without appropriate consent where required by law.",
      ],
    },
    {
      title: "13. Changes and contact",
      paragraphs: [
        "We may update this Privacy Policy from time to time. If we make a material change, we will post the updated policy on the Service and update the effective date.",
        `If you have questions about this Privacy Policy, contact us at ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
  ],
};
