import { Suspense } from "react";
import { Container, Surface } from "@pgpz/ui";
import { SignInForm } from "./signin-form";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
};

export default function SignInPage() {
  return (
    <Container className="flex min-h-[70vh] items-center justify-center py-16">
      <Surface className="w-full max-w-md overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-8 py-7">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary)]">
            Private portal
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            Board sign in
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Access is restricted to current PGPZ Board of Directors members.
          </p>
        </div>
        <Suspense>
          <SignInForm />
        </Suspense>
      </Surface>
    </Container>
  );
}
