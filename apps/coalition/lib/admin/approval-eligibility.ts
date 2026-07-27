export type AdminApprovalEligibility =
  | "requested"
  | "unsubmitted_override"
  | "ineligible";

type ApprovalState = {
  accountStatus?: unknown;
  deactivatedAt?: unknown;
  membershipStatus?: unknown;
  manualApprovalStatus?: unknown;
  applicationStatus?: unknown;
};

const hasValue = (value: unknown) =>
  typeof value === "string" ? value.trim().length > 0 : value != null;

export function getAdminApprovalEligibility(
  state: ApprovalState,
): AdminApprovalEligibility {
  if (state.accountStatus === "deactivated" || hasValue(state.deactivatedAt)) {
    return "ineligible";
  }
  if (
    state.membershipStatus === "active" ||
    state.membershipStatus === "invited" ||
    state.manualApprovalStatus === "approved"
  ) {
    return "ineligible";
  }
  if (state.applicationStatus === "requested") return "requested";

  const membershipUnapproved =
    state.membershipStatus == null ||
    state.membershipStatus === "" ||
    state.membershipStatus === "none";
  const manualApprovalAbsent =
    state.manualApprovalStatus == null ||
    state.manualApprovalStatus === "" ||
    state.manualApprovalStatus === "none";
  const applicationAbsent =
    state.applicationStatus == null ||
    state.applicationStatus === "" ||
    state.applicationStatus === "none";

  return membershipUnapproved && manualApprovalAbsent && applicationAbsent
    ? "unsubmitted_override"
    : "ineligible";
}
