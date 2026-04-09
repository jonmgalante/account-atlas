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
    description: "Get top use cases, buyer hypotheses, motion recommendation, and pilot plan.",
  },
  {
    title: "Trust built in",
    description: "Citations, confidence, completeness, and thin-evidence warnings stay visible.",
  },
];

const sampleOutputItems = [
  {
    title: "Recommended motion",
    description: "ChatGPT workspace, API platform, or hybrid - with rationale and evidence strength.",
  },
  {
    title: "Top use cases",
    description: "Twelve to fifteen use cases generated across functions, with the top three prioritized for action.",
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
    title: "Submit the company website",
    description: "We resolve the business entity and start the research run.",
  },
  {
    title: "Build the evidence base",
    description: "We gather official pages, public documents, investor materials when available, and supporting external signals.",
  },
  {
    title: "Review the account brief",
    description: "You get prioritized AI use cases, a motion recommendation, stakeholder hypotheses, and a 90-day pilot plan.",
  },
];

const trustPoints = [
  "Facts, inferences, and hypotheses are labeled",
  "Major sections show confidence and research completeness",
  "Thin-evidence warnings appear when public signals are weak",
  "Major recommendations link back to sources",
  "The goal is to identify the most credible place to start, not promise certainty",
];

const audienceCards = [
  {
    title: "Account owners",
    description: "Get a credible first-pass account strategy before discovery starts.",
  },
  {
    title: "Solutions teams",
    description: "Spot feasible workflows, dependencies, and pilot paths early.",
  },
  {
    title: "Revenue leaders",
    description: "Standardize account planning with shareable, source-backed briefs.",
  },
];

export default function HomePage() {
  return (
    <>
      <SectionFrame className="overflow-hidden pb-14 pt-8 sm:pt-12">
        <Container className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="space-y-8 pt-2">
            <div className="space-y-6">
              <Badge variant="secondary" className="rounded-full px-4 py-1 text-xs uppercase tracking-[0.22em]">
                FOR ACCOUNT TEAMS
              </Badge>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-balance text-5xl leading-tight text-primary sm:text-6xl">
                  Turn any company URL into an evidence-backed AI account brief.
                </h1>
                <p className="max-w-3xl text-balance text-lg leading-8 text-foreground/80 sm:text-xl">
                  Account Atlas researches a company, builds a cited fact base, prioritizes likely AI use cases,
                  recommends the right motion, and outlines a 90-day pilot plan - with confidence and uncertainty made
                  visible.
                </p>
                <p className="text-sm leading-6 text-foreground/75">
                  Facts, inferences, and hypotheses are clearly labeled.
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
            </div>

            <div className="grid gap-3 md:grid-cols-3">
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
                eyebrow="SAMPLE OUTPUT"
                title="What the report actually gives your team"
                description="Not a generic company summary - an evidence-backed AI account strategy you can use in planning, discovery, and pilot design."
              />
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {sampleOutputItems.map((item) => (
                  <Card key={item.title} className="border-border/70 bg-background/72 shadow-none">
                    <CardHeader className="space-y-3 pb-3">
                      <CardTitle className="text-xl leading-snug">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm leading-6 text-foreground/75">{item.description}</CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <RecentReports />
        </Container>
      </SectionFrame>

      <SectionFrame id="how-it-works" className="pb-16">
        <Container>
          <Card className="border-border/80 bg-card/76 shadow-panel">
            <CardHeader className="space-y-4">
              <SectionHeading
                eyebrow="HOW IT WORKS"
                title="From company website to first-motion plan"
                description="The workflow stays compact: resolve the company, gather public evidence, and return a first-pass AI account brief."
              />
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                {workflowSteps.map((step, index) => (
                  <div key={step.title} className="rounded-[1.5rem] border border-border/70 bg-background/78 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                      Step {index + 1}
                    </div>
                    <div className="mt-2 font-medium text-foreground">{step.title}</div>
                    <p className="mt-2 text-sm leading-6 text-foreground/75">{step.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>

      <SectionFrame className="pb-16">
        <Container className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="border-border/80 bg-card/74 shadow-panel">
            <CardHeader className="space-y-4">
              <SectionHeading
                eyebrow="WHY TEAMS TRUST IT"
                title="Built to stay explicit about evidence quality"
                description="The brief keeps uncertainty visible so teams can judge where to start and what still needs validation."
              />
            </CardHeader>
            <CardContent className="grid gap-3">
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

          <Card className="border-border/80 bg-card/74 shadow-panel">
            <CardHeader className="space-y-4">
              <SectionHeading
                eyebrow="WHO IT'S FOR"
                title="Built for account owners, AEs, SEs, and solutions teams"
                description="Use it to prepare for discovery, shape solution paths, and align around the most credible first motion."
              />
            </CardHeader>
            <CardContent className="grid gap-3">
              {audienceCards.map((item) => (
                <div key={item.title} className="rounded-[1.5rem] border border-border/70 bg-background/76 p-4">
                  <div className="font-medium text-foreground">{item.title}</div>
                  <p className="mt-2 text-sm leading-6 text-foreground/75">{item.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>

      <SectionFrame className="pb-20">
        <Container>
          <Card className="border-border/80 bg-card/80 shadow-panel">
            <CardContent className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <h2 className="text-balance text-3xl leading-tight text-primary sm:text-4xl">
                  Start with a company URL. Leave with an AI account strategy.
                </h2>
                <p className="text-base leading-7 text-foreground/75">
                  Generate a shareable brief with prioritized use cases, motion recommendation, stakeholder
                  hypotheses, citations, and a 90-day pilot plan.
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
