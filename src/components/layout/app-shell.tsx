import Link from "next/link";

import { Container } from "@/components/layout/container";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-atlas-grid bg-[size:48px_48px] opacity-40 [mask-image:linear-gradient(to_bottom,white,transparent_85%)]"
      />
      <header className="relative z-10 border-b border-white/80 bg-white/72 backdrop-blur-xl">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
        />
        <Container className="flex items-center justify-between gap-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/15">
              AA
            </div>
            <div className="space-y-0.5">
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Account Atlas</div>
              <div className="text-xs text-muted-foreground">Evidence-backed enterprise account planning</div>
            </div>
          </Link>
          <div className="hidden items-center gap-3 lg:flex">
            <div className="rounded-full border border-border/80 bg-background/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Public v1
            </div>
            <div className="text-sm text-muted-foreground">
              Public company research, explicit evidence quality, and shareable report links
            </div>
          </div>
        </Container>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-white/80 bg-white/65 py-6 backdrop-blur-xl">
        <Container className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Public company research, evidence-backed planning, and exportable account briefs.</p>
          <p>No auth in v1. Confidence, completeness, and thin-evidence warnings stay visible.</p>
        </Container>
      </footer>
    </div>
  );
}
