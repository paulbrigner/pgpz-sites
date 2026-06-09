"use client";

import { useMemo, useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Menu, X } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const sanitizeAuthCallback = (pathname: string | null, query: string | null) => {
  const path = pathname || "/";
  if (/^\/signin(?:\/|$)/.test(path)) return "/";
  if (/^\/api\/auth(?:\/|$)/.test(path)) return "/";
  return query && query.length ? `${path}?${query}` : path;
};

export function MainNav() {
  const { data: session, status } = useSession();
  const authenticated = status === "authenticated";
  const isAdmin = !!(session?.user as any)?.isAdmin;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const callbackUrl = useMemo(() => {
    const q = searchParams?.toString();
    return sanitizeAuthCallback(pathname, q || null);
  }, [pathname, searchParams]);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [navLoading, setNavLoading] = useState(false);

  const signInHref = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  const joinHref = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}&reason=signup`;

  const linkClasses = cn(
    navigationMenuTriggerStyle(),
    "rounded-full border border-[rgba(245,168,0,0.22)] bg-transparent px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--brand-cloud)] transition hover:border-[rgba(245,168,0,0.45)] hover:bg-[rgba(245,168,0,0.1)] hover:text-white"
  );
  const externalLinkClasses = cn(
    navigationMenuTriggerStyle(),
    "rounded-full border border-[rgba(245,168,0,0.7)] bg-[rgba(245,168,0,0.12)] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--zcash-gold-soft)] shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition hover:border-[var(--zcash-gold)] hover:bg-[rgba(245,168,0,0.2)] hover:text-white"
  );

  useEffect(() => {
    setMobileOpen(false);
    setNavLoading(false);
  }, [pathname, status]);

  const closeMobileMenu = () => setMobileOpen(false);
  const mobileMenuId = "main-nav-mobile-menu";
  const mobileToggleClasses =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(245,168,0,0.34)] bg-[rgba(245,168,0,0.12)] text-white transition hover:border-[rgba(245,168,0,0.55)] hover:bg-[rgba(245,168,0,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zcash-gold)]";
  const mobileMenuItemClasses =
    "block w-full rounded-full border border-[rgba(245,168,0,0.28)] px-5 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-white/90 transition hover:border-[rgba(245,168,0,0.55)] hover:bg-[rgba(245,168,0,0.12)]";

  const mobileMenuItems = authenticated
    ? [
        { key: "home", label: "Home", href: "/" },
        { key: "profile", label: "Profile", href: "/settings/profile" },
        ...(isAdmin
          ? [{
              key: "admin",
              label: "Admin",
              href: "/admin",
              action: () => {
                setNavLoading(true);
                closeMobileMenu();
                router.push("/admin");
              },
            }] : []),
        { key: "pgpz", label: "PGPZ", href: "https://pgpz.org", external: true },
        {
          key: "logout",
          label: "Log out",
          action: async () => {
            closeMobileMenu();
            try {
              await signOut({ callbackUrl: "/" });
            } catch {
              router.push("/");
            }
          },
        },
      ]
    : [
        { key: "home", label: "Home", href: "/" },
        { key: "join", label: "Join", href: joinHref },
        { key: "signin", label: "Sign in", href: signInHref },
        { key: "pgpz", label: "PGPZ", href: "https://pgpz.org", external: true },
      ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[rgba(245,168,0,0.22)] bg-[linear-gradient(135deg,var(--brand-ink),#2A2111)] text-white shadow-[0_22px_48px_-32px_rgba(30,30,30,0.65)] backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-3 text-sm font-bold uppercase tracking-[0.4em] text-white"
        >
          <span className="relative inline-flex h-9 w-9 overflow-hidden rounded-full border border-[rgba(245,168,0,0.5)] bg-[rgba(245,168,0,0.12)]">
            <Image
              src="/pgp_profile_image.png"
              alt="PGPZ"
              fill
              sizes="36px"
              className="object-cover"
              priority
            />
          </span>
          PGPZ Community
        </Link>
        <NavigationMenu className="hidden items-center gap-2 lg:flex">
          <NavigationMenuList className="space-x-2">
            <NavigationMenuItem>
              <NavigationMenuLink className={linkClasses} asChild>
                <Link href="/">Home</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            {authenticated ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={linkClasses} asChild>
                  <Link href="/settings/profile">Profile</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated && isAdmin ? (
              <NavigationMenuItem>
                <button
                  type="button"
                  className={linkClasses}
                  onClick={() => {
                    setNavLoading(true);
                    router.push("/admin");
                  }}
                >
                  Admin
                </button>
              </NavigationMenuItem>
            ) : null}

            {!authenticated ? (
              <>
                <NavigationMenuItem>
                  <NavigationMenuLink className={linkClasses} asChild>
                    <Link href={joinHref}>Join</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink className={linkClasses} asChild>
                    <Link href={signInHref}>Sign in</Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </>
            ) : null}

            {authenticated ? (
              <NavigationMenuItem>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await signOut({ callbackUrl: "/" });
                    } catch {
                      router.push("/");
                    }
                  }}
                  className={linkClasses}
                >
                  Log out
                </button>
              </NavigationMenuItem>
            ) : null}

            <NavigationMenuItem className="pl-3">
              <NavigationMenuLink className={externalLinkClasses} asChild>
                <Link href="https://pgpz.org" target="_blank" rel="noopener noreferrer">
                  PGPZ
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            {navLoading ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[rgba(245,168,0,0.12)] px-3 py-1 text-xs text-white">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading...
              </span>
            ) : null}
          </NavigationMenuList>
        </NavigationMenu>
        <div className="relative flex items-center lg:hidden">
          <button
            type="button"
            className={mobileToggleClasses}
            aria-expanded={mobileOpen}
            aria-controls={mobileMenuId}
            aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
          {mobileOpen ? (
            <div
              id={mobileMenuId}
              className="absolute right-0 top-12 w-[min(82vw,22rem)] rounded-2xl border border-[rgba(245,168,0,0.26)] bg-[rgba(30,30,30,0.96)] p-3 shadow-2xl backdrop-blur-md"
            >
              <div className="flex flex-col gap-2">
                {mobileMenuItems.map((item) => {
                  if ("action" in item && item.action) {
                    return (
                      <button key={item.key} type="button" className={mobileMenuItemClasses} onClick={item.action}>
                        {item.label}
                      </button>
                    );
                  }
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener noreferrer" : undefined}
                      className={mobileMenuItemClasses}
                      onClick={closeMobileMenu}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                {navLoading ? (
                  <span className="inline-flex items-center justify-center gap-1 rounded-full bg-[rgba(245,168,0,0.12)] px-3 py-2 text-xs text-white">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading...
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
