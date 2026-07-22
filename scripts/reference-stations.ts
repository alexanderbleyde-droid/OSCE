/**
 * Reference-station fixtures for the engine behaviour harness (4.29).
 *
 * The engine ships ZERO station-specific logic — every pillar behaviour is
 * driven purely by station data. To prove that, the harness runs the SAME
 * engine against the two reference stations from the Phase 1B brief, whose
 * data differs in every dimension (different disclosure facts + rules,
 * different jargon terms, different question pool, different closing
 * checklist, different critical flag):
 *
 *   1. ITB  — Intrathecal Baclofen pump review (PMR-002). Reconstructed from
 *             the ITB reference behaviours (S1–S9); the silent teach-back fail
 *             is ITB S8.
 *   2. AS   — Axial spondyloarthritis / ankylosing spondylitis counselling
 *             (PLX-PMR-AS-001). Reconstructed from the AS reference behaviours;
 *             the Socratic tutor definition is AS S8, acute anterior uveitis is
 *             the sight-threatening red flag driving the critical flag.
 *
 * These are engine FIXTURES, not the seeded DB stations — they exist to
 * exercise the detectors deterministically and carry no answer-key secrets
 * beyond what a real station's examiner pack would.
 */

import type { StationContent } from "../lib/contracts/station.ts";

// ── Station 1 — Intrathecal Baclofen (ITB) ─────────────────────────────────
export const ITB = {
  EMPATHY: "itb-empathy",
  DIRECT: "itb-direct",
  EXAM: "itb-exam",
} as const;

export const ITB_STATION: StationContent = {
  patient: { name: "Omar Al-Rashid", age: 34, gender: "male", presentation: "spasticity after SCI", personaNotes: "anxious" },
  openingStatement: "Thanks for seeing me, doctor.",
  difficultyTiers: {
    tier1: { concealmentLevel: "explicit", description: "Volunteers history openly" },
    tier2: { concealmentLevel: "partial", description: "Shares when asked directly" },
    tier3: { concealmentLevel: "concealed", description: "Guarded; discloses only to empathic questioning" },
  },
  withheldFacts: [
    { id: ITB.EMPATHY, fact: "Read online that a patient died from pump failure", disclosureRule: "empathy-triggered", tier: 2 },
    { id: ITB.DIRECT, fact: "Once self-reduced oral baclofen and had sweating and confusion", disclosureRule: "direct-question", tier: 2 },
    { id: ITB.EXAM, fact: "There is an old scar on the lower back", disclosureRule: "examination", tier: 1 },
  ],
  questionPool: [
    { id: "qsafe", category: "safety", text: "What happens if the pump suddenly stops?", expectedElements: ["EXP_SAFETY"], checkIn: true },
    { id: "qlife", category: "lifestyle", text: "Will I be able to carry my son again?", expectedElements: ["EXP_LIFE"], checkIn: false },
    { id: "qgen", category: "general", text: "UNSAMPLED_Q", expectedElements: ["EXP_GEN"], checkIn: false },
  ],
  jargonBank: [
    { term: "intrathecal", plainAnalogy: "into the fluid around the spinal cord" },
    { term: "titrate", plainAnalogy: "adjust the dose slowly step by step" },
    { term: "reservoir", plainAnalogy: "the medication tank inside the pump" },
  ],
  closing: { teachBackRequired: true, mustCover: ["Carry the pump ID card at all times", "Refill appointments are not optional"] },
  scoring: {
    domains: [
      { key: "clinical-reasoning", weight: 20 }, { key: "safety", weight: 20 },
      { key: "professionalism", weight: 20 }, { key: "communication", weight: 20 }, { key: "structure", weight: 20 },
    ],
    passThreshold: 65, criticalFlags: [{ id: "cf", description: "no withdrawal warning" }],
  },
  bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
};

export const ITB_SAMPLED = ["qsafe", "qlife"];

// ── Station 2 — Axial spondyloarthritis / ankylosing spondylitis (AS) ───────
export const AS = {
  EMPATHY: "as-empathy",
  EYE: "as-eye",
  EXAM: "as-exam",
} as const;

export const AS_STATION: StationContent = {
  patient: {
    name: "Daniel Fischer",
    age: 27,
    gender: "male",
    presentation: "over a year of low back pain and early-morning stiffness",
    personaNotes: "Fit, plays football; frustrated at being fobbed off as 'just muscular'.",
  },
  openingStatement: "Morning, doctor. My back's been playing up for over a year now.",
  difficultyTiers: {
    tier1: { concealmentLevel: "explicit", description: "Describes the inflammatory pattern openly when asked anything about the pain." },
    tier2: { concealmentLevel: "partial", description: "Gives the stiffness and night-pain story on focused questioning." },
    tier3: { concealmentLevel: "concealed", description: "Downplays it as muscular; the inflammatory picture emerges only with skilful, empathic questioning." },
  },
  withheldFacts: [
    { id: AS.EMPATHY, fact: "He is quietly terrified of ending up hunched over and dependent, like an uncle who had the same condition.", disclosureRule: "empathy-triggered", tier: 2 },
    { id: AS.EYE, fact: "A few months ago he had a red, painful eye that a walk-in clinic treated with eye drops — he never connected it to his back.", disclosureRule: "direct-question", tier: 2 },
    { id: AS.EXAM, fact: "On examination lumbar flexion is reduced and chest expansion is limited.", disclosureRule: "examination", tier: 1 },
  ],
  questionPool: [
    { id: "as-safe", category: "safety", text: "Is there anything that means I should get seen urgently rather than wait?", expectedElements: ["AS_EXP_SAFETY"], checkIn: true },
    { id: "as-life", category: "lifestyle", text: "Will I still be able to play football and keep my job?", expectedElements: ["AS_EXP_LIFE"], checkIn: false },
    { id: "as-gen", category: "general", text: "AS_UNSAMPLED_Q", expectedElements: ["AS_EXP_GEN"], checkIn: false },
  ],
  jargonBank: [
    { term: "ankylosing spondylitis", plainAnalogy: "a type of arthritis that inflames and stiffens the spine over time" },
    { term: "inflammatory", plainAnalogy: "swelling and irritation driven by your immune system rather than wear and tear" },
    { term: "biologic", plainAnalogy: "a newer injected medicine that calms down an overactive immune system" },
  ],
  closing: {
    teachBackRequired: true,
    mustCover: ["Keep active and exercise regularly", "Seek urgent eye review if the eye becomes red and painful"],
  },
  scoring: {
    domains: [
      { key: "clinical-reasoning", weight: 20 }, { key: "safety", weight: 20 },
      { key: "professionalism", weight: 20 }, { key: "communication", weight: 20 }, { key: "structure", weight: 20 },
    ],
    passThreshold: 65,
    criticalFlags: [{ id: "as-cf-uveitis", description: "Fails to advise urgent review for an acute red painful eye (anterior uveitis)." }],
  },
  bridge: { miniCases: [], mcqs: [], pearls: [], frameworks: [] },
};

export const AS_SAMPLED = ["as-safe", "as-life"];
