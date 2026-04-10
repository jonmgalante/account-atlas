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
    let terminalReached = initialStatus?.isTerminal ?? false;
    let unchangedPollCount = 0;
    let lastStatusSignature =
      initialStatus
        ? JSON.stringify({
            reportUpdatedAt: initialStatus.report.updatedAt,
            runUpdatedAt: initialStatus.currentRun?.updatedAt ?? null,
            stepKey: initialStatus.currentRun?.stepKey ?? null,
            runStatus: initialStatus.currentRun?.status ?? null,
            reportStatus: initialStatus.report.status,
          })
        : null;
    let errorBackoffMs = 3_000;

    const schedulePoll = (delayMs: number) => {
      if (cancelled) {
        return;
      }

      timer = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      if (cancelled || terminalReached) {
        return;
      }

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
        errorBackoffMs = 3_000;
        terminalReached = payload.data.isTerminal;

        const nextSignature = JSON.stringify({
          reportUpdatedAt: payload.data.report.updatedAt,
          runUpdatedAt: payload.data.currentRun?.updatedAt ?? null,
          stepKey: payload.data.currentRun?.stepKey ?? null,
          runStatus: payload.data.currentRun?.status ?? null,
          reportStatus: payload.data.report.status,
        });

        if (nextSignature === lastStatusSignature) {
          unchangedPollCount += 1;
        } else {
          unchangedPollCount = 0;
          lastStatusSignature = nextSignature;
        }

        if (!payload.data.isTerminal) {
          const backoffMultiplier = Math.min(4, unchangedPollCount + 1);
          schedulePoll(Math.max(payload.data.pollAfterMs, payload.data.pollAfterMs * backoffMultiplier));
        }
      } catch {
        if (cancelled) {
          return;
        }

        setErrorMessage("Live status is temporarily unavailable. Account Atlas will keep retrying automatically.");
        schedulePoll(errorBackoffMs);
        errorBackoffMs = Math.min(15_000, errorBackoffMs + 3_000);
      } finally {
        if (!cancelled) {
          setIsPolling(false);
        }
      }
    };

    if (!initialStatus || !initialStatus.isTerminal) {
      schedulePoll(initialStatus?.pollAfterMs ?? 0);
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
