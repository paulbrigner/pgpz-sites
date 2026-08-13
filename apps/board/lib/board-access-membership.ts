import "server-only";

import type { MembershipAdapter, MembershipSubject } from "@pgpz/core/server";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { roleHasBoardAdministration } from "@/lib/board-access";

/** Runtime membership adapter backed by the Board-owned access registry. The
 * registry is authoritative when enabled; missing/deactivated/invited records
 * fail closed and never fall through to deployment allowlists. */
export function createBoardAccessMembershipAdapter(
  repository: Pick<typeof boardAccessRepository, "getByEmail"> = boardAccessRepository,
): MembershipAdapter {
  return {
    mode: "externally-managed",
    async resolve(subject: MembershipSubject) {
      const email = typeof subject.email === "string" ? subject.email.trim().toLowerCase() : "";
      if (!email) return { active: false, reason: "A verified email is required." };
      const access = await repository.getByEmail(email);
      if (!access || access.status !== "active") {
        return { active: false, reason: "Email does not have active Board access." };
      }
      return {
        active: true,
        reason: "Email has active Board access.",
        attributes: {
          source: "board-access-registry",
          role: access.role,
          isAdmin: roleHasBoardAdministration(access.role),
          accessId: access.id,
          accessVersion: access.version,
        },
      };
    },
  };
}
