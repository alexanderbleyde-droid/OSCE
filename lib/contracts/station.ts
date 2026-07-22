import { z } from "zod";

/**
 * StationContent contract — mirrors docs/spec/station-schema.md exactly.
 *
 * `stationContentSchema` validates STRUCTURE (every stored version must pass).
 * The draft -> enabled lifecycle gates (pool constraint, weights sum 100,
 * mustCover non-empty, >=1 critical flag) are intentionally NOT part of the
 * base schema — drafts may be incomplete. Use `stationEnableSchema` /
 * `validateForEnable` when enabling a station.
 */

export const disclosureRuleSchema = z.enum([
  "direct-question",
  "empathy-triggered",
  "examination",
]);

export const questionCategorySchema = z.enum(["safety", "lifestyle", "general"]);

export const scoringDomainKeySchema = z.enum([
  "clinical-reasoning",
  "safety",
  "professionalism",
  "communication",
  "structure",
]);

export const patientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  age: z
    .number("Enter the patient's age")
    .int("Age must be a whole number")
    .min(0)
    .max(130),
  gender: z.string().min(1, "Gender is required"),
  presentation: z.string().min(1, "Presentation is required"),
  personaNotes: z.string(),
});

/** AI Dial — pillar 1. Reference stations use explicit / partial / concealed tiers. */
export const difficultyTierSchema = z.object({
  concealmentLevel: z.string().min(1, "Concealment level is required"),
  description: z.string().min(1, "Describe how the patient behaves at this tier"),
});

export const difficultyTiersSchema = z.object({
  tier1: difficultyTierSchema,
  tier2: difficultyTierSchema,
  tier3: difficultyTierSchema,
});

/** Progressive disclosure — pillar 4. */
export const withheldFactSchema = z.object({
  id: z.string().min(1),
  fact: z.string().min(1, "Fact text is required"),
  disclosureRule: disclosureRuleSchema,
  tier: z.number().int().min(1).max(3),
});

/** Randomized question pool — pillar 5. Engine samples 2-3 per encounter. */
export const poolQuestionSchema = z.object({
  id: z.string().min(1),
  category: questionCategorySchema,
  text: z.string().min(1, "Question text is required"),
  expectedElements: z.array(z.string().min(1, "Expected element cannot be empty")),
  checkIn: z.boolean(),
});

/** Jargon bank — pillar 2. */
export const jargonEntrySchema = z.object({
  term: z.string().min(1, "Term is required"),
  plainAnalogy: z.string().min(1, "Plain analogy is required"),
});

/** Closing & teach-back — pillar 6, critical safety item. */
export const closingSchema = z.object({
  teachBackRequired: z.literal(true),
  mustCover: z.array(z.string().min(1, "Must-cover item cannot be empty")),
});

export const scoringDomainSchema = z.object({
  key: scoringDomainKeySchema,
  weight: z
    .number("Enter a weight (0-100)")
    .int("Whole numbers only")
    .min(0, "Weight cannot be negative")
    .max(100, "Weight cannot exceed 100"),
});

export const criticalFlagSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1, "Description is required"),
});

/** Scoring — pillar 7. Pass threshold is fixed at 65% (CLAUDE.md domain rules). */
export const scoringSchema = z.object({
  domains: z.array(scoringDomainSchema),
  passThreshold: z.literal(65),
  criticalFlags: z.array(criticalFlagSchema),
});

/**
 * Knowledge Bridge assets — pillar 8. The spec lists the four collections
 * without fixing element shapes; these minimal shapes carry what the V3
 * bridge screen displays (title/content per asset type).
 */
export const bridgeMiniCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required"),
  scenario: z.string().min(1, "Scenario is required"),
  prompt: z.string().min(1, "Prompt is required"),
  debrief: z.string().min(1, "Debrief is required"),
});

export const bridgeMcqSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1, "Question is required"),
  options: z.array(z.string().min(1, "Option cannot be empty")).min(2, "At least two options are required"),
  /** null = not chosen yet. Drafts may save unset; the enable gate requires
   *  a valid index. Never auto-assigned — the author must choose. */
  correctIndex: z.number("Mark the correct answer").int().min(0).nullable(),
  explanation: z.string().min(1, "Explanation is required"),
});

