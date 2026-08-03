import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { boardMetadata, boardViewport } from "@/config/metadata";
import "./globals.css";

export const metadata = boardMetadata;
export const viewport = boardViewport;

// A private portal is never prerendered: the header reflects the request
// session and every route below is gated by the authenticated portal layout.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <SiteHeader />
        <main id="main-content" className="min-h-[70vh]">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
