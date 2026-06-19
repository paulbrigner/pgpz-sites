import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

export async function getMemberAccess() {
  const session = await getServerSession(authOptions as any);
  const user = (session as any)?.user || null;
  const displayName =
    user?.firstName ||
    user?.name ||
    (typeof user?.email === "string" ? user.email.split("@")[0] : null) ||
    "member";

  return {
    session,
    user,
    authenticated: !!session,
    isMember: user?.membershipStatus === "active",
    displayName,
  };
}
