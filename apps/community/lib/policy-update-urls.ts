/** Public reading URLs. Community continues to own administration and delivery. */
export const PUBLIC_POLICY_UPDATES_URL = "https://pgpz.org/updates";

export const getPublicPolicyUpdateUrl = (slug: string) =>
  `${PUBLIC_POLICY_UPDATES_URL}/${encodeURIComponent(slug)}`;

export const getPublicPolicyUpdatePdfUrl = (slug: string) =>
  `${getPublicPolicyUpdateUrl(slug)}/document.pdf`;
