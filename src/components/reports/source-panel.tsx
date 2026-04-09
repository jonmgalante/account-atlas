"use client";

import { ExternalLink, Files } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date";
import type { ReportSourceRecord } from "@/lib/types/report";

type ReportSourcePanelProps = {
  sources: ReportSourceRecord[];
  selectedSourceIds: number[];
  onClose?: () => void;
  showCloseButton?: boolean;
};

function formatSourceTypeLabel(sourceType: string) {
  return sourceType
    .replace("investor_relations", "investor relations")
    .replace("company_social_profile", "company social")
    .replace("executive_social_profile", "executive social")
    .replace("customer_page", "customers")
    .replace("docs_page", "docs")
    .replace("developer_page", "developer")
    .replaceAll("_", " ");
}

export function ReportSourcePanel({
  sources,
  selectedSourceIds,
  onClose,
  showCloseButton = false,
}: ReportSourcePanelProps) {
  const selectedSources = selectedSourceIds.length
    ? selectedSourceIds
        .map((sourceId) => sources.find((source) => source.id === sourceId))
        .filter((source): source is ReportSourceRecord => Boolean(source))
    : [];
  const hasSelectedSources = selectedSources.length > 0;
  const hasPersistedSources = sources.length > 0;
  const displaySources = selectedSources;

  return (
    <Card
      className={
        hasSelectedSources ? "border-border/70 bg-panel/92 shadow-panel" : "border-border/60 bg-panel/78 shadow-none"
      }
    >
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Evidence detail</div>
            <CardTitle className="text-2xl">Sources</CardTitle>
            <p className="text-sm leading-7 text-foreground/70">
              {hasSelectedSources
                ? "Inspect the cited sources behind the active claims without losing your place."
                : "Select a citation to inspect sources."}
            </p>
          </div>
          {showCloseButton ? (
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">View</div>
            <div className="mt-2 font-medium text-foreground">{hasSelectedSources ? "Selected citations" : "No citation selected"}</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-background/72 p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Sources shown</div>
            <div className="mt-2 font-medium text-foreground">
              {displaySources.length} of {sources.length}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasPersistedSources ? (
          <div className="rounded-[1.75rem] border border-dashed border-border/60 bg-background/70 p-5 text-sm leading-7 text-foreground/70">
            <p>Select a citation to inspect sources.</p>
            <p className="mt-2">Cited sources will appear here as evidence is collected.</p>
          </div>
        ) : !hasSelectedSources ? (
          <div className="rounded-[1.75rem] border border-dashed border-border/60 bg-background/70 p-5 text-sm leading-7 text-foreground/70">
            <p>Select a citation to inspect sources.</p>
            <p className="mt-2">Use the evidence pills in the brief to load the cited sources for the active claim.</p>
          </div>
        ) : (
          displaySources.map((source) => (
            <div key={source.id} className="rounded-[1.75rem] border border-border/70 bg-background/75 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full px-3 py-1">
                      Source {source.id}
                    </Badge>
                    <Badge variant="outline" className="rounded-full px-3 py-1 capitalize">
                      {formatSourceTypeLabel(source.sourceType)}
                    </Badge>
                  </div>
                  <div className="font-medium text-foreground">{source.title}</div>
                  <div className="text-xs text-muted-foreground">{source.canonicalDomain}</div>
                </div>
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open
                  </a>
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/70 bg-card px-3 py-1">Tier: {source.sourceTier}</span>
                {source.publishedAt ? (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1">
                    Published {formatDateTime(source.publishedAt)}
                  </span>
                ) : null}
                {source.retrievedAt ? (
                  <span className="rounded-full border border-border/70 bg-card px-3 py-1">
                    Retrieved {formatDateTime(source.retrievedAt)}
                  </span>
                ) : null}
              </div>

              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                {source.summary ?? "No normalized source summary is available yet for this item."}
              </p>
            </div>
          ))
        )}

        <div className="rounded-[1.75rem] border border-border/70 bg-background/72 p-4 text-sm leading-7 text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Files className="h-4 w-4 text-primary" />
            How citations work
          </div>
          <p className="mt-2">
            Evidence pills always point to known persisted sources from this run. When a citation is missing, the UI
            leaves the claim visibly unsupported instead of inventing one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
