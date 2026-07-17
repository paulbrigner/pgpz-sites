export const policyInterestGroupOptions = [
  {
    id: "mining",
    label: "Mining",
    description: "Coordinate on proof-of-work, energy, infrastructure, and mining-policy developments.",
    focusAreas: ["Energy and grid policy", "Proof-of-work narratives", "Mining business impacts"],
  },
  {
    id: "tax",
    label: "Tax",
    description: "Track tax treatment, reporting obligations, accounting issues, and member education needs.",
    focusAreas: ["Reporting rules", "Treasury and IRS activity", "Member tax-policy priorities"],
  },
  {
    id: "privacy",
    label: "Financial privacy",
    description: "Advance civil-liberties, consumer-privacy, and privacy-preserving digital cash arguments.",
    focusAreas: ["Financial privacy rights", "Consumer protection", "Privacy-preserving infrastructure"],
  },
  {
    id: "market-structure",
    label: "Market structure",
    description: "Follow digital-asset market structure legislation and its implications for Zcash.",
    focusAreas: ["Exchange and broker rules", "Token classification", "Legislative markups"],
  },
  {
    id: "developer-policy",
    label: "Developer policy",
    description: "Coordinate on developer protections, non-custodial tools, and software liability boundaries.",
    focusAreas: ["Safe harbors", "Open-source developers", "Non-custodial software"],
  },
  {
    id: "aml-sanctions",
    label: "AML and sanctions",
    description: "Monitor AML, sanctions, illicit-finance, and compliance narratives that affect privacy tools.",
    focusAreas: ["Illicit-finance framing", "Sanctions policy", "Compliance expectations"],
  },
  {
    id: "payments-stablecoins",
    label: "Payments and stablecoins",
    description: "Connect Zcash policy work to payments, stablecoins, and mainstream digital-cash debates.",
    focusAreas: ["Payments policy", "Stablecoin legislation", "Digital cash positioning"],
  },
  {
    id: "state-policy",
    label: "State policy",
    description: "Track state-level bills, regulatory activity, and local advocacy needs.",
    focusAreas: ["State legislation", "Attorney general activity", "Local coalition outreach"],
  },
] as const;

export type PolicyInterestGroupId = (typeof policyInterestGroupOptions)[number]["id"];

const policyInterestGroupIds = new Set<string>(policyInterestGroupOptions.map((option) => option.id));

export function normalizePolicyInterestGroups(value: unknown): PolicyInterestGroupId[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const selected = new Set(
    rawValues
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item): item is PolicyInterestGroupId => policyInterestGroupIds.has(item)),
  );

  return policyInterestGroupOptions
    .map((option) => option.id)
    .filter((id): id is PolicyInterestGroupId => selected.has(id));
}

export function policyInterestGroupLabel(id: string) {
  return policyInterestGroupOptions.find((option) => option.id === id)?.label || id;
}

export function policyInterestGroupLabels(ids: readonly string[] | null | undefined) {
  return normalizePolicyInterestGroups(ids).map(policyInterestGroupLabel);
}

export function policyInterestGroupById(id: string) {
  return policyInterestGroupOptions.find((option) => option.id === id) || null;
}

export function policyInterestGroupPath(id: string) {
  return `/groups/${id}`;
}
