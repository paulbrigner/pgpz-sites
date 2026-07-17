"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Eye, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ADMIN_MEMBER_PREVIEW_COOKIE, isEffectiveAdmin } from "@/lib/admin/member-preview";
import { useAppSession } from "@/lib/use-app-session";

type AdminViewModeContextValue = {
  actualIsAdmin: boolean;
  effectiveIsAdmin: boolean;
  viewAsMember: boolean;
  setViewAsMember: (enabled: boolean) => void;
};

const AdminViewModeContext = createContext<AdminViewModeContextValue>({
  actualIsAdmin: false,
  effectiveIsAdmin: false,
  viewAsMember: false,
  setViewAsMember: () => undefined,
});

const readPreviewCookie = () =>
  typeof document !== "undefined" &&
  document.cookie
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${ADMIN_MEMBER_PREVIEW_COOKIE}=1`);

const writePreviewCookie = (enabled: boolean) => {
  if (typeof document === "undefined") return;
  document.cookie = enabled
    ? `${ADMIN_MEMBER_PREVIEW_COOKIE}=1; Path=/; SameSite=Lax`
    : `${ADMIN_MEMBER_PREVIEW_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export function AdminViewModeProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useAppSession();
  const actualIsAdmin = status === "authenticated" && (session?.user as any)?.isAdmin === true;
  const [viewAsMember, setViewAsMemberState] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!actualIsAdmin) {
      writePreviewCookie(false);
      setViewAsMemberState(false);
      return;
    }
    setViewAsMemberState(readPreviewCookie());
  }, [actualIsAdmin, status]);

  const setViewAsMember = useCallback(
    (enabled: boolean) => {
      const next = actualIsAdmin && enabled;
      writePreviewCookie(next);
      setViewAsMemberState(next);
    },
    [actualIsAdmin],
  );

  const value = useMemo(
    () => ({
      actualIsAdmin,
      effectiveIsAdmin: isEffectiveAdmin(actualIsAdmin, viewAsMember),
      viewAsMember,
      setViewAsMember,
    }),
    [actualIsAdmin, setViewAsMember, viewAsMember],
  );

  return <AdminViewModeContext.Provider value={value}>{children}</AdminViewModeContext.Provider>;
}

export function useAdminViewMode() {
  return useContext(AdminViewModeContext);
}

export function AdminViewModeBanner() {
  const { actualIsAdmin, viewAsMember, setViewAsMember } = useAdminViewMode();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (actualIsAdmin && viewAsMember && pathname?.startsWith("/admin")) {
      router.replace("/");
    }
  }, [actualIsAdmin, pathname, router, viewAsMember]);

  if (!actualIsAdmin || !viewAsMember) return null;

  return (
    <aside
      className="sticky top-16 z-40 border-b border-amber-300 bg-amber-100 px-5 py-2.5 text-amber-950 shadow-sm"
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Viewing as a member.</strong> Admin navigation and page controls are hidden; your account still has administrator access.
          </span>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-amber-500 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-amber-950 transition hover:bg-amber-50"
          onClick={() => {
            setViewAsMember(false);
            router.refresh();
          }}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Exit member view
        </button>
      </div>
    </aside>
  );
}
