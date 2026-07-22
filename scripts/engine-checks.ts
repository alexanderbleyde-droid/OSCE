/**
 * Engine behaviour checks (pillars 1-6) — run with: npm run checks:engine
 * Deterministic unit tests over the engine detectors + prompt builder,
 * against a synthetic station exercising all three disclosure rules, the
 * jargon layer, the sampled pool, and the closing protocol.
 */

import type { StationContent } from "../lib/contracts/station.ts";
import type { TranscriptMessage } from "../lib/engine/transcript.ts";
import { evaluateDisclosure } from "../lib/engine/disclosure.ts";
import {
  computeJargonState,
  detectUnexplainedJargon,
  levelForCount,
} from "../lib/engine/jargon.ts";
import { evaluateClosing, buildEndState } from "../lib/engine/closing.ts";
import { buildStandardizedPatientPrompt } from "../lib/engine/prompt-builder.ts";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const WF_EMPATHY = "wf-empathy";
const WF_DIRECT = "wf-direct";
const WF_EXAM = "wf-exam";

const content: StationContent = {
  patient: { name: "Omar Al-Rashid", age: 34, gender: "male", presentation: "spasticity after SCI", personaNotes: "anxious" },
  openingStatement: "Thanks for seeing me, doctor.",
  difficultyTiers: {
    tier1: { concealmentLevel: "explicit", description: "Volunteers history openly" },
    tier2: { concealmentLevel: "partial", description: "Shares when asked directly" },
    tier3: { concealmentLevel: "concealed", description: "Guarded; discloses only to empathic questioning" },
  },
  withheldFacts: [
    { id: WF_EMPATHY, fact: "Read online that a patient died from pump failure", disclosureRule: "empathy-triggered", tier: 2 },
    { id: WF_DIRECT, fact: "Once self-reduced oral baclofen and had sweating and confusion", disclosureRule: "direct-question", tier: 2 },
    { id: WF_EXAM, fact: "There is an old scar on the lower back", disclosureRule: "examination", tier: 1 },
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

const sampled = ["qsafe", "qlife"];

function tx(...candidateTexts: string[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = [{ role: "patient", text: content.openingStatement, at: "" }];
  for (const t of candidateTexts) {
    out.push({ role: "candidate", text: t, at: "" });
    out.push({ role: "patient", text: "(reply)", at: "" });
  }
  return out;
}

// ============ PILLAR 1 — AI DIAL ============
const p1 = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 1, sampledQuestionIds: sampled, transcript: tx() });
const p3 = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 3, sampledQuestionIds: sampled, transcript: tx() });
check("AI Dial: tier1 and tier3 prompts differ", p1.system !== p3.system);
check("AI Dial: tier1 uses explicit/volunteer framing", /volunteer/i.test(p1.system));
check("AI Dial: tier3 uses concealed/guard framing", /conceal|guard/i.test(p3.system));
check("AI Dial: active-tier station description surfaces", p3.system.includes("Guarded; discloses only to empathic questioning"));

// ============ PILLAR 4 — PROGRESSIVE DISCLOSURE ============
const cold = evaluateDisclosure(content.withheldFacts, []);
check("disclosure: cold conversation unlocks nothing", cold.size === 0);

const empathyMsgs = ["I'm so sorry, that must be really frightening for you."];
const afterEmpathy = evaluateDisclosure(content.withheldFacts, empathyMsgs);
check("disclosure: empathy unlocks the empathy-triggered fact", afterEmpathy.has(WF_EMPATHY));
check("disclosure: empathy does NOT unlock the direct-question fact", !afterEmpathy.has(WF_DIRECT));
check("disclosure: empathy does NOT unlock the examination fact", !afterEmpathy.has(WF_EXAM));

const directMsgs = ["Have you ever reduced or stopped your baclofen yourself?"];
const afterDirect = evaluateDisclosure(content.withheldFacts, directMsgs);
check("disclosure: matching direct question unlocks the direct-question fact", afterDirect.has(WF_DIRECT));

const unrelatedMsgs = ["What did you have for breakfast today?"];
const afterUnrelated = evaluateDisclosure(content.withheldFacts, unrelatedMsgs);
check("disclosure: unrelated question does NOT unlock the direct-question fact", !afterUnrelated.has(WF_DIRECT));

// A single shared common word (drug name only) must NOT unlock the fact.
const singleWord = evaluateDisclosure(content.withheldFacts, ["Are you currently taking baclofen?"]);
check("disclosure: single shared keyword does NOT unlock (needs 2 salient overlaps)", !singleWord.has(WF_DIRECT));

