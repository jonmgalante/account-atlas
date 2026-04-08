import type { ReportSectionKey, ReportSectionShell } from "@/lib/types/report";

export const REPORT_SECTION_DEFINITIONS: ReadonlyArray<{
  key: ReportSectionKey;
  label: string;
}> = [
  { key: "company-brief", label: "Company brief" },
  { key: "fact-base", label: "Fact base" },
  { key: "ai-maturity-signals", label: "AI maturity signals" },
  { key: "prioritized-use-cases", label: "Prioritized use cases" },
  { key: "recommended-motion", label: "Recommended motion" },
  { key: "stakeholder-hypotheses", label: "Stakeholder hypotheses" },
  { key: "objections", label: "Objections" },
  { key: "discovery-questions", label: "Discovery questions" },
  { key: "pilot-plan", label: "90-day pilot plan" },
  { key: "expansion-scenarios", label: "Expansion scenarios" },
];

export function createPendingReportSections(): ReportSectionShell[] {
  return REPORT_SECTION_DEFINITIONS.map((section) => ({
    ...section,
    status: "pending",
  }));
}
