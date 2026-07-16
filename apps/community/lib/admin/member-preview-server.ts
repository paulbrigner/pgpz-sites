import "server-only";

import { cookies } from "next/headers";
import { ADMIN_MEMBER_PREVIEW_COOKIE, isMemberPreviewCookieValue } from "@/lib/admin/member-preview";

export async function isMemberPreviewRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return isMemberPreviewCookieValue(cookieStore.get(ADMIN_MEMBER_PREVIEW_COOKIE)?.value);
}
