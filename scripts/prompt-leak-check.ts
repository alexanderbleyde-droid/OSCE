/**
 * Prompt-builder leak check — run with: npm run checks:prompt
 * Proves the standardized-patient prompt is assembled from station data
 * and NEVER embeds examiner-only material that would let the model (or a
 * leaked prompt) hand the candidate the answer key:
 *   - scoring domain keys / weights / passThreshold
 *   - critical flag descriptions
 *   - question expectedElements (model answers)
 *   - closing.mustCover (exact teach-back checklist)
 *   - withheld-fact *rules* are included (the SP must know them) but the
 *     builder must gate them, and unsampled pool questions must be absent.
 */

import { buildStandardizedPatientPrompt } from "../lib/engine/prompt-builder.ts";
import type { StationContent } from "../lib/contracts/station.ts";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

const content: StationContent = {
  patient: {
    name: "Omar Al-Rashid",
    age: 34,
    gender: "male",
    presentation: "Severe generalized spasticity after T6 spinal cord injury",
    personaNotes: "Anxious about surgery; wants to hold his son without spasms",
  },
  openingStatement: "Thanks for seeing me, doctor.",
  difficultyTiers: {
    tier1: { concealmentLevel: "explicit", description: "Volunteers readily" },
    tier2: { concealmentLevel: "partial", description: "On focused questioning" },
    tier3: { concealmentLevel: "concealed", description: "SECRET_TIER3_CONCEALMENT_DESIGN" },
  },
  withheldFacts: [
    { id: "wf1", fact: "Read online that a patient died from pump failure", disclosureRule: "empathy-triggered", tier: 2 },
    { id: "wf2", fact: "Once self-reduced oral baclofen and got confused", disclosureRule: "direct-question", tier: 2 },
  ],
  questionPool: [
    { id: "qs1", category: "safety", text: "Is it true a pump can just fail?", expectedElements: ["EXPECTED_WITHDRAWAL_WARNING_ANSWER"], checkIn: true },
    { id: "ql1", category: "lifestyle", text: "Can I still travel and fly?", expectedElements: ["EXPECTED_CARRY_CARD_ANSWER"], checkIn: false },
    { id: "qg1", category: "general", text: "UNSAMPLED_QUESTION_TEXT", expectedElements: ["UNSAMPLED_EXPECTED"], checkIn: false },
  ],
  jargonBank: [
    { term: "intrathecal", plainAnalogy: "into the fluid around the spinal cord" },
  ],
  closing: { teachBackRequired: true, mustCover: ["SECRET_MUSTCOVER_ER_WARNING", "SECRET_MUSTCOVER_CARD"] },
  scoring: {
    domains: [
      { key: "clinical-reasoning", weight: 20 }, { key: "safety", weight: 20 },
      { key: "professionalism", weight: 20 }, { key: "communication", weight: 20 },
      { key: "structure", weight: 20 },
    ],
    passThreshold: 65,
    criticalFlags: [{ id: "cf1", description: "SECRET_CRITICAL_no_withdrawal_warning" }],
  },
  bridge: {
    miniCases: [{ id: "m1", title: "SECRET_BRIDGE_TITLE", scenario: "s", prompt: "p", debrief: "SECRET_DEBRIEF" }],
    mcqs: [{ id: "mc1", question: "q", options: ["a", "b"], correctIndex: 1, explanation: "SECRET_MCQ_EXPLANATION" }],
    pearls: [], frameworks: [],
  },
};

const built = buildStandardizedPatientPrompt({
  content,
  mode: "exam",
  tier: 3,
  sampledQuestionIds: ["qs1", "ql1"], // qg1 NOT sampled
  transcript: [{ role: "candidate", text: "Hello, I'm Dr Smith.", at: "" }],
});

const haystack = built.system + "\n" + built.messages.map((m) => m.content).join("\n");

// ----- MUST be present (candidate-safe SP material) -----
check("includes patient name", haystack.includes("Omar Al-Rashid"));
check("includes presentation", haystack.includes("Severe generalized spasticity"));
check("includes persona notes", haystack.includes("hold his son"));
check("includes active tier-3 concealment framing", haystack.includes("SECRET_TIER3_CONCEALMENT_DESIGN"));
// Progressive disclosure: with a COLD transcript (no empathy, no matching
// direct question), BOTH withheld facts stay locked and must be absent —
// the model is never handed a fact it hasn't earned.
check("EXCLUDES locked withheld facts (no trigger yet)",
  !haystack.includes("died from pump failure") && !haystack.includes("self-reduced oral baclofen"),
  "a locked withheld fact leaked into the prompt");
check("notes that information is being held back (no fabrication)",
  haystack.toLowerCase().includes("holding back") || haystack.toLowerCase().includes("not ready to share"));
// The patient is told which terms it won't understand, but is NEVER handed
// the plain-language meaning (or it would recite it and defeat the test).
check("includes jargon term", haystack.includes("intrathecal"));
check("EXCLUDES the jargon analogy/meaning from the patient prompt",
  !haystack.includes("into the fluid around the spinal cord"),
  "the patient prompt handed the model the plain-language meaning");
check("includes sampled question text", haystack.includes("pump can just fail") && haystack.includes("travel and fly"));
check("prior transcript replayed as messages", built.messages.some((m) => m.role === "user" && m.content.includes("Dr Smith")));

// ----- MUST NOT be present (examiner-only answer key) -----
check("EXCLUDES expected-element model answers",
  !haystack.includes("EXPECTED_WITHDRAWAL_WARNING_ANSWER") && !haystack.includes("EXPECTED_CARRY_CARD_ANSWER"),
  "expected answers leaked into the SP prompt");
check("EXCLUDES closing mustCover checklist",
  !haystack.includes("SECRET_MUSTCOVER_ER_WARNING") && !haystack.includes("SECRET_MUSTCOVER_CARD"),
  "teach-back checklist leaked");
check("EXCLUDES scoring domain keys / weights",
  !haystack.includes("clinical-reasoning") && !haystack.includes("passThreshold") && !haystack.includes("weight"),
  "scoring rubric leaked");
check("EXCLUDES critical flag descriptions",
  !haystack.includes("SECRET_CRITICAL_no_withdrawal_warning"),
  "critical flags leaked");
check("EXCLUDES bridge assets", !haystack.includes("SECRET_BRIDGE_TITLE") && !haystack.includes("SECRET_MCQ_EXPLANATION"),
  "bridge material leaked");
check("EXCLUDES unsampled pool question + its expected elements",
  !haystack.includes("UNSAMPLED_QUESTION_TEXT") && !haystack.includes("UNSAMPLED_EXPECTED"),
  "unsampled question leaked");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
