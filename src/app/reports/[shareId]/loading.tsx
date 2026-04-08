import { Container } from "@/components/layout/container";
import { SectionFrame } from "@/components/layout/section-frame";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function ReportLoading() {
  return (
    <SectionFrame className="py-12">
      <Container className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6">
          <div className="flex items-center justify-between gap-3">
            <div className="h-10 w-36 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-32 animate-pulse rounded-full bg-muted" />
          </div>

          <Card className="border-white/80 bg-white/82 shadow-panel">
            <CardHeader className="space-y-5">
              <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
              <div className="h-12 w-4/5 animate-pulse rounded-3xl bg-muted" />
              <div className="h-5 w-2/3 animate-pulse rounded-full bg-muted" />
              <div className="grid gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
                    <div className="h-3 w-20 animate-pulse rounded-full bg-muted" />
                    <div className="mt-3 h-5 w-3/4 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              </div>
              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-4">
                <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
                <div className="mt-3 h-10 w-full animate-pulse rounded-3xl bg-muted" />
              </div>
            </CardHeader>
          </Card>

          <div className="rounded-[1.75rem] border border-white/80 bg-white/82 px-3 py-3 shadow-panel">
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-10 w-24 animate-pulse rounded-full bg-muted" />
              ))}
            </div>
          </div>

          <Card className="border-white/80 bg-white/82 shadow-panel">
            <CardHeader className="space-y-4">
              <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
              <div className="h-7 w-44 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-muted" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-12 animate-pulse rounded-full bg-muted" />
                </div>
                <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-muted" />
                <div className="mt-3 h-3 w-40 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/70 p-5">
                    <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-full animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-5/6 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="border-white/80 bg-white/78">
                <CardContent className="space-y-3 p-5">
                  <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
                  <div className="h-5 w-1/2 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-4/5 animate-pulse rounded-full bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="hidden border-white/80 bg-white/84 shadow-panel xl:block">
          <CardHeader className="space-y-4">
            <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
            <div className="h-8 w-40 animate-pulse rounded-full bg-muted" />
            <div className="grid gap-3">
              <div className="h-16 animate-pulse rounded-[1.5rem] bg-background/70" />
              <div className="h-16 animate-pulse rounded-[1.5rem] bg-background/70" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-[1.5rem] border border-border/70 bg-background/70 p-4">
                <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
                <div className="h-5 w-full animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </CardContent>
        </Card>
      </Container>
    </SectionFrame>
  );
}
