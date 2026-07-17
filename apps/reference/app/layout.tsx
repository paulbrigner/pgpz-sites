import { NonProductionBanner } from "@pgpz/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { referenceMetadata, referenceViewport } from "@/config/metadata";
import "./globals.css";

export const metadata = referenceMetadata;
export const viewport = referenceViewport;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <NonProductionBanner>
          Reference build only — no accounts, production data, administrative writes, or outbound email.
        </NonProductionBanner>
        <SiteHeader />
        <main id="main-content" className="min-h-[70vh]">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
