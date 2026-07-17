import { resolveAppSession } from "@/lib/app-session";

export async function getMemberAccess() {
  const session = await resolveAppSession();
  const user = session?.user || null;
  const displayName =
    user?.firstName ||
    user?.name ||
    (typeof user?.email === "string" ? user.email.split("@")[0] : null) ||
    "member";

  return {
    session,
    user,
    authenticated: !!user,
    isMember: user?.membershipStatus === "active",
    displayName,
  };
}
