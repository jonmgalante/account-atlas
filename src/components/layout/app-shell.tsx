import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-atlas-grid bg-[size:48px_48px] opacity-20 [mask-image:linear-gradient(to_bottom,white,transparent_85%)]"
      />
      <header className="relative z-10 border-b border-border/80 bg-panel/72 backdrop-blur-xl">
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
              <div className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">ACCOUNT ATLAS</div>
              <div className="text-xs text-foreground/70">Evidence-backed AI account strategy</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-5 text-sm text-foreground/70 md:flex">
              <Link href="/#how-it-works" className="transition hover:text-foreground">
                How it works
              </Link>
            </nav>
            <Button asChild size="sm">
              <Link href="/#generate-report">Generate report</Link>
            </Button>
          </div>
        </Container>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t border-border/80 bg-panel/65 py-6 backdrop-blur-xl">
        <Container className="text-sm text-foreground/70">
          <p>Account Atlas turns public web evidence into shareable AI account briefs.</p>
        </Container>
      </footer>
    </div>
  );
}
