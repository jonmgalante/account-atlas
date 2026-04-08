import { ArrowRight, FileSearch, Globe2, Layers3, ShieldCheck } from "lucide-react";

import { RecentReports } from "@/components/home/recent-reports";
import { ReportUrlForm } from "@/components/home/report-url-form";
import { Container } from "@/components/layout/container";
import { SectionFrame } from "@/components/layout/section-frame";
import { SectionHeading } from "@/components/layout/section-heading";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const includedSections = [
  {
    title: "Evidence-backed fact base",
    description:
      "Source-linked company context, account signals, and a clear split between facts, inferences, and stakeholder hypotheses.",
    icon: FileSearch,
  },
  {
    title: "AI readiness and use-case prioritization",
    description:
      "Early guidance on maturity signals, likely platform fit, and the enterprise use cases worth validating first.",
    icon: Layers3,
  },
  {
    title: "Pilot plan and expansion paths",
    description:
      "A practical 90-day pilot outline, discovery questions, expected objections, and credible next-step scenarios.",
    icon: ShieldCheck,
  },
];

const productHighlights = [
  {
    label: "Input",
    value: "One public company URL",
    description: "Start from a company site and let the research graph build outward from known public evidence.",
  },
  {
    label: "Output",
    value: "Shareable report plus exports",
    description: "Every run produces a public report URL and, when complete, downloadable Markdown and PDF artifacts.",
  },
  {
    label: "Trust model",
    value: "Citations, confidence, and uncertainty",
    description: "The product stays explicit about what is known, what is inferred, and where evidence remains thin.",
  },
];

const workflowSteps = [
  {
    title: "Submit the company URL",
    description: "The app validates and normalizes the target, applies public-web guardrails, and starts or reuses a run.",
  },
  {
    title: "Watch the report build",
    description: "The public report page shows pipeline progress, evidence collection, and section-by-section readiness.",
  },
  {
    title: "Review the account plan",
    description: "Read the motion recommendation, top use cases, pilot path, and cited source base in one place.",
  },
];

export default function HomePage() {
  return (
    <>
      <SectionFrame className="overflow-hidden pb-14 pt-8 sm:pt-12">
        <Container className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="space-y-8 pt-2">
            <div className="space-y-6">
              <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.22em]">
                Evidence-backed account planning
              </Badge>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-balance text-5xl leading-tight text-primary sm:text-6xl">
                  From one company URL to a source-backed account plan.
                </h1>
                <p className="max-w-2xl text-balance text-lg leading-8 text-muted-foreground sm:text-xl">
                  Account Atlas researches a public company, assembles a cited fact base, and turns it into a
                  shareable enterprise account plan with explicit confidence, completeness, and uncertainty.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {productHighlights.map((item) => (
                <Card key={item.label} className="border-strong/80 bg-card/78 shadow-panel">
                  <CardHeader className="space-y-2 pb-3">
                    <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      {item.label}
                    </div>
                    <CardTitle className="text-xl leading-snug">{item.value}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-7 text-muted-foreground">{item.description}</CardContent>
                </Card>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-strong/80 bg-card/76 shadow-panel">
                <CardHeader className="space-y-2">
                  <Globe2 className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">Public-company research</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-7 text-muted-foreground">
                  The workflow starts from first-party company pages, then layers in current public signals and linked sources.
                </CardContent>
              </Card>
              <Card className="border-strong/80 bg-card/76 shadow-panel">
                <CardHeader className="space-y-2">
                  <FileSearch className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">Evidence first</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-7 text-muted-foreground">
                  Major recommendations surface source references, and claims stay labeled as facts, inferences, or hypotheses.
                </CardContent>
              </Card>
              <Card className="border-strong/80 bg-card/76 shadow-panel">
                <CardHeader className="space-y-2">
                  <ArrowRight className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl">Built for live demos</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-7 text-muted-foreground">
                  Submit the URL, watch the run progress publicly, and come back through the same shareable report link.
                </CardContent>
              </Card>
            </div>
          </div>

          <ReportUrlForm />
        </Container>
      </SectionFrame>

      <SectionFrame className="pb-16 pt-2">
        <Container className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <Card className="border-strong/80 bg-card/78 shadow-panel">
            <CardHeader className="space-y-4">
              <SectionHeading
                eyebrow="Product flow"
                title="What a completed report covers"
                description="The experience stays honest about evidence quality. Thin evidence is called out directly instead of being padded over."
              />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                {workflowSteps.map((step, index) => (
                  <div key={step.title} className="rounded-[1.5rem] border border-border/70 bg-background/75 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Step {index + 1}
                    </div>
                    <div className="mt-2 font-medium text-foreground">{step.title}</div>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{step.description}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 md:grid-cols-3">
              {includedSections.map(({ title, description, icon: Icon }) => (
                <Card key={title} className="border-border/70 bg-background/70 shadow-none">
                  <CardHeader className="space-y-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-7 text-muted-foreground">{description}</CardContent>
                </Card>
              ))}
              </div>
            </CardContent>
          </Card>

          <RecentReports />
        </Container>
      </SectionFrame>
    </>
  );
}
