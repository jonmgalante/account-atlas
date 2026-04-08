"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addRecentReport } from "@/lib/recent-reports";
import type { ApiResponse } from "@/lib/types/api";
import type { CreateReportResponse } from "@/lib/types/report";
import { reportRequestSchema } from "@/lib/validation/report-request";

export function ReportUrlForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [companyUrl, setCompanyUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const urlFromQuery = searchParams.get("url");

    if (urlFromQuery) {
      setCompanyUrl(urlFromQuery);
    }
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = reportRequestSchema.safeParse({ companyUrl });

    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? "Enter a valid public company URL.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      });

      const payload = (await response.json()) as ApiResponse<CreateReportResponse>;

      if (!response.ok || !payload.ok) {
        setErrorMessage(payload.ok ? "Unable to start the report right now." : payload.error.message);
        return;
      }

      addRecentReport({
        shareId: payload.data.shareId,
        companyUrl: payload.data.report.normalizedInputUrl,
        createdAt: payload.data.report.createdAt,
      });

      router.push(`/reports/${payload.data.shareId}`);
    } catch {
      setErrorMessage("Unable to start the report right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="overflow-hidden border-white/80 bg-white/84 shadow-panel">
      <CardHeader className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Start a report run</div>
        <CardTitle className="text-3xl text-primary sm:text-[2.1rem]">Submit a public company URL</CardTitle>
        <CardDescription className="text-base leading-7 text-muted-foreground">
          Account Atlas creates the public report URL immediately, starts the research pipeline, and keeps the report
          pinned in this browser for easy revisit during a demo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="company-url">
              Company URL
            </label>
            <Input
              id="company-url"
              name="companyUrl"
              value={companyUrl}
              onChange={(event) => setCompanyUrl(event.target.value)}
              placeholder="https://example.com"
              autoComplete="url"
              spellCheck={false}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? "company-url-error" : undefined}
            />
          </div>

          {errorMessage ? (
            <div
              id="company-url-error"
              className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}

          <Button className="w-full" disabled={isSubmitting} size="lg" type="submit">
            {isSubmitting ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Starting public report run
              </>
            ) : (
              <>
                Start account research
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>

        <div className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4 text-sm leading-7 text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Public-app guardrails
          </div>
          <ul className="mt-3 space-y-2">
            <li>Only public `http` and `https` URLs are accepted.</li>
            <li>`localhost`, raw IP hosts, custom ports, and private-network targets are blocked.</li>
            <li>Recent completed or in-flight reports for the same company may be reused instead of starting a new run.</li>
            <li>Anonymous report creation is rate-limited.</li>
            <li>Each major recommendation is expected to resolve to known sources, not invented citations.</li>
          </ul>
        </div>

        <div className="rounded-[1.75rem] border border-primary/10 bg-gradient-to-br from-secondary/75 via-white to-background p-4 text-sm leading-7 text-secondary-foreground">
          After submission you land on the public report page immediately, follow the live run status, and review the
          same share link as the research and planning sections complete.
        </div>
      </CardContent>
    </Card>
  );
}
