"use client";

import { useEffect, useState } from "react";

import type { ApiResponse } from "@/lib/types/api";
import type { ReportStatusShell } from "@/lib/types/report";

type UseReportStatusOptions = {
  shareId: string;
  initialStatus: ReportStatusShell | null;
};

export function useReportStatus({ shareId, initialStatus }: UseReportStatusOptions) {
  const [status, setStatus] = useState<ReportStatusShell | null>(initialStatus);
  const [isPolling, setIsPolling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      setIsPolling(true);

      try {
        const response = await fetch(`/api/reports/${shareId}/status`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Status request failed with ${response.status}`);
        }

        const payload = (await response.json()) as ApiResponse<ReportStatusShell>;

        if (!payload.ok) {
          throw new Error(payload.error.message);
        }

        if (cancelled) {
          return;
        }

        setStatus(payload.data);
        setErrorMessage(null);

        if (!payload.data.isTerminal) {
          timer = setTimeout(poll, payload.data.pollAfterMs);
        }
      } catch {
        if (cancelled) {
          return;
        }

        setErrorMessage("Live status is temporarily unavailable. Account Atlas will keep retrying automatically.");
        timer = setTimeout(poll, 3000);
      } finally {
        if (!cancelled) {
          setIsPolling(false);
        }
      }
    };

    if (!initialStatus || !initialStatus.isTerminal) {
      timer = setTimeout(poll, initialStatus?.pollAfterMs ?? 0);
    }

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [initialStatus, shareId]);

  return {
    status,
    isPolling,
    errorMessage,
  };
}
