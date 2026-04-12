"use client";

import { Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getDisplaySourceId, resolveSourceByCitationId } from "@/lib/canonical-report";
import type { ReportSourceRecord } from "@/lib/types/report";

type EvidencePillsProps = {
  sourceIds: number[];
  sources: ReportSourceRecord[];
  onSelectSources: (sourceIds: number[]) => void;
  limit?: number;
};

export function EvidencePills({
  sourceIds,
  sources,
  onSelectSources,
  limit = 3,
}: EvidencePillsProps) {
  const resolvedSources = sourceIds
    .map((sourceId) => resolveSourceByCitationId(sources, sourceId))
    .filter((source): source is ReportSourceRecord => Boolean(source));

  if (!resolvedSources.length) {
    return null;
  }

  const visibleSources = resolvedSources.slice(0, limit);
  const hiddenCount = resolvedSources.length - visibleSources.length;

  return (
    <div className="min-w-0 flex flex-wrap gap-2">
      {visibleSources.map((source) => (
        <Button
          key={source.id}
          type="button"
          size="sm"
          variant="outline"
          className="h-auto min-w-0 max-w-full justify-start gap-2 rounded-full px-3 py-1.5 text-left"
          onClick={() => onSelectSources([source.id])}
        >
          <Link2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 truncate text-xs">
            S{getDisplaySourceId(source)} · {source.title}
          </span>
        </Button>
      ))}

      {hiddenCount > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto rounded-full px-3 py-1.5 text-xs"
          onClick={() => onSelectSources(resolvedSources.map((source) => source.id))}
        >
          +{hiddenCount} more
        </Button>
      ) : null}
    </div>
  );
}
