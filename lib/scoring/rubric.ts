import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { scoringDomainKeySchema, type StationContent, type ScoringDomainKey } from "../contracts/station.ts";
import type { AttemptMode } from "../contracts/db.ts";
import type { TranscriptMessage } from "../engine/transcript.ts";
import type { RubricResult, ScoringFacts } from "./assemble.ts";

/**
 * AI rubric grading — the QUALITY half of scoring (pillar 7). A thin adapter:
 * it turns the transcript + station rubric into a structured grading, and the
 * pure assembleScore() turns that into the authoritative result. Runs at
 * temperature 0 for deterministic re-runs, with a SEPARATE scoring model
 * (ANTHROPIC_SCORING_MODEL) so the patient and scorer models can differ.
 *
 * Node-safe (no `server-only`) so the same grader runs from the finish action
 * and from the scoring script. The model grades quality and judges the
 * station's CLINICAL critical flags; it is told NOT to re-judge teach-back or
 * jargon — those are measured deterministically and passed in as ground truth.
 */

/** Separate scoring model id; falls back to the encounter model, then default.
 *  Resolved LAZILY (at call time, not import) so scripts that load .env.local
 *  in their body still see the configured value — ES imports evaluate before
 *  the script body runs. */
export function scoringModelId(): string {
  return process.env.ANTHROPIC_SCORING_MODEL || process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
}

/** Generic meaning of each fixed scoring domain (any station, per the
 *  reference rubrics) — gives the grader a consistent frame. */
const DOMAIN_GUIDE: Record<ScoringDomainKey, string> = {
  "clinical-reasoning":
    "history-taking, clinical accuracy, correctness and completeness of the information, options and explanations given",
  safety:
    "safety-critical counselling: risk and warning delivery, contraindication screening, red-flag advice and safety-netting",
  professionalism:
    "rapport, empathy, respect, non-judgemental manner, genuine shared decision-making and ethical conduct",
  communication:
    "plain language, checking understanding, clear structure of explanations, and responsiveness to the patient's cues and emotions",
  structure:
    "logical organisation of the consultation: introduction, signposting, sensible sequence, and a proper closing",
};

function buildRubricSchema(station: StationContent) {
  const expectedKeys = station.scoring.domains.map((d) => d.key);
  return z.object({
    domains: z
      .array(
        z.object({
          key: scoringDomainKeySchema,
          score: z.number().int().min(0).max(100),
          rationale: z.string().min(1),
        }),
      )
      // Must grade EXACTLY the station's domains — each present once, none
      // duplicated. Length alone would let a duplicate + omission slip through
      // and silently score the omitted domain 0.
      .superRefine((arr, ctx) => {
        const seen = new Set<string>();
        for (const d of arr) {
          if (seen.has(d.key)) ctx.addIssue({ code: "custom", message: `duplicate domain: ${d.key}` });
          seen.add(d.key);
        }
        for (const k of expectedKeys) {
          if (!seen.has(k)) ctx.addIssue({ code: "custom", message: `missing domain: ${k}` });
        }
      }),
    flags: z.array(
      z.object({
        id: z.string(),
        triggered: z.boolean(),
        evidence: z.string(),
      }),
    ),
    constructScore: z.number().int().min(0).max(2).nullable(),
  });
}

export async function runRubric(params: {
  content: StationContent;
  transcript: TranscriptMessage[];
  facts: ScoringFacts;
  tier: 1 | 2 | 3;
  mode: AttemptMode;
}): Promise<{ result: RubricResult; model: string }> {
  const { content, transcript, facts, tier } = params;

  const convo = transcript
    .filter((m) => m.role === "candidate" || m.role === "patient")
    .map((m) => `${m.role === "candidate" ? "DOCTOR" : "PATIENT"}: ${m.text}`)
    .join("\n");

  const domainList = content.scoring.domains
    .map((d) => `- ${d.key} (weight ${d.weight}%): ${DOMAIN_GUIDE[d.key]}`)
    .join("\n");

  // Rubric hints — the examiner-authored expectations the grader marks against.
  const expectations = content.questionPool
    .flatMap((q) => q.expectedElements.map((e) => `- (${q.category}) ${e}`))
    .join("\n");
  const mustCover = content.closing.mustCover.map((m) => `- ${m}`).join("\n");
  const flagList = content.scoring.criticalFlags
    .map((f) => `- id "${f.id}": ${f.description}`)
    .join("\n");

  const system = [
    "You are a strict, fair OSCE examiner grading a completed clinical consultation between a trainee DOCTOR and a simulated PATIENT. You grade what actually happened in the transcript — never what you assume a competent doctor would do.",
    "",
    "Grade each scoring domain from 0 to 100 and give a concise, specific rationale that cites what the doctor did or failed to do. Be calibrated: reserve 85+ for genuinely strong performance, and do not inflate.",
    "",
    "The five domains for this station:",
    domainList,
    "",
    "Examiner expectations the doctor SHOULD have covered (evidence for grading — absence is a deficiency, not a pass):",
    expectations || "(none specified)",
    "",
    "Points that must be covered when closing:",
    mustCover || "(none specified)",
    "",
    "CRITICAL SAFETY FLAGS — for EACH, decide whether it was TRIGGERED (the failure occurred) with brief evidence. Judge only what the transcript shows:",
    flagList || "(none specified)",
    "",
    "GROUND TRUTH from the engine — treat as fact; do NOT re-judge these (they are scored deterministically elsewhere), but let them inform your communication/safety rationale:",
    `- Teach-back before closing: ${facts.teachBackMissed ? "NOT done" : "done"}.`,
    `- Unexplained medical jargon terms used: ${facts.jargonCount}.`,
    "",
    "If — and only if — this station conceals a core construct the candidate must recognise UNPROMPTED (e.g. realising the encounter is breaking bad news, not a routine history), score that recognition 0 (missed), 1 (partial), or 2 (clear). If there is no such concealed construct, or the task was explicit, return null for constructScore.",
    `Difficulty tier for this attempt: ${tier} (1 explicit, 2 partial, 3 concealed).`,
  ].join("\n");

  const schema = buildRubricSchema(content);
  const modelId = scoringModelId();

  const { object } = await generateObject({
    model: anthropic(modelId),
    schema,
    temperature: 0, // honoured by models that support it; ignored (harmlessly) by others
    // Bound the call so the finish action (which awaits scoring) can never hang
    // on a slow/stuck model past the serverless limit.
    abortSignal: AbortSignal.timeout(25_000),
    system,
    prompt: `Consultation transcript:\n${convo}\n\nGrade every domain, judge every critical flag by its id, and set constructScore.`,
  });

  return { result: object as RubricResult, model: modelId };
}
