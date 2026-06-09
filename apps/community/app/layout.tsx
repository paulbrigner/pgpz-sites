import "./globals.css";
import { Providers } from "./providers";
import { MainNav } from "@/components/site/main-nav";
import { Inter } from "next/font/google";

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
        </Providers>
      </body>
    </html>
  );
}
