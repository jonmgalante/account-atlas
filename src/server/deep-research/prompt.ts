import "server-only";

import { motionRecommendationValues, reportSectionValues } from "@/lib/types/report";
import {
  CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME,
  CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_VERSION,
  canonicalAccountAtlasReportTopLevelFields,
} from "@/server/deep-research/report-contract";

export const CANONICAL_DEEP_RESEARCH_SYSTEM_PROMPT = [
  "You are Account Atlas, a seller-facing public-web research system.",
  "Resolve the real company behind the submitted URL, research that target company, and produce an evidence-backed enterprise account brief.",
  "Return only valid JSON that matches the provided schema contract.",
].join(" ");

export const CANONICAL_DEEP_RESEARCH_DEVELOPER_PROMPT = `
Research and reporting rules:
- Resolve the company identity from the URL before generating recommendations.
- Research the target company, its public business context, its buyers, and its public signals. Do not drift into seller-side, internal account-planning, or generic sales-tool workflows unless the evidence shows the company itself sells or operates that workflow.
- Keep recommendations company-specific, evidence-backed, and commercially practical.
- Every major recommendation must cite sources through citations[].source_id values that resolve to the top-level sources array. Treat sources as the citation registry and keep source_id values stable and unique.
- Label claims in fact_base as fact, inference, or hypothesis. Stay conservative when evidence is thin.
- Populate evidence_coverage.section_coverage for every canonical report section exactly once.
- If the evidence is too weak for a confident full brief, degrade gracefully: keep the company grounding, keep citations explicit, set report_metadata.report_mode to grounded_fallback, populate grounded_fallback, and avoid generic filler.
- Prefer workspace, api_platform, or hybrid only when supported by company-specific evidence. Use undetermined only when the evidence cannot support a directional motion recommendation.
- Keep the output compact and reusable. Return JSON only.

Example citation object:
{"source_id": 1, "support": "Homepage describes the core enterprise workflow problem."}
`.trim();

export type CanonicalDeepResearchPromptPreflight = {
  normalizedCompanyUrl?: string | null;
  canonicalDomain?: string | null;
  companyNameHint?: string | null;
  currentDate?: string | null;
};

export type CanonicalDeepResearchPromptInput = {
  companyUrl: string;
  preflight?: CanonicalDeepResearchPromptPreflight;
};

export type CanonicalDeepResearchPromptPayload = {
  systemPrompt: string;
  developerPrompt: string;
  input: string;
};

const canonicalPromptContractSummary = {
  schema_name: CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_NAME,
  schema_version: CANONICAL_ACCOUNT_ATLAS_REPORT_SCHEMA_VERSION,
  top_level_fields: canonicalAccountAtlasReportTopLevelFields,
  report_sections: reportSectionValues,
  motion_values: motionRecommendationValues,
  citation_contract: {
    location: "Every major recommendation section uses citations[].source_id to reference sources[].source_id.",
    rule: "Only cite sources that appear in the top-level sources array.",
  },
};

export function buildCanonicalDeepResearchPrompt(
  input: CanonicalDeepResearchPromptInput,
): CanonicalDeepResearchPromptPayload {
  const promptInput = {
    task: "Research the company behind the URL and return the canonical Account Atlas seller-facing report JSON.",
    company_url: input.companyUrl,
    deterministic_preflight: {
      normalized_company_url: input.preflight?.normalizedCompanyUrl ?? null,
      canonical_domain: input.preflight?.canonicalDomain ?? null,
      company_name_hint: input.preflight?.companyNameHint ?? null,
      current_date: input.preflight?.currentDate ?? null,
    },
    output_contract: canonicalPromptContractSummary,
  };

  return {
    systemPrompt: CANONICAL_DEEP_RESEARCH_SYSTEM_PROMPT,
    developerPrompt: CANONICAL_DEEP_RESEARCH_DEVELOPER_PROMPT,
    input: JSON.stringify(promptInput, null, 2),
  };
}
