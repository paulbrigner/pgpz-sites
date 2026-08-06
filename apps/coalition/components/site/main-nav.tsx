"use client";

import { useMemo, useState, useEffect } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, Loader2, Menu, X } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { useAppSession } from "@/lib/use-app-session";
import { useAdminViewMode } from "@/components/admin/AdminViewMode";
import { isFeatureEnabled } from "@/config/features";

const sanitizeAuthCallback = (pathname: string | null, query: string | null) => {
  const path = pathname || "/";
  if (/^\/signin(?:\/|$)/.test(path)) return "/";
  if (/^\/api\/auth(?:\/|$)/.test(path)) return "/";
  return query && query.length ? `${path}?${query}` : path;
};

const navHrefIsCurrent = (pathname: string | null, href: string) => {
  if (!pathname || !href.startsWith("/")) return false;
  const hrefPath = href.split(/[?#]/, 1)[0] || "/";
  return hrefPath === "/"
    ? pathname === "/"
    : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
};

export function MainNav() {
  const { data: session, status, signOut } = useAppSession();
  const authenticated = status === "authenticated";
  const isMember = session?.capabilities.member === true;
  const { actualIsAdmin, effectiveIsAdmin: isAdmin, viewAsMember, setViewAsMember } = useAdminViewMode();
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
    "rounded-full border border-[rgba(47,111,104,0.22)] bg-transparent px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--brand-cloud)] transition hover:border-[rgba(47,111,104,0.45)] hover:bg-[rgba(47,111,104,0.1)] hover:text-white"
  );
  const externalLinkClasses = cn(
    navigationMenuTriggerStyle(),
    "rounded-full border border-[rgba(47,111,104,0.7)] bg-[rgba(47,111,104,0.12)] px-4 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--zcash-gold-soft)] shadow-[0_0_0_1px_rgba(255,255,255,0.06)] transition hover:border-[var(--zcash-gold)] hover:bg-[rgba(47,111,104,0.2)] hover:text-white"
  );

  useEffect(() => {
    setMobileOpen(false);
    setNavLoading(false);
  }, [pathname, status]);

  const closeMobileMenu = () => setMobileOpen(false);
  const enterMemberView = () => {
    setViewAsMember(true);
    closeMobileMenu();
    router.push("/");
  };
  const mobileMenuId = "main-nav-mobile-menu";
  const desktopNavigationClasses = actualIsAdmin
    ? "hidden items-center gap-2 2xl:flex"
    : "hidden items-center gap-2 lg:flex";
  const mobileNavigationClasses = actualIsAdmin ? "2xl:hidden" : "lg:hidden";
  const mobileToggleClasses =
    "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(47,111,104,0.34)] bg-[rgba(47,111,104,0.12)] text-white transition hover:border-[rgba(47,111,104,0.55)] hover:bg-[rgba(47,111,104,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zcash-gold)]";
  const mobileMenuItemClasses =
    "block w-full rounded-full border border-[rgba(47,111,104,0.28)] px-5 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-white/90 transition hover:border-[rgba(47,111,104,0.55)] hover:bg-[rgba(47,111,104,0.12)]";
  const currentMenuItemClasses =
    "border-[var(--zcash-gold)] bg-[var(--zcash-gold)] text-[var(--brand-ink)] shadow-[0_0_0_1px_rgba(255,255,255,0.16)] hover:border-[var(--zcash-gold-soft)] hover:bg-[var(--zcash-gold-soft)] hover:text-[var(--brand-ink)]";

  const mobileMenuItems = authenticated
    ? [
        { key: "home", label: "Home", href: "/" },
        { key: "groups", label: "Policy Groups", href: "/groups" },
        ...(isMember ? [{ key: "members", label: "Members", href: "/members" }] : []),
        ...(isMember ? [{ key: "resources", label: "Resources", href: "/resources" }] : []),
        ...(isMember && isFeatureEnabled("letterSignons")
          ? [{ key: "letters", label: "Letters", href: "/letters" }]
          : []),
        { key: "updates", label: "Updates", href: "/updates" },
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
        ...(actualIsAdmin && !viewAsMember
          ? [{ key: "member-view", label: "View as member", action: enterMemberView }]
          : []),
        { key: "pgpz", label: "About", href: "https://pgpz.org", external: true },
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
        { key: "join", label: "Request Access", href: joinHref },
        { key: "signin", label: "Sign in", href: signInHref },
        { key: "pgpz", label: "About", href: "https://pgpz.org", external: true },
      ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[rgba(13,31,32,0.96)] text-white shadow-[0_22px_48px_-32px_rgba(13,31,32,0.82)] backdrop-blur-md">
      <div
        className={cn(
          "mx-auto flex h-20 w-full items-center justify-between px-5",
          actualIsAdmin ? "max-w-[96rem]" : authenticated ? "max-w-6xl" : "max-w-[86rem]",
        )}
      >
        <Link
          href="/"
          aria-label="Pretty Good Policy for Zcash Coalition home"
          title="Go to the Coalition home page"
          className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zcash-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--brand-evergreen)]"
        >
          <Image
            src="/brand/pgpz-coalition-on-dark.svg"
            alt="Pretty Good Policy for Zcash Coalition"
            width={1578}
            height={750}
            className="h-12 w-auto sm:h-14"
            priority
            unoptimized
          />
        </Link>
        <NavigationMenu aria-label="Primary navigation" className={desktopNavigationClasses}>
          <NavigationMenuList className="space-x-2">
            <NavigationMenuItem>
              <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/") && currentMenuItemClasses)} asChild>
                <Link href="/" aria-current={navHrefIsCurrent(pathname, "/") ? "page" : undefined}>Home</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>

            {authenticated ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/groups") && currentMenuItemClasses)} asChild>
                  <Link href="/groups" aria-current={navHrefIsCurrent(pathname, "/groups") ? "page" : undefined}>Groups</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated && isMember ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/members") && currentMenuItemClasses)} asChild>
                  <Link href="/members" aria-current={navHrefIsCurrent(pathname, "/members") ? "page" : undefined}>Members</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated && isMember ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/resources") && currentMenuItemClasses)} asChild>
                  <Link href="/resources" aria-current={navHrefIsCurrent(pathname, "/resources") ? "page" : undefined}>Resources</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated && isMember && isFeatureEnabled("letterSignons") ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/letters") && currentMenuItemClasses)} asChild>
                  <Link href="/letters" aria-current={navHrefIsCurrent(pathname, "/letters") ? "page" : undefined}>Letters</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/updates") && currentMenuItemClasses)} asChild>
                  <Link href="/updates" aria-current={navHrefIsCurrent(pathname, "/updates") ? "page" : undefined}>Updates</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated ? (
              <NavigationMenuItem>
                <NavigationMenuLink className={cn(linkClasses, navHrefIsCurrent(pathname, "/settings/profile") && currentMenuItemClasses)} asChild>
                  <Link href="/settings/profile" aria-current={navHrefIsCurrent(pathname, "/settings/profile") ? "page" : undefined}>Profile</Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ) : null}

            {authenticated && isAdmin ? (
              <NavigationMenuItem>
                <button
                  type="button"
                  className={cn(linkClasses, navHrefIsCurrent(pathname, "/admin") && currentMenuItemClasses)}
                  aria-current={navHrefIsCurrent(pathname, "/admin") ? "page" : undefined}
                  onClick={() => {
                    setNavLoading(true);
                    router.push("/admin");
                  }}
                >
                  Admin
                </button>
              </NavigationMenuItem>
            ) : null}

            {authenticated && actualIsAdmin && !viewAsMember ? (
              <NavigationMenuItem>
                <button type="button" className={linkClasses} onClick={enterMemberView}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  View as member
                </button>
              </NavigationMenuItem>
            ) : null}

            {!authenticated ? (
              <>
                <NavigationMenuItem>
                  <NavigationMenuLink className={linkClasses} asChild>
                    <Link href={joinHref}>Request Access</Link>
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
                <Link
                  href="https://pgpz.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="About Pretty Good Policy for Zcash"
                >
                  About
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
            {navLoading ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-[rgba(47,111,104,0.12)] px-3 py-1 text-xs text-white">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading...
              </span>
            ) : null}
          </NavigationMenuList>
        </NavigationMenu>
        <div className={cn("relative flex items-center", mobileNavigationClasses)}>
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
              className="absolute right-0 top-12 w-[min(82vw,22rem)] rounded-2xl border border-[rgba(47,111,104,0.36)] bg-[rgba(13,31,32,0.98)] p-3 shadow-2xl backdrop-blur-md"
            >
              <div className="flex flex-col gap-2">
                {mobileMenuItems.map((item) => {
                  const current = "href" in item
                    && typeof item.href === "string"
                    && !("external" in item && item.external)
                    && (item.key === "join"
                      ? /^\/signin(?:\/|$)/.test(pathname || "") && searchParams?.get("reason") === "signup"
                      : item.key === "signin"
                        ? /^\/signin(?:\/|$)/.test(pathname || "") && searchParams?.get("reason") !== "signup"
                        : navHrefIsCurrent(pathname, item.href));
                  if ("action" in item && item.action) {
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={cn(mobileMenuItemClasses, current && currentMenuItemClasses)}
                        aria-current={current ? "page" : undefined}
                        onClick={item.action}
                      >
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
                      className={cn(mobileMenuItemClasses, current && currentMenuItemClasses)}
                      aria-current={current ? "page" : undefined}
                      onClick={closeMobileMenu}
                    >
                      {item.label}
                    </Link>
                  );
                })}
                {navLoading ? (
                  <span className="inline-flex items-center justify-center gap-1 rounded-full bg-[rgba(47,111,104,0.12)] px-3 py-2 text-xs text-white">
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