// Empathy over-fire guard: a routine clinical question must not unlock.
const routineQ = evaluateDisclosure(content.withheldFacts, ["Is there anything that makes the pain worse?"]);
check("disclosure: routine 'is there anything' question does NOT unlock empathy fact", !routineQ.has(WF_EMPATHY));

// Examination over-fire guard: "for example" must not read as exam intent.
const exampleWord = evaluateDisclosure(content.withheldFacts, ["For example, do you have any allergies?"]);
check("disclosure: 'for example' does NOT unlock the examination fact", !exampleWord.has(WF_EXAM));

const examMsgs = ["I'd like to examine your lower back now, is that okay?"];
const afterExam = evaluateDisclosure(content.withheldFacts, examMsgs);
check("disclosure: examination intent unlocks the examination fact", afterExam.has(WF_EXAM));

// once unlocked, stays unlocked despite later off-topic turns
const persisted = evaluateDisclosure(content.withheldFacts, [...directMsgs, "How's the weather?"]);
check("disclosure: stays unlocked once triggered", persisted.has(WF_DIRECT));

// builder: locked absent, unlocked present
const lockedPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 2, sampledQuestionIds: sampled, transcript: tx("Hello, I'm Dr Smith.") });
check("builder: locked fact text absent", !lockedPrompt.system.includes("died from pump failure") && !lockedPrompt.system.includes("self-reduced oral baclofen"));
const unlockedPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 2, sampledQuestionIds: sampled, transcript: tx("I'm so sorry, that must be frightening.") });
check("builder: unlocked fact text present after trigger", unlockedPrompt.system.includes("died from pump failure"));
check("builder: other locked fact still absent", !unlockedPrompt.system.includes("self-reduced oral baclofen"));

// ============ PILLAR 2 — JARGON ============
check("jargon: unexplained term flagged", detectUnexplainedJargon(content.jargonBank, "We'll use an intrathecal pump.").length === 1);
check("jargon: explained term (same-sentence analogy) not flagged",
  detectUnexplainedJargon(content.jargonBank, "We use an intrathecal approach, meaning into the fluid around the spinal cord.").length === 0);
check("jargon: morphology — 'titrating' flags the 'titrate' term",
  detectUnexplainedJargon(content.jargonBank, "We'll be titrating the dose.").some((e) => e.term === "titrate"));
check("jargon: morphology — 'titration' flags the 'titrate' term",
  detectUnexplainedJargon(content.jargonBank, "The titration takes a few weeks.").some((e) => e.term === "titrate"));
check("jargon: filler 'for instance' is NOT an explanation cue",
  detectUnexplainedJargon(content.jargonBank, "For instance, the reservoir needs refilling.").length === 1);
check("jargon: case-insensitive", detectUnexplainedJargon(content.jargonBank, "The RESERVOIR holds it.").length === 1);
check("jargon: multiple unexplained terms in one turn all count",
  detectUnexplainedJargon(content.jargonBank, "The intrathecal reservoir needs a titrate step.").length === 3);

check("jargon: level mapping 1/2/3/4", levelForCount(1) === "confusion" && levelForCount(2) === "frustration" && levelForCount(3) === "disengagement" && levelForCount(4) === "critical");

const esc = computeJargonState(content.jargonBank, [
  "We'll use an intrathecal pump.",   // +1
  "Then we titrate it.",               // +1
  "The reservoir sits under the skin.", // +1
]);
check("jargon: escalation count accumulates across turns", esc.count === 3 && esc.level === "disengagement");

const escCritical = computeJargonState(content.jargonBank, [
  "intrathecal", "titrate", "reservoir", "intrathecal again",
]);
check("jargon: 4th unexplained term -> critical", escCritical.level === "critical");

// The exact three-term escalation sequence from the live probe (natural
// clinical sentences, each using a term WITHOUT explaining it): must climb
// confusion -> frustration -> disengagement.
const probeSeq = [
  "We'd deliver the baclofen through an intrathecal pump.",
  "We start on a low dose and titrate upward from there.",
  "The reservoir holds several months of medication before a refill.",
];
const s1 = computeJargonState(content.jargonBank, probeSeq.slice(0, 1));
const s2 = computeJargonState(content.jargonBank, probeSeq.slice(0, 2));
const s3 = computeJargonState(content.jargonBank, probeSeq.slice(0, 3));
check("jargon probe: term 1 (intrathecal) -> confusion", s1.count === 1 && s1.level === "confusion");
check("jargon probe: term 2 (titrate) -> frustration", s2.count === 2 && s2.level === "frustration", `got count ${s2.count}`);
check("jargon probe: term 3 (reservoir) -> disengagement", s3.count === 3 && s3.level === "disengagement", `got count ${s3.count}`);

