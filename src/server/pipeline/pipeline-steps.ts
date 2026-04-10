import type {
  PipelineStepKey,
  PipelineStepStatus,
  ReportRunLifecycleStatus,
  ReportRunProgress,
  ReportRunStep,
} from "@/lib/types/report";

export type StoredPipelineStepState = {
  status: PipelineStepStatus;
  attemptCount: number;
  startedAt: string | null;
  completedAt: string | null;
  lastAttemptedAt: string | null;
  lastDeliveryCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  fallbackApplied: boolean;
  retryExhausted: boolean;
};

export type StoredPipelineState = {
  currentStepKey: PipelineStepKey | null;
  steps: Record<PipelineStepKey, StoredPipelineStepState>;
};

export const REPORT_PIPELINE_STEPS: ReadonlyArray<{
  key: PipelineStepKey;
  label: string;
  progressPercent: number;
  runStatus: ReportRunLifecycleStatus;
}> = [
  {
    key: "normalize_target",
    label: "Normalize target",
    progressPercent: 6,
    runStatus: "fetching",
  },
  {
    key: "crawl_company_site",
    label: "Crawl company site",
    progressPercent: 18,
    runStatus: "fetching",
  },
  {
    key: "build_fact_base",
    label: "Build fact base",
    progressPercent: 34,
    runStatus: "extracting",
  },
  {
    key: "generate_account_plan",
    label: "Generate account plan",
    progressPercent: 58,
    runStatus: "synthesizing",
  },
  {
    key: "export_markdown",
    label: "Export markdown",
    progressPercent: 72,
    runStatus: "synthesizing",
  },
  {
    key: "export_pdf",
    label: "Export PDF",
    progressPercent: 84,
    runStatus: "synthesizing",
  },
  {
    key: "enrich_external_sources",
    label: "Enrich external sources",
    progressPercent: 94,
    runStatus: "fetching",
  },
  {
    key: "finalize_report",
    label: "Finalize report",
    progressPercent: 100,
    runStatus: "completed",
  },
];

const postCoreSuccessStepKeySet = new Set<PipelineStepKey>([
  "enrich_external_sources",
  "export_markdown",
  "export_pdf",
  "finalize_report",
]);
const pipelineStepKeySet = new Set<PipelineStepKey>(REPORT_PIPELINE_STEPS.map((step) => step.key));

export function canContinueAfterCoreBriefSuccess(stepKey: PipelineStepKey) {
  return postCoreSuccessStepKeySet.has(stepKey);
}

export function coercePipelineStepKey(value: string | null | undefined): PipelineStepKey | null {
  if (!value) {
    return null;
  }

  return pipelineStepKeySet.has(value as PipelineStepKey) ? (value as PipelineStepKey) : null;
}

export function getPipelineStep(key: PipelineStepKey) {
  const step = REPORT_PIPELINE_STEPS.find((item) => item.key === key);

  if (!step) {
    throw new Error(`Unknown pipeline step: ${key}`);
  }

  return step;
}

export function createInitialPipelineState(): StoredPipelineState {
  return {
    currentStepKey: null,
    steps: Object.fromEntries(
      REPORT_PIPELINE_STEPS.map((step) => [
        step.key,
        {
          status: "pending",
          attemptCount: 0,
          startedAt: null,
          completedAt: null,
          lastAttemptedAt: null,
          lastDeliveryCount: null,
          errorCode: null,
          errorMessage: null,
          fallbackApplied: false,
          retryExhausted: false,
        },
      ]),
    ) as StoredPipelineState["steps"],
  };
}

export function normalizePipelineState(
  input:
    | {
        currentStepKey?: string | null;
        steps?: Record<string, Partial<StoredPipelineStepState>>;
      }
    | null
    | undefined,
): StoredPipelineState {
  const initialState = createInitialPipelineState();

  if (!input) {
    return initialState;
  }

  const nextSteps = { ...initialState.steps };

  for (const step of REPORT_PIPELINE_STEPS) {
    const current = input.steps?.[step.key];

    if (!current) {
      continue;
    }

    nextSteps[step.key] = {
      status: current.status ?? "pending",
      attemptCount: current.attemptCount ?? 0,
      startedAt: current.startedAt ?? null,
      completedAt: current.completedAt ?? null,
      lastAttemptedAt: current.lastAttemptedAt ?? null,
      lastDeliveryCount: current.lastDeliveryCount ?? null,
      errorCode: current.errorCode ?? null,
      errorMessage: current.errorMessage ?? null,
      fallbackApplied: current.fallbackApplied ?? false,
      retryExhausted: current.retryExhausted ?? false,
    };
  }

  return {
    currentStepKey: coercePipelineStepKey(input.currentStepKey),
    steps: nextSteps,
  };
}

export function serializePipelineProgress(state: StoredPipelineState): ReportRunProgress {
  const steps: ReportRunStep[] = REPORT_PIPELINE_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    status: state.steps[step.key]?.status ?? "pending",
    progressPercent: step.progressPercent,
    attemptCount: state.steps[step.key]?.attemptCount ?? 0,
    startedAt: state.steps[step.key]?.startedAt ?? null,
    completedAt: state.steps[step.key]?.completedAt ?? null,
    lastAttemptedAt: state.steps[step.key]?.lastAttemptedAt ?? null,
    lastDeliveryCount: state.steps[step.key]?.lastDeliveryCount ?? null,
    errorCode: state.steps[step.key]?.errorCode ?? null,
    errorMessage: state.steps[step.key]?.errorMessage ?? null,
    fallbackApplied: state.steps[step.key]?.fallbackApplied ?? false,
    retryExhausted: state.steps[step.key]?.retryExhausted ?? false,
  }));

  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const currentStepKey = coercePipelineStepKey(state.currentStepKey);

  return {
    totalSteps: steps.length,
    completedSteps,
    currentStepKey,
    currentStepLabel: currentStepKey ? getPipelineStep(currentStepKey).label : null,
    steps,
  };
}

export function getPipelineProgressBefore(stepKey: PipelineStepKey) {
  const index = REPORT_PIPELINE_STEPS.findIndex((step) => step.key === stepKey);

  if (index <= 0) {
    return 0;
  }

  return REPORT_PIPELINE_STEPS[index - 1]?.progressPercent ?? 0;
}
