import { SectionFrame } from "@/components/layout/section-frame";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <SectionFrame className="py-16">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="h-5 w-36 animate-pulse rounded-full bg-muted" />
          <div className="h-14 w-full max-w-2xl animate-pulse rounded-3xl bg-muted" />
          <div className="h-6 w-full max-w-xl animate-pulse rounded-full bg-muted" />
        </div>
        <Card className="border-strong/70 bg-card/75">
          <CardHeader className="space-y-3">
            <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
            <div className="h-12 w-full animate-pulse rounded-2xl bg-muted" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-10 w-full animate-pulse rounded-2xl bg-muted" />
            <div className="h-10 w-full animate-pulse rounded-2xl bg-muted" />
          </CardContent>
        </Card>
      </div>
    </SectionFrame>
  );
}
