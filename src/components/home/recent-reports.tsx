"use client";

import Link from "next/link";
import { Clock3, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date";
import {
  RECENT_REPORTS_UPDATED_EVENT,
  type RecentReportRecord,
  readRecentReports,
} from "@/lib/recent-reports";

export function RecentReports() {
  const [reports, setReports] = useState<RecentReportRecord[]>([]);

  useEffect(() => {
    const sync = () => {
      setReports(readRecentReports());
    };

    sync();
    window.addEventListener(RECENT_REPORTS_UPDATED_EVENT, sync);

    return () => {
      window.removeEventListener(RECENT_REPORTS_UPDATED_EVENT, sync);
    };
  }, []);

  if (reports.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/72 shadow-none">
      <CardHeader className="space-y-3">
        <CardTitle className="text-2xl">Recent reports</CardTitle>
        <p className="text-sm leading-6 text-foreground/70">
          Saved locally in this browser so you can jump back into existing share links quickly.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {reports.map((report, index) => (
            <Link
              key={report.shareId}
              href={`/reports/${report.shareId}`}
              className="flex items-start justify-between gap-3 rounded-[1.5rem] border border-border/70 bg-background/75 p-4 transition hover:border-primary/30 hover:bg-background"
            >
              <div className="min-w-0 space-y-1">
                <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                  Recent report {index + 1}
                </div>
                <div className="truncate font-medium text-foreground">{report.companyUrl}</div>
                <div className="inline-flex items-center gap-2 text-xs text-foreground/65">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatDateTime(report.createdAt)}
                </div>
              </div>
              <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-primary" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
