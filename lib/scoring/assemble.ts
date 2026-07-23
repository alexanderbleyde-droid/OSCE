import type { StationContent, ScoringDomainKey } from "@/lib/contracts/station";
import { shouldTriggerBridge, type DomainScores } from "../contracts/db.ts";

/**
 * Score assembly — pillar 7 (reference: ITB S10/S11/S13, AS S4/S6).
 *
 * PURE and deterministic: it takes the model's rubric grading + the engine's
 * deterministic facts and produces the final, authoritative score. The AI
 * grades QUALITY; CODE enforces FACTS. Deterministic critical failures
 * (teach-back missed, jargon critical) are added here and can NEVER be removed
 * by the model. Because this function is pure, every scoring rule is unit-
 * tested (npm run checks:scoring) without an API call.
 */

/** Per-domain quality grade from the rubric model (0-100). */
export type RubricDomainScore = {
  key: ScoringDomainKey;
  score: number;
  rationale: string;
};

/** The model's verdict on ONE station-declared critical flag. */
export type RubricFlagVerdict = {
  id: string;
  triggered: boolean;
  evidence: string;
};

export type RubricResult = {
  domains: RubricDomainScore[];
  flags: RubricFlagVerdict[];
  /** Concealed-construct recognition score when the station conceals one
   *  (e.g. recognising bad news, AS item 3); null when not applicable. */
  constructScore: number | null;
};

/** Deterministic facts pulled from the engine record — never model-judged. */
export type ScoringFacts = {
  teachBackMissed: boolean;
  jargonCount: number;
  /** count >= 4 → communication critical fail (reference S9/S11). */
  jargonCritical: boolean;
  /** count == 3 → disengagement, communication capped (reference S9). */
  jargonDisengaged: boolean;
};

export type TriggeredFlag = {
  id: string;
  description: string;
  /** "engine" = deterministic + authoritative; "model" = rubric judgement. */
  source: "engine" | "model";
  evidence: string;
};

export type ScoredDomain = {
  key: ScoringDomainKey;
  score: number;
  weight: number;
  rationale: string;
};

export type ScoreResult = {
  domains: ScoredDomain[];
  domainScores: DomainScores;
  aggregate: number;
  passed: boolean;
  criticalFailed: boolean;
  triggeredFlags: TriggeredFlag[];
  bridgeTriggered: boolean;
  bridgeReasons: string[];
  constructScores: number[];
};

/** Stable ids for the two engine-enforced (deterministic) critical failures. */
export const ENGINE_TEACHBACK_FLAG = "engine:teachback-missed";
export const ENGINE_JARGON_FLAG = "engine:jargon-critical";

const COMMUNICATION: ScoringDomainKey = "communication";
const JARGON_DISENGAGE_CAP = 49; // 3 unexplained terms → capped (and trips bridge)
const JARGON_CRITICAL_CAP = 40; // 4+ terms → critical fail; score floored low

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function assembleScore(
  content: StationContent,
  rubric: RubricResult,
  facts: ScoringFacts,
  // Concealed-construct recognition is only assessed on non-explicit tiers
  // (reference AS S4/S5: omitted on Basic, scored on Intermediate/Advanced).
  // The orchestrator passes the attempt's real tier; tests default to a
  // concealed tier so a construct score is honoured.
  tier: 1 | 2 | 3 = 3,
): ScoreResult {
  const rubricByKey = new Map(rubric.domains.map((d) => [d.key, d]));

  // Per-domain scores from the model, clamped, with deterministic comms caps.
  const domains: ScoredDomain[] = content.scoring.domains.map((def) => {
    const r = rubricByKey.get(def.key);
    let score = clampScore(r?.score ?? 0);
    let rationale = r?.rationale?.trim() || "No rationale provided.";
    if (def.key === COMMUNICATION) {
      if (facts.jargonCritical && score > JARGON_CRITICAL_CAP) {
        score = JARGON_CRITICAL_CAP;
        rationale = `${rationale} (Capped by engine: ${facts.jargonCount} unexplained medical terms — communication critical fail.)`;
      } else if (facts.jargonDisengaged && score > JARGON_DISENGAGE_CAP) {
        score = JARGON_DISENGAGE_CAP;
        rationale = `${rationale} (Capped by engine: 3 unexplained medical terms disengaged the patient.)`;
      }
    }
    return { key: def.key, score, weight: def.weight, rationale };
  });

  const domainScores = Object.fromEntries(
    domains.map((d) => [d.key, d.score]),
  ) as DomainScores;

  // Weighted aggregate (weights sum to 100 on enabled stations; normalise
  // defensively so a malformed draft can't divide by zero). The pass decision
  // uses the UNROUNDED mean so a 64.6% can't round up to 65% and "pass"; the
  // stored aggregate is rounded only for display.
  const totalWeight = domains.reduce((s, d) => s + d.weight, 0) || 1;
  const rawAggregate = domains.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
  const aggregate = Math.round(rawAggregate);

  // Triggered critical flags: deterministic (engine, authoritative) first, then
  // the model's verdicts on the station's own declared clinical flags.
  const triggeredFlags: TriggeredFlag[] = [];
  if (facts.teachBackMissed) {
    triggeredFlags.push({
      id: ENGINE_TEACHBACK_FLAG,
      description: "Closed the encounter without a teach-back.",
      source: "engine",
      evidence: "No teach-back was detected before closing (engine record).",
    });
  }
  if (facts.jargonCritical) {
    triggeredFlags.push({
      id: ENGINE_JARGON_FLAG,
      description: "Four or more unexplained medical terms (communication critical fail).",
      source: "engine",
      evidence: `${facts.jargonCount} unexplained medical terms were used (engine record).`,
    });
  }
  const flagById = new Map(content.scoring.criticalFlags.map((f) => [f.id, f]));
  for (const verdict of rubric.flags) {
    if (!verdict.triggered) continue;
    const def = flagById.get(verdict.id);
    if (!def) continue; // ignore any flag id the model invented
    triggeredFlags.push({
      id: def.id,
      description: def.description,
      source: "model",
      evidence: verdict.evidence?.trim() || "",
    });
  }

  const criticalFailed = triggeredFlags.length > 0;
  const passed = rawAggregate >= content.scoring.passThreshold && !criticalFailed;

  // Construct recognition only counts on non-explicit tiers; on an explicit
  // (tier-1) task the construct is stated, so a stray model 0 must not fire the
  // bridge.
  const constructScores = tier >= 2 && rubric.constructScore != null ? [rubric.constructScore] : [];

  const bridgeTriggered = shouldTriggerBridge(domainScores, criticalFailed, constructScores);
  const bridgeReasons: string[] = [];
  if (criticalFailed) bridgeReasons.push("critical fail");
  if (constructScores.some((s) => s === 0)) bridgeReasons.push("construct not recognised");
  const weakDomains = domains.filter((d) => d.score < 50).map((d) => d.key);
  if (weakDomains.length > 0) bridgeReasons.push(`domain below 50%: ${weakDomains.join(", ")}`);

  return {
    domains,
    domainScores,
    aggregate,
    passed,
    criticalFailed,
    triggeredFlags,
    bridgeTriggered,
    bridgeReasons,
    constructScores,
  };
}
