/**
 * Scoring checks (pillar 7) — run with: npm run checks:scoring
 *
 * PURE, deterministic tests of the scoring assembly + facts extraction, run
 * against synthetic rubric gradings + transcripts for BOTH reference stations.
 * No model call, no DB — this pins the rules the AI must never override:
 *   - weighted aggregate + pass/fail at the 65% threshold
 *   - critical-fail override beating a high aggregate
 *   - deterministic engine facts (teach-back miss, jargon critical) overriding
 *     a clean model result
 *   - bridge triggers firing on each rule independently (domain<50 / critical /
 *     construct=0)
 * This is the test-first gate: it exists before the pipeline is "done".
 */

import type { StationContent, ScoringDomainKey } from "../lib/contracts/station.ts";
import type { TranscriptMessage } from "../lib/engine/transcript.ts";
import {
  assembleScore,
  ENGINE_TEACHBACK_FLAG,
  ENGINE_JARGON_FLAG,
  type RubricResult,
  type RubricFlagVerdict,
  type ScoringFacts,
} from "../lib/scoring/assemble.ts";
import { deriveScoringFacts } from "../lib/scoring/facts.ts";
import { ITB_STATION, AS_STATION } from "./reference-stations.ts";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const CLEAN: ScoringFacts = { teachBackMissed: false, jargonCount: 0, jargonCritical: false, jargonDisengaged: false };

/** Rubric that grades every domain at `score`, with optional flags/construct. */
function rubricAll(
  station: StationContent,
  score: number,
  opts: { flags?: RubricFlagVerdict[]; constructScore?: number | null; overrides?: Partial<Record<ScoringDomainKey, number>> } = {},
): RubricResult {
  return {
    domains: station.scoring.domains.map((d) => ({
      key: d.key,
      score: opts.overrides?.[d.key] ?? score,
      rationale: `rationale for ${d.key}`,
    })),
    flags: opts.flags ?? [],
    constructScore: opts.constructScore ?? null,
  };
}

function withWeights(station: StationContent, weights: Partial<Record<ScoringDomainKey, number>>): StationContent {
  return {
    ...station,
    scoring: {
      ...station.scoring,
      domains: station.scoring.domains.map((d) => ({ ...d, weight: weights[d.key] ?? d.weight })),
    },
  };
}

// ════════════════════════════════════════════════════════════════════════
//  ASSEMBLE — deterministic scoring rules (ITB)
// ════════════════════════════════════════════════════════════════════════
section("ITB · clear pass");
{
  const r = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 80), CLEAN);
  check("pass: aggregate reflects the grades", r.aggregate === 80, `got ${r.aggregate}`);
  check("pass: passed = true", r.passed === true);
  check("pass: not a critical fail", r.criticalFailed === false);
  check("pass: no bridge", r.bridgeTriggered === false);
  check("pass: all five domains scored", r.domains.length === 5 && Object.keys(r.domainScores).length === 5);
}

section("ITB · clear fail");
{
  const r = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 30), CLEAN);
  check("fail: aggregate low", r.aggregate === 30);
  check("fail: passed = false", r.passed === false);
  check("fail: not a critical fail (just low)", r.criticalFailed === false);
  check("fail: bridge triggered (domains < 50)", r.bridgeTriggered === true);
  check("fail: bridge reason names weak domains", r.bridgeReasons.some((x) => x.includes("below 50%")));
}

section("ITB · critical-fail override beats a high aggregate");
{
  const flagId = ITB_STATION.scoring.criticalFlags[0]!.id;
  const r = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 90, { flags: [{ id: flagId, triggered: true, evidence: "no withdrawal warning given" }] }),
    CLEAN,
  );
  check("crit: aggregate is high (90)", r.aggregate === 90);
  check("crit: criticalFailed = true", r.criticalFailed === true);
  check("crit: passed = false despite 90% aggregate", r.passed === false);
  check("crit: triggered flag recorded with model source", r.triggeredFlags.some((f) => f.id === flagId && f.source === "model"));
  check("crit: bridge triggered by the critical fail", r.bridgeTriggered === true && r.bridgeReasons.includes("critical fail"));
}

section("ITB · model-invented flag id is ignored");
{
  const r = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 90, { flags: [{ id: "totally-made-up", triggered: true, evidence: "x" }] }),
    CLEAN,
  );
  check("invented flag: not counted", r.criticalFailed === false && r.triggeredFlags.length === 0);
}

// ── Deterministic overrides: engine facts the model can NEVER remove ──
section("ITB · deterministic teach-back miss overrides a clean model result");
{
  const facts: ScoringFacts = { ...CLEAN, teachBackMissed: true };
  const r = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 95), facts); // model: no flags, top marks
  check("teachback: engine critical flag present", r.triggeredFlags.some((f) => f.id === ENGINE_TEACHBACK_FLAG && f.source === "engine"));
  check("teachback: criticalFailed = true", r.criticalFailed === true);
  check("teachback: passed = false despite 95% aggregate", r.passed === false);
}

