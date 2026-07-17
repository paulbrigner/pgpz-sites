import "server-only";

import { NextRequest } from "next/server";
import { resolveAppSession } from "@/lib/app-session";

export async function hasPolicyUpdateResourceAccess(request: NextRequest) {
  const session = await resolveAppSession(request.headers);
  const user = session?.user;
  if (!user?.id) return { allowed: false, isAdmin: false };

  const isAdmin = user.isAdmin === true;
  return {
    allowed: user.membershipStatus === "active" || isAdmin,
    isAdmin,
  };
}
