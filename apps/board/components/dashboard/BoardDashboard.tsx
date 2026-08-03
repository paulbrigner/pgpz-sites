import { Badge, Container, SectionHeading, Surface } from "@pgpz/ui";
import { CalendarDays, FileText, Landmark, LockKeyhole, Users } from "lucide-react";

export type BoardMember = Readonly<{
  name: string;
  email: string;
}>;

const workspaceSections = [
  {
    icon: FileText,
    title: "Meeting materials",
    body: "Agendas, minutes, and briefing packets prepared for upcoming board meetings.",
    note: "Placeholder — materials land here once the workspace is populated.",
  },
  {
    icon: Landmark,
    title: "Decisions & resolutions",
    body: "Recorded board decisions, resolutions, and action items with owners and dates.",
    note: "Placeholder — decision records land here once the workspace is populated.",
  },
  {
    icon: Users,
    title: "Committee workspace",
    body: "Working space for board committees and ad hoc director working groups.",
    note: "Placeholder — committee space lands here once the workspace is populated.",
  },
] as const;

export function BoardDashboard({ member }: { member: BoardMember }) {
  return (
    <>
      <Container className="pb-16 pt-10 sm:pt-14">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Board of Directors</Badge>
            <Badge>Private</Badge>
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">
            Welcome, {member.name}.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
            This portal is the private workspace for the PGPZ Board of Directors.
            Meeting materials, decisions, and committee work will live here.
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            Signed in as <span className="font-semibold text-[var(--foreground)]">{member.email}</span>.
          </p>
        </section>
      </Container>

      <section className="border-y border-[var(--border)] bg-white/55 py-16 sm:py-20">
        <Container>
          <SectionHeading
            eyebrow="Board workspace"
            title="Everything the directors need, in one private place."
            description="These sections are scaffolded and ready for the board administrator to populate."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {workspaceSections.map(({ icon: Icon, title, body, note }, index) => (
              <Surface key={title} className="group p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-slate-400">0{index + 1}</span>
                </div>
                <h2 className="mt-8 text-xl font-semibold tracking-[-0.025em] text-[var(--foreground)]">{title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">{body}</p>
                <p className="mt-4 flex items-center gap-2 text-xs leading-5 text-slate-400">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {note}
                </p>
              </Surface>
            ))}
          </div>
        </Container>
      </section>

      <Container className="py-16 sm:py-20">
        <Surface tone="dark" className="overflow-hidden p-8 sm:p-12">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[var(--accent)]">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-7 font-display text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">
              Access stays limited to the current board roster.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/68">
              Sign-up is disabled, every page requires authentication, the roster is enforced from
              <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">BOARD_MEMBER_EMAILS</code>,
              and the site refuses search indexing at every layer.
            </p>
          </div>
        </Surface>
      </Container>
    </>
  );
}