export const bridgePearlSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Title is required"),
  text: z.string().min(1, "Pearl text is required"),
});

export const bridgeFrameworkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  summary: z.string().min(1, "Summary is required"),
  stages: z.array(z.string().min(1, "Stage cannot be empty")).min(1, "Add at least one stage"),
});

export const bridgeSchema = z.object({
  miniCases: z.array(bridgeMiniCaseSchema),
  mcqs: z.array(bridgeMcqSchema),
  pearls: z.array(bridgePearlSchema),
  frameworks: z.array(bridgeFrameworkSchema),
});

export const stationContentSchema = z.object({
  patient: patientSchema,
  openingStatement: z.string().min(1, "Opening statement is required"),
  difficultyTiers: difficultyTiersSchema,
  withheldFacts: z.array(withheldFactSchema),
  questionPool: z.array(poolQuestionSchema),
  jargonBank: z.array(jargonEntrySchema),
  closing: closingSchema,
  scoring: scoringSchema,
  bridge: bridgeSchema,
});

export type StationContent = z.infer<typeof stationContentSchema>;
export type Patient = z.infer<typeof patientSchema>;
export type DifficultyTier = z.infer<typeof difficultyTierSchema>;
export type WithheldFact = z.infer<typeof withheldFactSchema>;
export type PoolQuestion = z.infer<typeof poolQuestionSchema>;
export type JargonEntry = z.infer<typeof jargonEntrySchema>;
export type ScoringDomain = z.infer<typeof scoringDomainSchema>;
export type CriticalFlag = z.infer<typeof criticalFlagSchema>;
export type DisclosureRule = z.infer<typeof disclosureRuleSchema>;
export type QuestionCategory = z.infer<typeof questionCategorySchema>;
export type ScoringDomainKey = z.infer<typeof scoringDomainKeySchema>;

/**
 * draft -> enabled lifecycle gates (docs/spec/station-schema.md):
 * pool constraint met, weights sum 100, closing.mustCover non-empty,
 * >=1 criticalFlag.
 */
export const stationEnableSchema = stationContentSchema.superRefine(
  (content, ctx) => {
    if (!content.questionPool.some((q) => q.category === "safety")) {
      ctx.addIssue({
        code: "custom",
        path: ["questionPool"],
        message: "questionPool must contain at least one safety question",
      });
    }
    if (!content.questionPool.some((q) => q.category === "lifestyle")) {
      ctx.addIssue({
        code: "custom",
        path: ["questionPool"],
        message: "questionPool must contain at least one lifestyle question",
      });
    }
    const weightSum = content.scoring.domains.reduce(
      (sum, d) => sum + d.weight,
      0,
    );
    if (weightSum !== 100) {
      ctx.addIssue({
        code: "custom",
        path: ["scoring", "domains"],
        message: `scoring domain weights must sum to 100 (got ${weightSum})`,
      });
    }
    const keys = new Set(content.scoring.domains.map((d) => d.key));
    if (keys.size !== content.scoring.domains.length) {
      ctx.addIssue({
        code: "custom",
        path: ["scoring", "domains"],
        message: "scoring domains must not repeat a key",
      });
    }
    const missing = scoringDomainKeySchema.options.filter((k) => !keys.has(k));
    if (missing.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["scoring", "domains"],
        message: `all five scoring domains are required (missing: ${missing.join(", ")})`,
      });
    }
    if (content.closing.mustCover.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["closing", "mustCover"],
        message: "closing.mustCover must be non-empty to enable a station",
      });
    }
    if (content.scoring.criticalFlags.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["scoring", "criticalFlags"],
        message: "at least one critical flag is required to enable a station",
      });
    }
    content.bridge.mcqs.forEach((mcq, i) => {
      if (mcq.correctIndex === null) {
        ctx.addIssue({
          code: "custom",
          path: ["bridge", "mcqs", i, "correctIndex"],
          message: "Mark the correct answer",
        });
      } else if (mcq.correctIndex >= mcq.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["bridge", "mcqs", i, "correctIndex"],
          message: "Correct answer must be one of the options",
        });
      }
    });
  },
);

/** Convenience: returns human-readable gate failures, [] when enableable. */
export function validateForEnable(content: unknown): string[] {
  const result = stationEnableSchema.safeParse(content);
  if (result.success) return [];
  return result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  );
}
