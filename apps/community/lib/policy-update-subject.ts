import { policyUpdateCategoryLabels, type PolicyUpdateCategory } from "@/lib/policy-updates";

export function stripPolicyUpdateTitlePrefix(category: PolicyUpdateCategory, title: string) {
  const cleanTitle = title.replace(/\s+/g, " ").trim();
  if (category === "weekly") {
    return cleanTitle.replace(/^(?:weekly\s+policy\s+memo|weekly\s+update)\s*[:|•-]\s*/i, "").trim();
  }

  return cleanTitle.replace(/^(?:special\s+update|featured\s+update)\s*[:|•-]\s*/i, "").trim();
}

export function policyUpdateEmailSubjectForTitle(category: PolicyUpdateCategory, title: string) {
  const label = policyUpdateCategoryLabels[category];
  const subjectTitle = stripPolicyUpdateTitlePrefix(category, title) || title.replace(/\s+/g, " ").trim();
  return `PGPZ ${label}: ${subjectTitle}`.replace(/\s+/g, " ").trim();
}
