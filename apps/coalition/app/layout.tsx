import "./globals.css";
import { Providers } from "./providers";
import { MainNav } from "@/components/site/main-nav";
import { AdminViewModeBanner } from "@/components/admin/AdminViewMode";
import { Inter } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { COMMUNITY_GUIDELINES_PATH, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal-config";

export const metadata = {
  title: "PGPZ Coalition | Pretty Good Policy for Zcash",
  description: "The Pretty Good Policy for Zcash partner workspace for policy resources, messaging, and coalition campaigns.",
};

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`} data-scroll-behavior="smooth">
      <body className="font-sans min-h-screen bg-background text-foreground">
        <Providers>
          <Suspense fallback={null}>
            <MainNav />
          </Suspense>
          <AdminViewModeBanner />
          <main className="relative min-h-[calc(100vh-5rem)] bg-[linear-gradient(180deg,var(--brand-paper)_0%,#ffffff_58%,var(--brand-paper)_100%)] pb-16 pt-8">
            {children}
          </main>
          <footer className="border-t border-[rgba(47,111,104,0.22)] bg-[var(--brand-paper)] px-5 py-10 text-sm text-slate-600">
            <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="space-y-4">
                <Link
                  href="/"
                  aria-label="Pretty Good Policy for Zcash Coalition home"
                  title="Go to the Coalition home page"
                  className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zcash-gold)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--brand-paper)]"
                >
                  <Image
                    src="/brand/pgpz-coalition-on-light.svg"
                    alt="Pretty Good Policy for Zcash Coalition"
                    width={1578}
                    height={750}
                    className="h-20 w-auto"
                    unoptimized
                  />
                </Link>
                <p className="max-w-2xl text-xs leading-5 text-slate-600">
                  Pretty Good Policy for Zcash (PGPZ) is independent and is not an official Zcash or Zcash
                  Foundation website, service, or product. It is not affiliated with or endorsed by
                  the Zcash Foundation.
                </p>
              </div>
              <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-3 lg:justify-end">
                <Link className="font-medium text-[var(--brand-denim)] underline" href={TERMS_PATH}>
                  Terms of Service
                </Link>
                <Link className="font-medium text-[var(--brand-denim)] underline" href={PRIVACY_PATH}>
                  Privacy Policy
                </Link>
                <Link className="font-medium text-[var(--brand-denim)] underline" href={COMMUNITY_GUIDELINES_PATH}>
                  Coalition Guidelines
                </Link>
              </nav>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
