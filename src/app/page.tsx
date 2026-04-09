import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { RecentReports } from "@/components/home/recent-reports";
import { ReportUrlForm } from "@/components/home/report-url-form";
import { Container } from "@/components/layout/container";
import { SectionFrame } from "@/components/layout/section-frame";
import { SectionHeading } from "@/components/layout/section-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const proofBlocks = [
  {
    title: "One company URL",
    description: "Start from any publicly accessible company website.",
  },
  {
    title: "A usable account brief",
    description: "Get prioritized use cases, motion recommendation, stakeholder hypotheses, and a pilot plan.",
  },
  {
    title: "Shareable from the start",
    description: "Review online, revisit later, and share a single brief link.",
  },
];

const sampleOutputItems = [
  {
    title: "Recommended motion",
    description: "ChatGPT workspace, API platform, or hybrid - with rationale and evidence strength.",
  },
  {
    title: "Top use cases",
    description: "Prioritized workflows across functions, with the strongest starting points surfaced first.",
  },
  {
    title: "Stakeholder map",
    description: "Likely buyer, champion, technical owner, blockers, and discovery questions.",
  },
  {
    title: "90-day pilot plan",
    description: "Scope, systems, success metrics, risks, and expansion gates.",
  },
];

const workflowSteps = [
  {
    title: "Submit company website",
  },
  {
    title: "Build the evidence base",
  },
  {
    title: "Review account brief",
  },
];

const trustPoints = [
  "Facts, inferences, and hypotheses are labeled",
  "Confidence, completeness, and thin-evidence warnings stay visible",
  "Major recommendations link back to sources",
];

export default function HomePage() {
  return (
    <>
      <SectionFrame className="overflow-hidden pb-14 pt-8 sm:pt-12">
        <Container className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
          <div className="flex h-full flex-col gap-8 pt-2">
            <div className="space-y-6">
              <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.22em]">
                FOR ACCOUNT TEAMS
              </Badge>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-balance text-5xl leading-tight text-primary sm:text-6xl">
                  Turn any company website into an evidence-backed account brief.
                </h1>
                <p className="max-w-3xl text-balance text-lg leading-8 text-foreground/80 sm:text-xl">
                  Account Atlas researches a company, builds a cited fact base, prioritizes likely AI use cases,
                  recommends the right motion, and outlines a 90-day pilot plan.
                </p>
              </div>
            </div>

            <div className="mt-auto grid gap-3 md:grid-cols-3">
              {proofBlocks.map((item) => (
                <Card key={item.title} className="border-border/70 bg-card/74 shadow-none">
                  <CardContent className="space-y-2 p-5">
                    <CardTitle className="text-lg leading-snug">{item.title}</CardTitle>
                    <p className="text-sm leading-6 text-foreground/75">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div id="generate-report" className="scroll-mt-24">
            <ReportUrlForm />
          </div>
        </Container>
      </SectionFrame>

      <SectionFrame className="pb-16 pt-2">
        <Container className="space-y-6">
          <Card className="border-border/80 bg-card/78 shadow-panel">
            <CardHeader className="space-y-4">
              <SectionHeading
                eyebrow="INSIDE THE ACCOUNT BRIEF"
                title="What the account brief gives your team"
                description="A source-backed first-pass AI account strategy for planning, discovery, and pilot design."
              />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {sampleOutputItems.map((item) => (
                  <Card key={item.title} className="border-border/70 bg-background/72 shadow-none">
                    <CardHeader className="space-y-2 p-5 pb-2">
                      <CardTitle className="text-lg leading-snug">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-5 pt-0 text-sm leading-6 text-foreground/75">
                      {item.description}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <RecentReports />
        </Container>
      </SectionFrame>

      <SectionFrame id="how-it-works" className="pb-14">
        <Container>
          <Card className="border-border/80 bg-card/76 shadow-panel">
            <CardHeader className="space-y-4">
              <div className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">HOW IT WORKS</p>
                <h2 className="text-balance text-3xl leading-tight text-primary sm:text-4xl">
                  From company website to first motion
                </h2>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {workflowSteps.map((step, index) => (
                  <div key={step.title} className="rounded-[1.5rem] border border-border/70 bg-background/78 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Step {index + 1}
                    </div>
                    <div className="mt-2 font-medium text-foreground">{step.title}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>

      <SectionFrame className="pb-14">
        <Container>
          <Card className="border-border/80 bg-card/74 shadow-panel">
            <CardHeader className="space-y-4">
              <SectionHeading
                eyebrow="WHY TEAMS TRUST IT"
                title="Built to stay explicit about evidence quality"
                description="The brief keeps uncertainty visible so teams can judge where to start and what still needs validation."
              />
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {trustPoints.map((point) => (
                <div
                  key={point}
                  className="rounded-[1.35rem] border border-border/70 bg-background/76 px-4 py-3 text-sm leading-6 text-foreground/80"
                >
                  {point}
                </div>
              ))}
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>

      <SectionFrame className="pb-16">
        <Container>
          <Card className="border-border/80 bg-card/80 shadow-panel">
            <CardContent className="flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-2">
                <h2 className="text-balance text-3xl leading-tight text-primary sm:text-4xl">
                  Generate a shareable, source-backed account brief.
                </h2>
                <p className="text-sm leading-6 text-foreground/70">
                  Built for account owners, AEs, SEs, and solutions teams.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/#generate-report">
                    Generate account brief
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>
    </>
  );
}
