import { z } from "zod";

import { safeNormalizeCompanyUrl } from "@/lib/url";

export const reportRequestSchema = z.object({
  companyUrl: z
    .string()
    .trim()
    .min(1, "Enter a company URL.")
    .superRefine((value, ctx) => {
      const result = safeNormalizeCompanyUrl(value);

      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: result.error,
        });
      }
    })
    .transform((value) => {
      const result = safeNormalizeCompanyUrl(value);
      return result.success ? result.data : value;
    }),
});

export function parseReportRequest(input: unknown) {
  return reportRequestSchema.safeParse(input);
}
