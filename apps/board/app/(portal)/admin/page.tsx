import { Badge, Container, Surface } from "@pgpz/ui";
import { ShieldCheck } from "lucide-react";
import { requireBoardAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Board Administration",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BoardAdminPage() {
  const admin = await requireBoardAdmin("/admin");

  return (
    <Container className="py-12 sm:py-16">
      <section className="max-w-3xl">
        <Badge tone="accent">Administrator only</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
          Board administration
        </h1>
        <p className="mt-4 text-base leading-7 text-[var(--muted)]">
          Administrator access is active for <span className="font-semibold text-[var(--foreground)]">{admin.email}</span>.
        </p>
      </section>

      <Surface className="mt-10 max-w-3xl p-7 sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 className="mt-6 text-xl font-semibold text-[var(--foreground)]">Administrator controls</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
          The administrator boundary is enforced server-side. Director roster changes and credential provisioning remain guarded operational tasks; no browser-based account mutation API is exposed.
        </p>
      </Surface>
    </Container>
  );
}
