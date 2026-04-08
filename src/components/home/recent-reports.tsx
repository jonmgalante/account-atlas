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

  return (
    <Card className="border-white/80 bg-white/78 shadow-panel">
      <CardHeader className="space-y-3">
        <CardTitle className="text-2xl">Recent reports</CardTitle>
        <p className="text-sm leading-7 text-muted-foreground">
          This browser keeps a local list of reports you opened or created here so you can jump back into share links
          quickly during iteration or a recorded demo.
        </p>
      </CardHeader>
      <CardContent>
        {reports.length === 0 ? (
          <div className="atlas-orbit relative overflow-hidden rounded-[2rem] border border-dashed border-border bg-background/72 p-6">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-[3.5rem] -translate-y-[1.5rem] rounded-full bg-primary/15"
            />
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 translate-x-[3.2rem] -translate-y-[0.5rem] rounded-full bg-accent/20"
            />
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-[0.25rem] translate-y-[3.25rem] rounded-full bg-primary/20"
            />
            <div className="relative z-10 mx-auto max-w-sm text-center">
              <div className="text-sm font-medium text-foreground">No recent reports yet</div>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                Submit a public company URL and the first report link will stay pinned here for quick revisit.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report, index) => (
              <Link
                key={report.shareId}
                href={`/reports/${report.shareId}`}
                className="flex items-start justify-between gap-3 rounded-[1.5rem] border border-border/70 bg-background/70 p-4 transition hover:border-primary/30 hover:bg-background"
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                    Recent report {index + 1}
                  </div>
                  <div className="truncate font-medium text-foreground">{report.companyUrl}</div>
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatDateTime(report.createdAt)}
                  </div>
                </div>
                <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-primary" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
