import "./globals.css";
import { Providers } from "./providers";
import { MainNav } from "@/components/site/main-nav";
import { Inter } from "next/font/google";
import Link from "next/link";
import { COMMUNITY_GUIDELINES_PATH, PRIVACY_PATH, TERMS_PATH } from "@/lib/legal-config";

export const metadata = {
  title: "PGPZ Community",
  description: "Community home for PGPZ updates, resources, and early members.",
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
          <MainNav />
          <main className="relative min-h-[calc(100vh-3.5rem)] bg-[linear-gradient(180deg,var(--brand-ice)_0%,#ffffff_72%)] pb-16 pt-8">
            {children}
          </main>
          <footer className="border-t border-[rgba(245,168,0,0.22)] bg-white px-5 py-6 text-sm text-slate-600">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>PGPZ Community</p>
              <div className="flex flex-wrap gap-4">
                <Link className="font-medium text-[var(--brand-denim)] underline" href={TERMS_PATH}>
                  Terms of Service
                </Link>
                <Link className="font-medium text-[var(--brand-denim)] underline" href={PRIVACY_PATH}>
                  Privacy Policy
                </Link>
                <Link className="font-medium text-[var(--brand-denim)] underline" href={COMMUNITY_GUIDELINES_PATH}>
                  Community Guidelines
                </Link>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