section("ITB · deterministic jargon critical caps communication + fails");
{
  const facts: ScoringFacts = { ...CLEAN, jargonCount: 5, jargonCritical: true };
  const r = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 95), facts); // model gave communication 95
  const comm = r.domains.find((d) => d.key === "communication")!;
  check("jargon: communication capped to 40", comm.score === 40, `got ${comm.score}`);
  check("jargon: engine jargon flag present", r.triggeredFlags.some((f) => f.id === ENGINE_JARGON_FLAG && f.source === "engine"));
  check("jargon: criticalFailed = true", r.criticalFailed === true);
}

section("ITB · 3 unexplained terms caps communication to 49 (no critical)");
{
  const facts: ScoringFacts = { ...CLEAN, jargonCount: 3, jargonDisengaged: true };
  const r = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 88), facts);
  const comm = r.domains.find((d) => d.key === "communication")!;
  check("disengage: communication capped to 49", comm.score === 49, `got ${comm.score}`);
  check("disengage: NOT a critical fail on its own", r.criticalFailed === false);
  check("disengage: bridge triggered (communication < 50)", r.bridgeTriggered === true);
}

// ── Weighted aggregate math ──
section("ITB · weighted aggregate math");
{
  const weighted = withWeights(ITB_STATION, {
    "clinical-reasoning": 40, safety: 20, professionalism: 20, communication: 10, structure: 10,
  });
  const r = assembleScore(
    weighted,
    rubricAll(weighted, 0, { overrides: { "clinical-reasoning": 80, safety: 60, professionalism: 50, communication: 40, structure: 20 } }),
    CLEAN,
  );
  // (80*40 + 60*20 + 50*20 + 40*10 + 20*10) / 100 = 6000/100 = 60
  check("weighted: aggregate = 60", r.aggregate === 60, `got ${r.aggregate}`);
}

// ── Bridge triggers, each rule INDEPENDENTLY ──
section("Bridge · each rule fires independently");
{
  // (a) domain < 50 only — no critical, no construct issue; can even be a pass.
  const a = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 90, { overrides: { safety: 40 } }),
    CLEAN,
  );
  check("bridge(a): domain<50 alone triggers bridge", a.bridgeTriggered === true);
  check("bridge(a): not via critical", a.criticalFailed === false);
  check("bridge(a): reason is the weak domain", a.bridgeReasons.some((x) => x.includes("below 50%")) && !a.bridgeReasons.includes("critical fail"));

  // (b) critical only — every domain healthy (>=50).
  const flagId = ITB_STATION.scoring.criticalFlags[0]!.id;
  const b = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 75, { flags: [{ id: flagId, triggered: true, evidence: "x" }] }),
    CLEAN,
  );
  check("bridge(b): critical alone triggers bridge", b.bridgeTriggered === true && b.bridgeReasons.includes("critical fail"));
  check("bridge(b): no weak-domain reason", !b.bridgeReasons.some((x) => x.includes("below 50%")));

  // (c) construct = 0 only — all domains healthy, no critical.
  const c = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 75, { constructScore: 0 }),
    CLEAN,
  );
  check("bridge(c): construct=0 alone triggers bridge", c.bridgeTriggered === true && c.bridgeReasons.includes("construct not recognised"));
  check("bridge(c): not a critical fail", c.criticalFailed === false);

  // control: healthy everything, construct present (>0) → no bridge.
  const none = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 75, { constructScore: 2 }), CLEAN);
  check("bridge(control): healthy pass → no bridge", none.bridgeTriggered === false);
}

// ── Pass threshold uses the UNROUNDED mean (no rounding a 64.6 up to a pass) ──
section("Pass threshold · unrounded boundary");
{
  // Equal 20% weights. [65,65,65,64,64] → true mean 64.6 (< 65 threshold).
  const sub = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 0, { overrides: { "clinical-reasoning": 65, safety: 65, professionalism: 65, communication: 64, structure: 64 } }),
    CLEAN,
  );
  check("boundary: 64.6% true mean is a FAIL even though it rounds to 65", sub.passed === false && sub.aggregate === 65,
    `passed=${sub.passed} aggregate=${sub.aggregate}`);

  const exact = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 65), CLEAN);
  check("boundary: exactly 65% passes", exact.passed === true && exact.aggregate === 65);

  const over = assembleScore(
    ITB_STATION,
    rubricAll(ITB_STATION, 0, { overrides: { "clinical-reasoning": 66, safety: 65, professionalism: 65, communication: 65, structure: 65 } }),
    CLEAN,
  );
  check("boundary: 65.2% passes", over.passed === true);
}