// Incidental analogy-word overlap must NOT read as an explanation.
check("jargon: incidental overlap ('titrate the dose') still flags the term",
  detectUnexplainedJargon(content.jargonBank, "We titrate the dose over time.").some((e) => e.term === "titrate"));
// A genuine full paraphrase IS an explanation.
check("jargon: full paraphrase counts as explained",
  detectUnexplainedJargon(content.jargonBank, "We adjust the dose slowly, step by step — we titrate it.").length === 0);

// The patient prompt must never contain the analogy meaning (no self-explain).
const jargonPrompt = buildStandardizedPatientPrompt({ content, mode: "exam", tier: 2, sampledQuestionIds: sampled, transcript: tx("We'll use an intrathecal pump.") }).system;
check("prompt: lists jargon term but NOT its meaning (no self-explanation)",
  jargonPrompt.includes("intrathecal") && !jargonPrompt.includes("into the fluid around the spinal cord"),
  "the analogy meaning leaked into the patient prompt");
check("prompt: injects the escalation reaction for the current level",
  /unexplained medical word/i.test(jargonPrompt));

const selfCorrect = computeJargonState(content.jargonBank, [
  "We'll use an intrathecal pump.",                                   // +1
  "Sorry — intrathecal means into the fluid around the spinal cord.", // explains the flagged term -> reset
]);
check("jargon: self-correction (explains flagged term) resets the counter", selfCorrect.count === 0 && selfCorrect.level === "none");

// Explaining an UNRELATED term must NOT reset a prior flag.
const noReset = computeJargonState(content.jargonBank, [
  "We'll use an intrathecal pump.",                              // +1 (intrathecal flagged)
  "The reservoir, meaning the tank inside the pump, sits here.", // explains reservoir (never flagged) -> no reset
]);
check("jargon: explaining an unrelated term does NOT reset the counter", noReset.count === 1);

// ============ PILLAR 5 — QUESTION POOL RUNTIME ============
const poolPrompt = p1.system;
check("pool: sampled question text present", poolPrompt.includes("What happens if the pump suddenly stops?") && poolPrompt.includes("carry my son"));
check("pool: unsampled question absent", !poolPrompt.includes("UNSAMPLED_Q"));
check("pool: check-in instruction on checkIn question", /does that make sense|check they've understood/i.test(poolPrompt));

// ============ PILLAR 6 — CLOSING & TEACH-BACK ============
const noClose = evaluateClosing(content, ["What's the pain like?"]);
check("closing: not started without closing language", !noClose.closingStarted && !noClose.teachBackDone);

const closed = evaluateClosing(content, [
  "Before you go, let me recap: carry the pump ID card at all times, and refill appointments are not optional.",
  "Just so I know it's clear, can you tell me back what you'll do if the pump stops?",
]);
check("closing: closing language detected", closed.closingStarted);
check("closing: teach-back detected", closed.teachBackDone);
check("closing: mustCover coverage detected", closed.coveredCount === 2 && closed.totalMustCover === 2);

// Teach-back false-positive guard: a drug-history question must NOT clear the gate.
const historyOnly = evaluateClosing(content, [
  "What have you taken for the spasticity so far?",
  "Before you go, take this leaflet.",
]);
check("closing: drug-history question does NOT count as teach-back", !historyOnly.teachBackDone);

// Closing over-fire guard: an emergency-contact question must NOT start closing.
const contactMid = evaluateClosing(content, ["Who is your emergency contact at home?"]);
check("closing: 'emergency contact' question does NOT start closing", !contactMid.closingStarted);

const endMissed = buildEndState(evaluateClosing(content, ["Before you go, take this leaflet."]));
check("closing: teach-back missing -> silent critical fail recorded", endMissed.teachBackMissedCriticalFail === true);
const endOk = buildEndState(closed);
check("closing: teach-back present -> not a fail", endOk.teachBackMissedCriticalFail === false);

// End state must NOT carry verbatim examiner mustCover text (candidate-readable).
const endJson = JSON.stringify(buildEndState(closed));
check("closing: end state stores NO examiner mustCover text (leak guard)",
  !endJson.includes("Carry the pump ID card") && !endJson.includes("Refill appointments"),
  "mustCover text leaked into persisted end state");

check("closing: patient instructed never to prompt teach-back", /never prompt the doctor to summarise|teach-back/i.test(p1.system));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
