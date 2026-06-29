export const REFERRAL_QUERY_PARAM = "ref";

export const normalizeReferralCode = (value: unknown) => {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  return /^[a-z0-9_-]{6,48}$/.test(normalized) ? normalized : "";
};