// ── Construct recognition only counts on non-explicit tiers ──
section("Construct · tier gating");
{
  const tier1 = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 75, { constructScore: 0 }), CLEAN, 1);
  check("tier1: construct score is ignored (explicit task) → no construct bridge",
    tier1.constructScores.length === 0 && tier1.bridgeTriggered === false);

  const tier2 = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 75, { constructScore: 0 }), CLEAN, 2);
  check("tier2: construct=0 counts → bridge triggered",
    tier2.constructScores.length === 1 && tier2.bridgeTriggered === true && tier2.bridgeReasons.includes("construct not recognised"));

  const tier3 = assembleScore(ITB_STATION, rubricAll(ITB_STATION, 75, { constructScore: 0 }), CLEAN, 3);
  check("tier3: construct=0 counts → bridge triggered", tier3.bridgeTriggered === true);
}

// ════════════════════════════════════════════════════════════════════════
//  ASSEMBLE — same rules hold on the AS station shape
// ════════════════════════════════════════════════════════════════════════
section("AS · clear pass and construct=0 bridge");
{
  const passR = assembleScore(AS_STATION, rubricAll(AS_STATION, 78), CLEAN);
  check("AS pass: passed = true", passR.passed === true && passR.bridgeTriggered === false);

  const construct = assembleScore(AS_STATION, rubricAll(AS_STATION, 78, { constructScore: 0 }), CLEAN);
  check("AS construct=0: bridge triggered, still not a critical fail", construct.bridgeTriggered === true && construct.criticalFailed === false);

  const flagId = AS_STATION.scoring.criticalFlags[0]!.id;
  const crit = assembleScore(AS_STATION, rubricAll(AS_STATION, 88, { flags: [{ id: flagId, triggered: true, evidence: "no spinal-fragility safety advice" }] }), CLEAN);
  check("AS critical override: fails despite 88% aggregate", crit.passed === false && crit.criticalFailed === true);
}

// ════════════════════════════════════════════════════════════════════════
//  FACTS — deterministic extraction from transcript + end state
// ════════════════════════════════════════════════════════════════════════
section("Facts · jargon count from the transcript");
{
  const tx = (texts: string[]): TranscriptMessage[] => [
    { role: "patient", text: ITB_STATION.openingStatement, at: "" },
    ...texts.flatMap((t) => [
      { role: "candidate" as const, text: t, at: "" },
      { role: "patient" as const, text: "(reply)", at: "" },
    ]),
  ];
  const critical = deriveScoringFacts(ITB_STATION, tx([
    "We'll use an intrathecal pump.", "Then we titrate it.", "The reservoir holds it.", "Intrathecal again, sorry.",
  ]), null);
  check("facts: 4 unexplained terms → jargonCritical", critical.jargonCount === 4 && critical.jargonCritical === true);

  const disengaged = deriveScoringFacts(ITB_STATION, tx([
    "We'll use an intrathecal pump.", "Then we titrate it.", "The reservoir holds it.",
  ]), null);
  check("facts: 3 unexplained terms → disengaged, not critical", disengaged.jargonCount === 3 && disengaged.jargonDisengaged === true && disengaged.jargonCritical === false);

  const clean = deriveScoringFacts(ITB_STATION, tx(["Hello, I'm Dr Chen."]), null);
  check("facts: no jargon → clean", clean.jargonCount === 0 && clean.jargonCritical === false);
}

section("Facts · teach-back from end state, else recomputed");
{
  const tx = (texts: string[]): TranscriptMessage[] => [
    { role: "patient", text: ITB_STATION.openingStatement, at: "" },
    ...texts.flatMap((t) => [
      { role: "candidate" as const, text: t, at: "" },
      { role: "patient" as const, text: "(reply)", at: "" },
    ]),
  ];
  check("facts: persisted end state (missed=true) is authoritative",
    deriveScoringFacts(ITB_STATION, tx(["anything"]), { teachBackMissedCriticalFail: true }).teachBackMissed === true);
  check("facts: persisted end state (missed=false) is authoritative",
    deriveScoringFacts(ITB_STATION, tx(["anything"]), { teachBackMissedCriticalFail: false }).teachBackMissed === false);

  // No end state → recompute from the transcript.
  const withTeachBack = tx(["Just so I know it's clear, can you tell me back what you'll do if the pump stops?"]);
  check("facts: no end state + teach-back present → not missed",
    deriveScoringFacts(ITB_STATION, withTeachBack, null).teachBackMissed === false);
  check("facts: no end state + no teach-back → missed",
    deriveScoringFacts(ITB_STATION, tx(["What's the pain like?"]), null).teachBackMissed === true);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
