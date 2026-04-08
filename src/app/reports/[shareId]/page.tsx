import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { Container } from "@/components/layout/container";
import { ReportExperience } from "@/components/reports/report-experience";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionFrame } from "@/components/layout/section-frame";
import { createReportService } from "@/server/services/report-service";

type ReportPageProps = {
  params: Promise<{
    shareId: string;
  }>;
};

const reportService = createReportService();

export default async function ReportPage({ params }: ReportPageProps) {
  const { shareId } = await params;
  const pageModel = await reportService.getReportPageModel(shareId);

  if (pageModel.status === "not-found" || pageModel.status === "unavailable") {
    return (
      <SectionFrame className="py-12">
        <Container className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-4 py-2 text-sm text-foreground transition hover:border-primary/30 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to submit
            </Link>
            <Badge className="rounded-full px-4 py-1.5 capitalize" variant="secondary">
              {pageModel.status.replace("-", " ")}
            </Badge>
          </div>

          <Card className="border-white/70 bg-white/85 shadow-panel">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-primary">
                <AlertCircle className="h-4 w-4" />
                {pageModel.title}
              </div>
              <CardTitle className="text-3xl">{pageModel.summary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
              <p>{pageModel.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href="/">Submit a company URL</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>
    );
  }

  const [initialDocument, initialStatus] = await Promise.all([
    reportService.getReportDocument(shareId),
    reportService.getReportStatusShell(shareId),
  ]);

  if (!initialDocument) {
    return (
      <SectionFrame className="py-12">
        <Container>
          <Card className="border-white/70 bg-white/85 shadow-panel">
            <CardContent className="p-6 text-sm leading-7 text-muted-foreground">
              The report metadata exists, but the full public document could not be loaded.
            </CardContent>
          </Card>
        </Container>
      </SectionFrame>
    );
  }

  return <ReportExperience shareId={shareId} initialDocument={initialDocument} initialStatus={initialStatus} />;
}
