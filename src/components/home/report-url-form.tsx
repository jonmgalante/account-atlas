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

function getLandingErrorMessage(message: string) {
  if (message === "Enter a public company URL. Local and private-network targets are blocked.") {
    return "Enter a publicly accessible company website. Local and private-network targets are blocked.";
  }

  if (message === "Enter a valid public company URL.") {
    return "Enter a valid company website.";
  }

  if (message === "Enter a company domain, not a raw IP address.") {
    return "Enter a company website, not a raw IP address.";
  }

  return message;
}

export function ReportUrlForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [companyUrl, setCompanyUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const urlFromQuery = searchParams?.get("url");

    if (urlFromQuery) {
      setCompanyUrl(urlFromQuery);
    }
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsed = reportRequestSchema.safeParse({ companyUrl });

    if (!parsed.success) {
      setErrorMessage(getLandingErrorMessage(parsed.error.issues[0]?.message ?? "Enter a valid company website."));
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
        setErrorMessage(payload.ok ? "Unable to start the report right now." : getLandingErrorMessage(payload.error.message));
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
    <Card className="overflow-hidden border-border/80 bg-card/84 shadow-panel">
      <CardHeader className="space-y-4">
        <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">GENERATE A REPORT</div>
        <CardTitle className="text-3xl text-primary sm:text-[2.1rem]">Create a shareable account brief</CardTitle>
        <CardDescription className="text-base leading-7 text-foreground/75">
          Enter a company website to generate a cited AI account strategy for your team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-4" onSubmit={handleSubmit} noValidate>
          <div className="space-y-2.5">
            <label className="text-sm font-medium text-foreground" htmlFor="company-url">
              Company website
            </label>
            <Input
              id="company-url"
              name="companyUrl"
              value={companyUrl}
              onChange={(event) => setCompanyUrl(event.target.value)}
              placeholder="https://company.com"
              autoComplete="url"
              spellCheck={false}
              aria-invalid={Boolean(errorMessage)}
              aria-describedby={errorMessage ? "company-url-error" : undefined}
              className="border-border/80 bg-background/90 placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-primary/35"
            />
            <p className="text-sm leading-6 text-foreground/70">
              We use publicly accessible company pages and linked public documents. We will resolve the business entity
              automatically and flag ambiguity when evidence is thin.
            </p>
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
                Generating account brief
              </>
            ) : (
              <>
                Generate account brief
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <p className="text-sm leading-6 text-foreground/70">
            Includes prioritized use cases, motion recommendation, stakeholder hypotheses, and a 90-day pilot plan.
          </p>
        </form>

        <details className="rounded-[1.25rem] bg-background/55 px-4 py-3 text-sm leading-6 text-foreground/70">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <ShieldAlert className="h-4 w-4 text-primary" />
            URL requirements
          </summary>
          <ul className="mt-3 space-y-2">
            <li>Only publicly accessible `http` and `https` URLs are accepted.</li>
            <li>`localhost`, raw IP hosts, custom ports, and private-network targets are blocked.</li>
            <li>Recent in-flight or completed reports for the same company may be reused.</li>
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
