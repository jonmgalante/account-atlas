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
  const displaySources = selectedSources.length > 0 ? selectedSources : sources.slice(0, 3);

  return (
    <Card className="border-white/80 bg-white/92 shadow-panel">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Evidence detail</div>
            <CardTitle className="text-2xl">Source panel</CardTitle>
            <p className="text-sm leading-7 text-muted-foreground">
              Select evidence pills anywhere in the report to inspect the underlying sources without losing your place.
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
            <div className="mt-2 font-medium text-foreground">
              {selectedSources.length > 0 ? "Selected citations" : "Source registry preview"}
            </div>
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
        {displaySources.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border/70 bg-background/72 p-5 text-sm leading-7 text-muted-foreground">
            No sources have been persisted for this run yet. Cited evidence will appear here as crawl and research
            steps commit source records.
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
                <span className="rounded-full border border-border/70 bg-white px-3 py-1">Tier: {source.sourceTier}</span>
                {source.publishedAt ? (
                  <span className="rounded-full border border-border/70 bg-white px-3 py-1">
                    Published {formatDateTime(source.publishedAt)}
                  </span>
                ) : null}
                {source.retrievedAt ? (
                  <span className="rounded-full border border-border/70 bg-white px-3 py-1">
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
            Citation behavior
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
